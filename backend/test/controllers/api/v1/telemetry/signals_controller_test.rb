require "test_helper"

class Api::V1::Telemetry::SignalsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
  end

  test "POST /api/v1/telemetry/signals performs full triage and returns guardrails" do
    payload = {
      service_slug: "checkout",
      error_code: "HTTP_504_DB_LOCK",
      message: "Payment gateway threads locked.",
      metrics: {
        error_rate: 0.95,
        p99_latency_ms: 12000
      }
    }

    assert_difference("Incident.count", 1) do
      post api_v1_telemetry_signals_url, params: payload, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)

    assert_equal "accepted", json["status"]
    inc_data = json["incident"]
    assert_not_nil inc_data
    assert_equal "SEV-1", inc_data["severity"]
    assert_equal "manual_command_only", inc_data["autonomy_mode"]
    assert_equal "on_call_and_team_lead", inc_data["escalation_target"]
    assert_not_nil inc_data["reasoning"]
    assert_not_nil inc_data["hypothesis"]
    assert_equal "outage", inc_data["service_status"]

    events = inc_data["events"]
    assert events.length >= 4
    event_types = events.map { |e| e["event_type"] }
    assert_includes event_types, "signal_received"
    assert_includes event_types, "ai_triage_completed"
    assert_includes event_types, "guardrail_locked"
    assert_includes event_types, "escalation_triggered"
  end

  test "POST /api/v1/telemetry/signals triages SEV-2 cart coupon failure" do
    payload = {
      service_slug: "cart",
      error_code: "REDIS_COUPON_NAN",
      message: "Cart promotion engine received NaN for percentage calculation.",
      metrics: { error_rate: 0.28 }
    }

    post api_v1_telemetry_signals_url, params: payload, as: :json
    assert_response :created

    json = JSON.parse(response.body)
    inc_data = json["incident"]
    assert_equal "SEV-2", inc_data["severity"]
    assert_equal "approval_required", inc_data["autonomy_mode"]
    assert_equal "on_call_engineer", inc_data["escalation_target"]
  end

  test "POST /api/v1/telemetry/signals handles SEV-3 with autonomous resolution" do
    payload = {
      service_slug: "catalog",
      error_code: "CDN_CACHE_BLOAT",
      message: "Product image thumbnail cache memory pressure exceeded 92%.",
      metrics: { error_rate: 0.04 }
    }

    post api_v1_telemetry_signals_url, params: payload, as: :json
    assert_response :created

    json = JSON.parse(response.body)
    inc_data = json["incident"]
    assert_equal "SEV-3", inc_data["severity"]
    assert_equal "full_autonomy", inc_data["autonomy_mode"]
    assert_equal "resolved", inc_data["status"]
    assert_not_nil inc_data["resolved_at"]

    action_msg = inc_data["messages"].find { |m| m["message_type"] == "action_card" }
    assert_not_nil action_msg
    assert_equal "autonomous_executed", action_msg["action_status"]
  end

  test "POST /api/v1/telemetry/signals bypasses AI when AI is disconnected (Token Saving Mode)" do
    AiSre::AutomationConfig.ai_connected = false

    payload = {
      service_slug: "cart",
      error_code: "ERR_COUPON_CALCULATION",
      message: "Cannot read properties of undefined (reading 'multiplier')"
    }

    assert_no_difference("PostMortem.count") do
      post api_v1_telemetry_signals_url, params: payload, as: :json
    end

    assert_response :created
    json = JSON.parse(response.body)

    assert_equal true, json["ai_automation_skipped"]
    assert_includes json["message"], "Token Tasarrufu"
    inc_data = json["incident"]
    assert_equal "SEV-2", inc_data["severity"]
    assert_equal "manual_command_only", inc_data["autonomy_mode"]
    assert_equal "degraded", inc_data["service_status"]

    events = inc_data["events"]
    assert events.any? { |e| e["event_type"] == "ai_bypassed" }

    # Re-enable AI
    AiSre::AutomationConfig.ai_connected = true
  end

  test "POST /api/v1/telemetry/signals with staged: true initializes uncategorized incident with jev_categorizing stage" do
    payload = {
      service_slug: "checkout",
      error_code: "HTTP_504_DB_LOCK",
      message: "Payment gateway threads locked.",
      staged: true
    }

    post api_v1_telemetry_signals_url, params: payload, as: :json
    assert_response :created
    json = JSON.parse(response.body)
    inc_data = json["incident"]

    assert_equal "accepted", json["status"]
    assert_includes json["message"], "aşamalı AI triyaj"
    assert_equal "jev_categorizing", inc_data["ai_stage"]
    assert_includes inc_data["ai_status_text"], "TypeSafe Jev"
  end

  test "POST /api/v1/telemetry/signals deduplicates repeated signals for the same active error" do
    payload = {
      service_slug: "cart",
      error_code: "ERR_COUPON_DUPLICATE_CHECK",
      message: "Cart coupon calculation failed on tax multiplier",
      raw_payload: {
        error_code: "ERR_COUPON_DUPLICATE_CHECK",
        line: 42
      }
    }

    # 1. İlk sinyal: yeni olay açılmalı
    assert_difference("Incident.count", 1) do
      post api_v1_telemetry_signals_url, params: payload, as: :json
    end
    assert_response :created
    first_json = JSON.parse(response.body)
    first_code = first_json.dig("incident", "incident_code")
    assert_not_nil first_code
    assert_nil first_json["deduplicated"]

    # 2. İkinci sinyal (aynı hata kodu ve servis): mükerrer olay AÇILMAMALI
    assert_no_difference("Incident.count") do
      post api_v1_telemetry_signals_url, params: payload, as: :json
    end
    assert_response :created
    second_json = JSON.parse(response.body)
    assert_equal true, second_json["deduplicated"]
    assert_includes second_json["message"], "Mükerrer olay açılması engellendi"
    assert_equal first_code, second_json.dig("incident", "incident_code")
  end
end
