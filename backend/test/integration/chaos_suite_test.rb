# frozen_string_literal: true

require "test_helper"
require "net/http"
require "json"

class ChaosSuiteTest < ActionDispatch::IntegrationTest
  BUGGY_COUPON_CODE = <<~TYPESCRIPT
    export class CartService {
      public static applyCoupon(cartId: string, couponCode: string) {
        const promoConfig: any = { tieredRates: {} };
        const rateConfig = promoConfig.tieredRates[coupon.tier]; // undefined
        return (100 * rateConfig.multiplier) / 100;
      }
    }
  TYPESCRIPT

  setup do
    AiSre::GitProvider.reset!
    if AiSre::GitProvider.current.is_a?(AiSre::LocalGitProvider)
      AiSre::GitProvider.current.set_virtual_file("src/services/cart.service.ts", BUGGY_COUPON_CODE)
    end
    @auth = services(:auth)
    @catalog = services(:catalog)
    @cart = services(:cart)
    @checkout = services(:checkout)
  end

  teardown do
    AiSre::GitProvider.reset!
  end

  # =========================================================================
  # CRITERION 1: Healthy Backend Shopping Endpoints (Auth, Catalog, Cart, Checkout)
  # =========================================================================
  test "AC1: verifies all shopping endpoints return HTTP 200 OK against healthy backend" do
    with_bridge_mock do
      # 1. Appsolve Public Status API confirms all systems operational
      get "/api/v1/services", as: :json
      assert_response :success
      json = JSON.parse(response.body)
      assert_equal "all_operational", json["system_status"]

      service_slugs = json["services"].map { |s| s["slug"] }
      assert_includes service_slugs, "auth"
      assert_includes service_slugs, "catalog"
      assert_includes service_slugs, "cart"
      assert_includes service_slugs, "checkout"

      # 2. SRE Bridge Health Check verifies HTTP 200 across all shopping subsystems
      client = AiSre::SreBridgeClient.new
      health = client.health_check
      assert_equal "success", health[:status]
      assert health.dig(:data, :healthy)
      assert_equal 200, health.dig(:data, :auth)
      assert_equal 200, health.dig(:data, :catalog)
      assert_equal 200, health.dig(:data, :cart)
      assert_equal 200, health.dig(:data, :checkout)
    end
  end

  # =========================================================================
  # CRITERION 2: SEV-2 Coupon Bug Telemetry, GitHub Branch/PR, Merge & Fix Verification
  # =========================================================================
  test "AC2: SEV-2 coupon bug injection produces telemetry signal, triggers GitHub branch/PR, merges PR, and restores 200 OK" do
    with_bridge_mock do
      # 1. Ingest SEV-2 telemetry signal from QuickCart error forwarder
      post "/api/v1/telemetry/signals", params: {
        service_slug: "cart",
        error_code: "ERR_COUPON_CALCULATION",
        message: "TypeError: Cannot read properties of undefined (reading 'multiplier')",
        severity: "SEV-2",
        raw_payload: {
          source_file: "src/services/cart.service.ts",
          line_number: 215,
          stack_trace: "TypeError: Cannot read properties of undefined (reading 'multiplier')\n    at CartService.applyCoupon (src/services/cart.service.ts:215:37)"
        }
      }, as: :json

      assert_response :created
      json = JSON.parse(response.body)
      incident = json["incident"]
      incident_id = incident["id"]

      # Verify SEV-2 Triage & Guardrail
      assert_equal "SEV-2", incident["severity"]
      assert_equal "approval_required", incident["autonomy_mode"]
      assert_equal "investigating", incident["status"]

      # Verify Stage 1 Proposal ActionCard
      proposal_card = incident["action_card"]
      assert_not_nil proposal_card
      assert_equal "plan_proposal", proposal_card["plan_stage"]
      assert_equal "src/services/cart.service.ts", proposal_card["affected_file"]

      # 2. Engineer approves Stage 1 plan -> Generates code patch & opens PR
      post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
        approved_by: "Ahmet (Senior SRE Lead)",
        plan_id: proposal_card["plan_id"]
      }, as: :json

      assert_response :success
      action_card = JSON.parse(response.body)["incident"]["action_card"]
      assert_not_nil action_card
      assert_equal "pr_review", action_card["plan_stage"]
      assert_match(/^appsolve\/fix-/, action_card["github_branch"])
      assert_kind_of Integer, action_card["github_pr_number"]
      assert_includes action_card["github_pr_url"], "/pull/#{action_card['github_pr_number']}"
      assert_equal "src/services/cart.service.ts", action_card["affected_file"]
      assert_equal "pending", action_card["merge_status"]
      assert_includes action_card["diff_content"], "--- a/src/services/cart.service.ts"
      assert_includes action_card["diff_content"], "+++ b/src/services/cart.service.ts"

      # 3. Engineer approves Stage 2 PR -> Merges PR & dispatches sync_source via Bridge
      post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
        approved_by: "Ahmet (Senior SRE Lead)",
        plan_id: action_card["plan_id"]
      }, as: :json

      assert_response :success
      approval_json = JSON.parse(response.body)
      assert_equal "executed", approval_json["status"]

      # 4. Verify Incident resolved, PR merged, and Bridge sync executed
      resolved_incident = approval_json["incident"]
      assert_equal "resolved", resolved_incident["status"]
      assert_not_nil resolved_incident["resolved_at"]

      resolved_card = resolved_incident["action_card"]
      assert_equal "merged", resolved_card["merge_status"]
      assert_not_nil resolved_card["merge_commit_sha"]
      assert_equal "sync_source", resolved_card["sre_bridge_action"]
      assert_equal "operational", @cart.reload.status
    end
  end

  # =========================================================================
  # CRITERION 3: SEV-1 Database Deadlock, Remote Bridge Diagnostics & Lock Termination
  # =========================================================================
  test "AC3: SEV-1 checkout deadlock triggers incident, bridge diagnoses lock, terminates lock, and restores checkout" do
    with_bridge_mock do
      # 1. Ingest SEV-1 DB lock signal
      post "/api/v1/telemetry/signals", params: {
        service_slug: "checkout",
        error_code: "ERR_DB_LOCK_TIMEOUT",
        message: "SQLITE_BUSY: database table payment_records locked waiting on PID 4821",
        severity: "SEV-1",
        metrics: { "error_rate" => 0.95 }
      }, as: :json

      assert_response :created
      json = JSON.parse(response.body)
      incident = json["incident"]
      incident_id = incident["id"]

      # Verify SEV-1 Triage & Guardrail
      assert_equal "SEV-1", incident["severity"]
      assert_equal "manual_command_only", incident["autonomy_mode"]

      # Verify War Room ActionCard incorporates Bridge diagnostic
      action_card = incident["action_card"]
      assert_not_nil action_card
      assert_includes action_card["tool_name"], "kill_db_locks"
      assert_equal "inspect_db_locks", action_card["sre_bridge_action"]

      # 2. Engineer approves plan -> Dispatches kill_db_locks via Bridge
      post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
        approved_by: "Deniz (On-Call SRE)",
        plan_id: action_card["plan_id"]
      }, as: :json

      assert_response :success
      approval_json = JSON.parse(response.body)
      assert_equal "executed", approval_json["status"]
      assert_equal "resolved", approval_json["incident"]["status"]

      approved_card = approval_json["incident"]["action_card"]
      assert_equal "kill_db_locks", approved_card["sre_bridge_action"]
      assert_equal "operational", @checkout.reload.status
    end
  end

  # =========================================================================
  # CRITERION 4: SEV-3 Cache Bloat Autonomous Remediation & Latency Normalization
  # =========================================================================
  test "AC4: SEV-3 cache bloat triggers autonomous remediation without manual approval and clears cache" do
    with_bridge_mock do
      # 1. Ingest SEV-3 cache bloat signal
      post "/api/v1/telemetry/signals", params: {
        service_slug: "catalog",
        error_code: "ERR_CACHE_BLOAT",
        message: "Image and thumbnail catalog cache bloat exceeded watermark: 12,000 entries (memory pressure 94%)",
        severity: "SEV-3"
      }, as: :json

      assert_response :created
      json = JSON.parse(response.body)
      incident = json["incident"]

      # Verify Immediate Autonomous Execution without human approval
      assert_equal "SEV-3", incident["severity"]
      assert_equal "full_autonomy", incident["autonomy_mode"]
      assert_equal "resolved", incident["status"]
      assert_not_nil incident["resolved_at"]

      # Verify Bridge purge_cache was executed autonomously
      action_card = incident["action_card"]
      assert_not_nil action_card
      assert_equal "purge_cache", action_card["sre_bridge_action"]
      assert_equal "operational", @catalog.reload.status
    end
  end

  private

  # Helper to mock QuickCart SRE bridge in isolated test environments
  def with_bridge_mock
    original_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) do |host, port, *args|
      if port.to_i == 4000
        mock = Object.new
        mock.define_singleton_method(:use_ssl=) { |_| }
        mock.define_singleton_method(:read_timeout=) { |_| }
        mock.define_singleton_method(:open_timeout=) { |_| }
        mock.define_singleton_method(:request) do |req|
          body = JSON.parse(req.body) rescue {}
          cmd = body["command"].to_s
          resp_data = case cmd
          when "inspect_db_locks"
            { status: "success", command: cmd, output: "1 active blocking transaction detected on table 'payment_records' (PID: 4821)", data: { active_locks: 1, blocking_pid: 4821, status: "BLOCKED" } }
          when "kill_db_locks"
            { status: "success", command: cmd, output: "Terminated hanging transaction thread PID 4821. Released row-level locks.", data: { terminated_transactions: 1, killed_locks: 1, pool_reset: true } }
          when "inspect_cache"
            { status: "success", command: cmd, output: "Catalog in-memory cache size: 12000 entries. Memory pressure: CRITICAL", data: { total_keys: 12000, bloat_detected: true, pressure: "CRITICAL" } }
          when "purge_cache"
            { status: "success", command: cmd, output: "Purged 12000 catalog cache entries. Memory pressure normalized.", data: { purged_keys: 12000, current_pressure: "NORMAL" } }
          when "sync_source"
            { status: "success", command: cmd, output: "Source file safely synced and reloaded.", data: { status: "synced_and_reloaded" } }
          when "health_check"
            { status: "success", command: cmd, output: "All QuickCart subsystem services operational.", data: { healthy: true, auth: 200, catalog: 200, cart: 200, checkout: 200 } }
          else
            { status: "success", command: cmd, output: "Executed #{cmd}", data: {} }
          end
          res = Net::HTTPSuccess.new("1.1", "200", "OK")
          res.define_singleton_method(:body) { resp_data.to_json }
          res.define_singleton_method(:code) { "200" }
          res
        end
        mock
      else
        original_new.call(host, port, *args)
      end
    end
    yield
  ensure
    Net::HTTP.define_singleton_method(:new, original_new)
  end
end
