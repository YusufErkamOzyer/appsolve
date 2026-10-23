require "test_helper"

class TriageServiceTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
    @catalog = services(:catalog)
  end

  test "triages checkout deadlock raw signal into SEV-1 with reasoning and hypothesis" do
    incident = Incident.create!(
      service: @checkout,
      title: "Raw signal without severity",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: {
        "service_slug" => "checkout",
        "error_code" => "HTTP_504_DB_LOCK",
        "message" => "Checkout payment transaction timed out waiting for row lock on payment_records.",
        "metrics" => { "error_rate" => 0.94, "p99_latency_ms" => 14000 }
      }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    assert_equal "SEV-1", incident.severity
    assert_equal "manual_command_only", incident.autonomy_mode
    assert_equal "on_call_and_team_lead", incident.escalation_target
    assert_not_nil incident.reasoning
    assert_not_nil incident.hypothesis
    assert incident.recommended_action_plan.present?
    assert_equal "kill_db_locks_and_failover", incident.recommended_action_plan["tool_name"]

    events = incident.incident_events.pluck(:event_type)
    assert_includes events, "ai_triage_completed"
    assert_includes events, "guardrail_locked"
    assert_includes events, "escalation_triggered"
  end

  test "triages cart coupon nan raw signal into SEV-2" do
    incident = Incident.create!(
      service: @cart,
      title: "Raw signal without severity",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: {
        "service_slug" => "cart",
        "error_code" => "REDIS_COUPON_NAN",
        "message" => "Cart promotion engine received NaN for percentage calculation.",
        "metrics" => { "error_rate" => 0.28 }
      }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    assert_equal "SEV-2", incident.severity
    assert_equal "approval_required", incident.autonomy_mode
    assert_equal "on_call_engineer", incident.escalation_target
    assert_not_nil incident.reasoning
    assert_not_nil incident.hypothesis
    assert_equal "rollback_feature_flag", incident.recommended_action_plan["tool_name"]
  end

  test "triages catalog cdn bloat raw signal into SEV-3" do
    incident = Incident.create!(
      service: @catalog,
      title: "Raw signal without severity",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: {
        "service_slug" => "catalog",
        "error_code" => "CDN_CACHE_BLOAT",
        "message" => "Product image thumbnail cache memory pressure exceeded 92%.",
        "metrics" => { "error_rate" => 0.05 }
      }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    assert_equal "SEV-3", incident.severity
    assert_equal "full_autonomy", incident.autonomy_mode
    assert_equal "none", incident.escalation_target
    assert_nil incident.sla_deadline
    assert_not_nil incident.reasoning
    assert_not_nil incident.hypothesis
    assert_equal "flush_cache", incident.recommended_action_plan["tool_name"]
  end
end
