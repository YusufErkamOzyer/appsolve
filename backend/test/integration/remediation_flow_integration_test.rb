# frozen_string_literal: true

require "test_helper"

class RemediationFlowIntegrationTest < ActionDispatch::IntegrationTest
  setup do
    AiSre::GitProvider.reset!
    @cart = services(:cart)
    @checkout = services(:checkout)
    @catalog = services(:catalog)
  end

  teardown do
    AiSre::GitProvider.reset!
  end

  test "SEV-2 full remediation flow: signal -> PR creation -> War Room ActionCard -> approve_plan merge & sync -> resolved" do
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
    incident_id = json["incident"]["id"]
    assert_equal "SEV-2", json["incident"]["severity"]
    assert_equal "approval_required", json["incident"]["autonomy_mode"]

    # Verify ActionCard metadata in response
    action_card = json["incident"]["action_card"]
    assert_not_nil action_card
    assert_not_nil action_card["github_branch"]
    assert_not_nil action_card["github_pr_number"]
    assert_not_nil action_card["github_pr_url"]
    assert_equal "pending", action_card["merge_status"]
    assert_includes action_card["diff_content"], "--- a/src/services/cart.service.ts"
    assert_includes action_card["diff_content"], "+++ b/src/services/cart.service.ts"

    # 2. Query GET /api/v1/incidents/:id and verify enhanced ActionCard fields are present
    get "/api/v1/incidents/#{incident_id}", as: :json
    assert_response :success
    detail_json = JSON.parse(response.body)
    detail_card = detail_json["action_card"]
    assert_not_nil detail_card
    assert_equal action_card["github_branch"], detail_card["github_branch"]
    assert_equal action_card["github_pr_number"], detail_card["github_pr_number"]
    assert_equal action_card["github_pr_url"], detail_card["github_pr_url"]
    assert_equal "src/services/cart.service.ts", detail_card["affected_file"]
    assert_equal "pending", detail_card["merge_status"]

    # 3. Engineer approves plan: POST /api/v1/incidents/:id/approve_plan
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Ahmet (Senior SRE)",
      plan_id: detail_card["plan_id"]
    }, as: :json

    assert_response :success
    approval_json = JSON.parse(response.body)
    assert_equal "executed", approval_json["status"]

    # 4. Verify Incident is resolved and ActionCard shows merged & synced
    approved_incident = approval_json["incident"]
    assert_equal "resolved", approved_incident["status"]
    assert_not_nil approved_incident["resolved_at"]

    approved_card = approved_incident["action_card"]
    assert_equal "merged", approved_card["merge_status"]
    assert_not_nil approved_card["merge_commit_sha"]
    assert_equal "sync_source", approved_card["sre_bridge_action"]
    assert_equal "operational", @cart.reload.status
  end

  test "SEV-1 full remediation flow: signal -> DB lock triage -> War Room diagnostics -> approve_plan kill_locks -> resolved" do
    # 1. Ingest SEV-1 DB lock signal
    post "/api/v1/telemetry/signals", params: {
      service_slug: "checkout",
      error_code: "ERR_DB_LOCK_TIMEOUT",
      message: "Database row lock deadlock timeout on payment_records",
      severity: "SEV-1",
      metrics: { "error_rate" => 0.94 }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    incident_id = json["incident"]["id"]
    assert_equal "SEV-1", json["incident"]["severity"]
    assert_equal "manual_command_only", json["incident"]["autonomy_mode"]

    # 2. Verify ActionCard has inspect_db_locks diagnostic info
    action_card = json["incident"]["action_card"]
    assert_not_nil action_card
    assert_includes action_card["tool_name"], "kill_db_locks"

    # 3. Engineer approves plan: POST /api/v1/incidents/:id/approve_plan
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Deniz (On-Call SRE)",
      plan_id: action_card["plan_id"]
    }, as: :json

    assert_response :success
    approval_json = JSON.parse(response.body)
    assert_equal "executed", approval_json["status"]
    assert_equal "resolved", approval_json["incident"]["status"]
    assert_equal "operational", @checkout.reload.status
  end

  test "SEV-3 full remediation flow: signal -> autonomous cache purge without engineer approval -> resolved" do
    # 1. Ingest SEV-3 cache bloat signal
    post "/api/v1/telemetry/signals", params: {
      service_slug: "catalog",
      error_code: "ERR_CACHE_BLOAT",
      message: "Catalog in-memory cache bloat detected: memory pressure 93%",
      severity: "SEV-3"
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    incident = json["incident"]

    # Verify autonomous immediate resolution
    assert_equal "SEV-3", incident["severity"]
    assert_equal "full_autonomy", incident["autonomy_mode"]
    assert_equal "resolved", incident["status"]
    assert_not_nil incident["resolved_at"]

    action_card = incident["action_card"]
    assert_not_nil action_card
    assert_equal "purge_cache", action_card["sre_bridge_action"]
    assert_equal "purged", action_card["sre_bridge_status"]
    assert_equal "operational", @catalog.reload.status
  end
end
