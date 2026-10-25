require "test_helper"

class GuardrailEngineTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
    @catalog = services(:catalog)
  end

  test "SEV-1 activates manual_command_only, escalates to lead and updates service to outage" do
    incident = Incident.create!(
      service: @checkout,
      title: "Checkout 504 Timeout",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "pending_triage"
    )

    AiSre::GuardrailEngine.apply_guardrails!(incident)

    assert_equal "manual_command_only", incident.autonomy_mode
    assert_equal "on_call_and_team_lead", incident.escalation_target
    assert_not_nil incident.sla_deadline
    assert incident.sla_deadline > Time.current + 14.minutes
    assert_equal "outage", @checkout.reload.status
    assert incident.locked_to_manual_commands?
    assert_not incident.can_execute_autonomously?

    event_types = incident.incident_events.pluck(:event_type)
    assert_includes event_types, "guardrail_locked"
    assert_includes event_types, "escalation_triggered"
  end

  test "SEV-2 activates approval_required, escalates to on_call and updates service to degraded" do
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon NaN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "pending_triage"
    )

    AiSre::GuardrailEngine.apply_guardrails!(incident)

    assert_equal "approval_required", incident.autonomy_mode
    assert_equal "on_call_engineer", incident.escalation_target
    assert_not_nil incident.sla_deadline
    assert_equal "degraded", @cart.reload.status
    assert incident.requires_human_approval?
    assert_not incident.can_execute_autonomously?
  end

  test "SEV-3 activates full_autonomy, escalation none and preserves operational status" do
    incident = Incident.create!(
      service: @catalog,
      title: "Catalog CDN Bloat",
      severity: "SEV-3",
      status: "investigating",
      autonomy_mode: "pending_triage"
    )

    AiSre::GuardrailEngine.apply_guardrails!(incident)

    assert_equal "full_autonomy", incident.autonomy_mode
    assert_equal "none", incident.escalation_target
    assert_nil incident.sla_deadline
    assert_equal "operational", @catalog.reload.status
    assert incident.can_execute_autonomously?
  end

  test "authorize_autonomous_execution! allows SEV-3 full_autonomy and blocks SEV-1 and SEV-2" do
    sev3_inc = Incident.create!(
      service: @catalog,
      title: "CDN Flush",
      severity: "SEV-3",
      autonomy_mode: "full_autonomy"
    )
    assert_nothing_raised do
      assert AiSre::GuardrailEngine.authorize_autonomous_execution!(sev3_inc)
    end

    sev2_inc = Incident.create!(
      service: @cart,
      title: "Cart NaN",
      severity: "SEV-2",
      autonomy_mode: "approval_required"
    )
    assert_raises(AiSre::GuardrailEngine::UnauthorizedActionError) do
      AiSre::GuardrailEngine.authorize_autonomous_execution!(sev2_inc)
    end
    assert_includes sev2_inc.incident_events.pluck(:event_type), "guardrail_blocked"

    sev1_inc = Incident.create!(
      service: @checkout,
      title: "DB Lock",
      severity: "SEV-1",
      autonomy_mode: "manual_command_only"
    )
    assert_raises(AiSre::GuardrailEngine::UnauthorizedActionError) do
      AiSre::GuardrailEngine.authorize_autonomous_execution!(sev1_inc)
    end
    assert_includes sev1_inc.incident_events.pluck(:event_type), "guardrail_blocked"
  end

  test "authorize_approved_plan! allows engineer to approve and execute plan for SEV-1 and SEV-2" do
    sev1_inc = Incident.create!(
      service: @checkout,
      title: "DB Lock",
      severity: "SEV-1",
      autonomy_mode: "manual_command_only"
    )
    assert_nothing_raised do
      assert AiSre::GuardrailEngine.authorize_approved_plan!(sev1_inc, approved_by: "Deniz (On-Call SRE)")
    end
    assert_includes sev1_inc.incident_events.pluck(:event_type), "guardrail_authorized"

    sev2_inc = Incident.create!(
      service: @cart,
      title: "Cart NaN",
      severity: "SEV-2",
      autonomy_mode: "approval_required"
    )
    assert_nothing_raised do
      assert AiSre::GuardrailEngine.authorize_approved_plan!(sev2_inc, approved_by: "Deniz")
    end
  end

  test "authorize_approved_plan! blocks execution if approved_by is missing" do
    sev1_inc = Incident.create!(
      service: @checkout,
      title: "DB Lock",
      severity: "SEV-1",
      autonomy_mode: "manual_command_only"
    )
    assert_raises(AiSre::GuardrailEngine::UnauthorizedActionError) do
      AiSre::GuardrailEngine.authorize_approved_plan!(sev1_inc, approved_by: nil)
    end
    assert_includes sev1_inc.incident_events.pluck(:event_type), "guardrail_blocked"
  end
end
