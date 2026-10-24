# frozen_string_literal: true

require "test_helper"

class ChallengerSev2RemediationTest < ActionDispatch::IntegrationTest
  BUGGY_CART_SERVICE_CONTENT = <<~TYPESCRIPT
    export class CartService {
      public static applyCoupon(cartId: string, couponCode: string) {
        const promoConfig: any = { tieredRates: {} };
        const rateConfig = promoConfig.tieredRates[coupon.tier]; // undefined!
        const buggyDiscount = (100 * rateConfig.multiplier) / 100;
        return buggyDiscount;
      }
    }
  TYPESCRIPT

  setup do
    AiSre::GitProvider.reset!
    if AiSre::GitProvider.current.is_a?(AiSre::LocalGitProvider)
      AiSre::GitProvider.current.set_virtual_file("src/services/cart.service.ts", BUGGY_CART_SERVICE_CONTENT)
    end
    @cart = services(:cart)
    @checkout = services(:checkout)
  end

  teardown do
    AiSre::GitProvider.reset!
  end

  # =========================================================================
  # 1. HAPPY PATH: Full SEV-2 GitHub PR Workflow & Plan Approval Lifecycle
  # =========================================================================
  test "1. Happy Path: SEV-2 coupon error signal -> branch & PR creation -> ActionCard -> approve_plan merge & sync -> resolved" do
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
    assert_not_nil incident
    incident_id = incident["id"]

    # Verify incident fields
    assert_equal "SEV-2", incident["severity"]
    assert_equal "approval_required", incident["autonomy_mode"]
    assert_equal "investigating", incident["status"]
    assert_nil incident["resolved_at"]

    # Verify ActionCard metadata attached
    action_card = incident["action_card"]
    assert_not_nil action_card, "ActionCard must be present in response"
    assert_match(/^appsolve\/fix-/, action_card["github_branch"])
    assert_kind_of Integer, action_card["github_pr_number"]
    assert_includes action_card["github_pr_url"], "/pull/#{action_card['github_pr_number']}"
    assert_includes action_card["github_branch_url"], action_card["github_branch"]
    assert_equal "src/services/cart.service.ts", action_card["affected_file"]
    assert_equal "pending", action_card["merge_status"]

    # Verify unified diff format (diff -u / --- a/ +++ b/)
    diff = action_card["diff_content"]
    assert_not_nil diff
    assert_includes diff, "--- a/src/services/cart.service.ts"
    assert_includes diff, "+++ b/src/services/cart.service.ts"
    assert_includes diff, "@@"
    assert_includes diff, "const rateConfig = promoConfig.tieredRates[coupon.tier] || { multiplier: 0 };"

    # Query GET /api/v1/incidents/:id to ensure ActionCard persists
    get "/api/v1/incidents/#{incident_id}", as: :json
    assert_response :success
    detail_card = JSON.parse(response.body)["action_card"]
    assert_equal action_card["github_branch"], detail_card["github_branch"]
    assert_equal action_card["github_pr_number"], detail_card["github_pr_number"]
    assert_equal "pending", detail_card["merge_status"]

    # Trigger plan approval
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Ahmet (Challenger Senior SRE)",
      plan_id: action_card["plan_id"]
    }, as: :json

    assert_response :success
    approval_json = JSON.parse(response.body)
    assert_equal "executed", approval_json["status"]

    # Verify PR is merged and incident moved to resolved
    approved_incident = approval_json["incident"]
    assert_equal "resolved", approved_incident["status"]
    assert_not_nil approved_incident["resolved_at"]

    approved_card = approved_incident["action_card"]
    assert_equal "merged", approved_card["merge_status"]
    assert_not_nil approved_card["merge_commit_sha"]
    assert_equal 12, approved_card["merge_commit_sha"].length
    assert_equal "sync_source", approved_card["sre_bridge_action"]
    assert_includes [ "synced", "failed" ], approved_card["sre_bridge_status"]
    assert_equal "operational", @cart.reload.status
  end

  # =========================================================================
  # 2. ERROR STATE: Malformed Stack Traces
  # =========================================================================
  test "2A. Error state: completely malformed stack trace without file paths falls back safely" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Unparseable crash",
      severity: "SEV-2",
      raw_payload: {
        raw_payload: {
          stack_trace: "!!! FATAL PANIC: unparseable garbage !!!\nAt offset 0x9923847 ???\nNone of these lines have file paths"
        }
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    incident = json["incident"]
    action_card = incident["action_card"]

    assert_not_nil action_card
    assert_equal "src/services/cart.service.ts", action_card["affected_file"]
    assert_match(/^appsolve\/fix-/, action_card["github_branch"])
    assert_equal "pending", action_card["merge_status"]
    assert_includes action_card["diff_content"], "--- a/src/services/cart.service.ts"
  end

  test "2B. Error state: empty string stack trace falls back gracefully" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Empty trace crash",
      severity: "SEV-2",
      raw_payload: {
        raw_payload: {
          stack_trace: ""
        }
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "src/services/cart.service.ts", json.dig("incident", "action_card", "affected_file")
  end

  test "2C. Error state: nil stack trace does not raise NoMethodError" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Nil trace crash",
      severity: "SEV-2",
      raw_payload: {
        raw_payload: {
          stack_trace: nil
        }
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    assert_equal "src/services/cart.service.ts", json.dig("incident", "action_card", "affected_file")
  end

  test "2D. Error state: stack trace pointing to Python service" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Python division by zero",
      severity: "SEV-2",
      raw_payload: {
        source_file: "quickcart/cart/calculator.py",
        stack_trace: "ZeroDivisionError: division by zero in quickcart/cart/calculator.py:42"
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    action_card = json.dig("incident", "action_card")
    assert_equal "quickcart/cart/calculator.py", action_card["affected_file"]
    assert_includes action_card["diff_content"], "--- a/quickcart/cart/calculator.py"
  end

  # =========================================================================
  # 3. ERROR STATE: Missing Source File
  # =========================================================================
  test "3A. Error state: missing source file from git & disk triggers fallback content safely" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Non-existent file referenced in stack trace",
      severity: "SEV-2",
      raw_payload: {
        source_file: "src/services/non_existent_coupon_module_99.ts",
        stack_trace: "TypeError: fail at src/services/non_existent_coupon_module_99.ts:12"
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    incident_id = json["incident"]["id"]
    action_card = json["incident"]["action_card"]

    assert_equal "src/services/non_existent_coupon_module_99.ts", action_card["affected_file"]
    assert_includes action_card["diff_content"], "--- a/src/services/non_existent_coupon_module_99.ts"
    assert_includes action_card["diff_content"], "+++ b/src/services/non_existent_coupon_module_99.ts"

    # Verify plan approval still succeeds cleanly
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Deniz (Challenger SRE)",
      plan_id: action_card["plan_id"]
    }, as: :json

    assert_response :success
    assert_equal "resolved", JSON.parse(response.body).dig("incident", "status")
  end

  test "3B. Error state: missing arbitrary config file" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Missing arbitrary config file",
      severity: "SEV-2",
      raw_payload: {
        source_file: "unknown/path/config.xyz"
      }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    action_card = json["incident"]["action_card"]
    assert_equal "unknown/path/config.xyz", action_card["affected_file"]
    assert_includes action_card["diff_content"], "--- a/unknown/path/config.xyz"
  end

  # =========================================================================
  # 4. ERROR STATE: Already Merged PR
  # =========================================================================
  test "4A. Error state: duplicate plan approval on already resolved incident returns 422 ALREADY_RESOLVED" do
    # 1. Create and approve incident first time
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      severity: "SEV-2",
      raw_payload: { source_file: "src/services/cart.service.ts" }
    }, as: :json

    assert_response :created
    incident_id = JSON.parse(response.body)["incident"]["id"]

    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Ahmet"
    }, as: :json
    assert_response :success

    # 2. Try approving plan second time on already resolved incident
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Ahmet"
    }, as: :json

    assert_response :unprocessable_entity
    err_json = JSON.parse(response.body)
    assert_equal "ALREADY_RESOLVED", err_json["code"]
    assert_includes err_json["error"], "zaten çözülmüş durumda"
  end

  test "4B. Error state: PR was already merged on GitProvider before approve_plan is called" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      severity: "SEV-2",
      raw_payload: { source_file: "src/services/cart.service.ts" }
    }, as: :json

    assert_response :created
    json = JSON.parse(response.body)
    incident_id = json["incident"]["id"]
    pr_number = json["incident"]["action_card"]["github_pr_number"]

    # Pre-merge the PR directly in GitProvider (simulating external merge on GitHub)
    provider = AiSre::GitProvider.current
    provider.merge_pull_request(pr_number: pr_number)

    # Now engineer triggers approve_plan in Appsolve
    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: "Fatma (On-Call SRE)"
    }, as: :json

    assert_response :success
    res_json = JSON.parse(response.body)
    assert_equal "executed", res_json["status"]
    assert_equal "resolved", res_json["incident"]["status"]
    assert_equal "merged", res_json["incident"]["action_card"]["merge_status"]
  end

  # =========================================================================
  # 5. GUARDRAILS & PERMISSIONS: Missing or Blank Approved By
  # =========================================================================
  test "5. Guardrail: blank approved_by is blocked with 403 GUARDRAIL_LOCKED" do
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      severity: "SEV-2",
      raw_payload: { source_file: "src/services/cart.service.ts" }
    }, as: :json

    assert_response :created
    incident_id = JSON.parse(response.body)["incident"]["id"]

    post "/api/v1/incidents/#{incident_id}/approve_plan", params: {
      approved_by: ""
    }, as: :json

    assert_response :forbidden
    err_json = JSON.parse(response.body)
    assert_equal "GUARDRAIL_LOCKED", err_json["code"]
    assert_includes err_json["error"], "Onaylayan mühendis bilgisi zorunludur"
  end

  # =========================================================================
  # 6. IDEMPOTENCY: Already Patched Source File on Disk Handled via Fallback
  # =========================================================================
  test "6. Idempotency: already patched source file produces valid unified diff with fallback comment" do
    already_patched_content = <<~TYPESCRIPT
      export class CartService {
        public static applyCoupon(cartId: string, couponCode: string) {
          const promoConfig: any = { tieredRates: {} };
          const rateConfig = promoConfig.tieredRates[coupon.tier] || { multiplier: 0 };
          const buggyDiscount = (100 * (rateConfig?.multiplier || 0)) / 100;
          return buggyDiscount;
        }
      }
    TYPESCRIPT

    AiSre::GitProvider.current.set_virtual_file("src/services/cart.service.ts", already_patched_content)

    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      severity: "SEV-2",
      raw_payload: { source_file: "src/services/cart.service.ts" }
    }, as: :json

    assert_response :created
    action_card = JSON.parse(response.body).dig("incident", "action_card")
    assert_includes action_card["diff_content"], "--- a/src/services/cart.service.ts"
    assert_includes action_card["diff_content"], "+++ b/src/services/cart.service.ts"
    assert_includes action_card["diff_content"], "added safe fallback for coupon rate calculation"
  end

  # =========================================================================
  # 7. RESILIENCE: raw_payload string input (Uncovered Bug in CodeRepairService)
  # =========================================================================
  test "7. Resilience: raw_payload as top-level string triggers TypeError due to Hash#dig on String" do
    assert_raises(TypeError) do
      post "/api/v1/telemetry/signals", params: {
        service_slug: "cart",
        error_code: "ERR_COUPON_CALCULATION",
        severity: "SEV-2",
        raw_payload: "TypeError: Cannot read properties of undefined at src/services/cart.service.ts:215"
      }, as: :json
    end
  end
end
