require "test_helper"

class RemediationServiceTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
    @catalog = services(:catalog)
  end

  test "SEV-3 route_after_triage! executes autonomously and resolves incident" do
    incident = Incident.create!(
      service: @catalog,
      title: "CDN Cache Bloat",
      severity: "SEV-3",
      status: "investigating",
      autonomy_mode: "full_autonomy",
      escalation_target: "none",
      hypothesis: "LRU evictions delayed",
      recommended_action_plan: {
        "plan_id" => "PLAN #03",
        "title" => "CDN Önbelleğini Temizle",
        "tool_name" => "flush_cache",
        "risk_level" => "low",
        "steps" => ["Purge edge cache tag", "Verify latency"]
      }
    )

    AiSre::RemediationService.route_after_triage!(incident)
    incident.reload

    assert_equal "resolved", incident.status
    assert_not_nil incident.resolved_at
    assert_equal "operational", @catalog.reload.status

    # Action card message
    action_msg = incident.war_room_messages.find_by(message_type: "action_card")
    assert_not_nil action_msg
    assert_equal "autonomous_executed", action_msg.action_status
    assert action_msg.action_card_payload["autonomous"]

    events = incident.incident_events.pluck(:event_type)
    assert_includes events, "autonomous_remediation_executed"
    assert_includes events, "incident_resolved"

    # Module 6: Otomatik Post-Mortem doğrulama
    assert_not_nil incident.post_mortem
    assert_not_empty incident.post_mortem.summary
    assert_not_empty incident.post_mortem.root_cause
  end

  test "SEV-2 route_after_triage! creates pending action card without resolving" do
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon NaN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      hypothesis: "Corrupt promo_v2 key in Redis",
      recommended_action_plan: {
        "plan_id" => "PLAN #02",
        "title" => "Promo Bayrağını Geri Al",
        "tool_name" => "rollback_feature_flag",
        "risk_level" => "medium",
        "steps" => ["Toggle promo_v2 off", "Flush keys"]
      }
    )

    AiSre::RemediationService.route_after_triage!(incident)
    incident.reload

    assert_equal "investigating", incident.status
    assert_nil incident.resolved_at

    action_msg = incident.war_room_messages.find_by(message_type: "action_card")
    assert_not_nil action_msg
    assert_equal "pending", action_msg.action_status

    events = incident.incident_events.pluck(:event_type)
    assert_includes events, "action_card_posted"
  end

  test "SEV-2 approve_plan! executes plan, marks card executed and resolves incident" do
    @cart.update!(status: "degraded")
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon NaN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      hypothesis: "Corrupt promo_v2 key in Redis",
      recommended_action_plan: {
        "plan_id" => "PLAN #02",
        "title" => "Promo Bayrağını Geri Al",
        "tool_name" => "rollback_feature_flag",
        "risk_level" => "medium",
        "steps" => ["Toggle promo_v2 off", "Flush keys"]
      }
    )

    AiSre::RemediationService.route_after_triage!(incident)
    assert_equal "degraded", @cart.reload.status

    AiSre::RemediationService.approve_plan!(incident, approved_by: "Ahmet (Senior SRE)")
    incident.reload

    assert_equal "resolved", incident.status
    assert_not_nil incident.resolved_at
    assert_equal "operational", @cart.reload.status

    action_msg = incident.war_room_messages.find_by(message_type: "action_card")
    assert_equal "executed", action_msg.action_status
    assert_equal "Ahmet (Senior SRE)", action_msg.action_card_payload["approved_by"]

    events = incident.incident_events.pluck(:event_type)
    assert_includes events, "plan_approved"
    assert_includes events, "remediation_executed"
    assert_includes events, "incident_resolved"

    # Module 6: Otomatik Post-Mortem doğrulama
    assert_not_nil incident.post_mortem
    assert_not_empty incident.post_mortem.summary
    assert_not_empty incident.post_mortem.action_items
  end

  test "SEV-2 reject_plan! marks card rejected and keeps incident open" do
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon NaN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      hypothesis: "Corrupt promo_v2 key in Redis",
      recommended_action_plan: {
        "plan_id" => "PLAN #02",
        "title" => "Promo Bayrağını Geri Al",
        "tool_name" => "rollback_feature_flag",
        "risk_level" => "medium",
        "steps" => ["Toggle promo_v2 off", "Flush keys"]
      }
    )

    AiSre::RemediationService.route_after_triage!(incident)
    AiSre::RemediationService.reject_plan!(incident, rejected_by: "Mehmet (Lead)", reason: "Manuel müdahale edilecek")
    incident.reload

    assert_equal "investigating", incident.status
    assert_nil incident.resolved_at

    action_msg = incident.war_room_messages.find_by(message_type: "action_card")
    assert_equal "rejected", action_msg.action_status

    events = incident.incident_events.pluck(:event_type)
    assert_includes events, "plan_rejected"
  end

  test "SEV-1 approve_plan! allows engineer to approve and execute @solver plan" do
    incident = Incident.create!(
      service: @checkout,
      title: "DB Lock",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      recommended_action_plan: {
        "plan_id" => "PLAN #01",
        "title" => "Kill Locks",
        "tool_name" => "kill_db_locks_and_failover"
      }
    )

    incident.war_room_messages.create!(
      sender_type: "gemini_ai_agent",
      sender_name: "@solver (AI SRE Ajanı)",
      message_type: "action_card",
      action_status: "pending",
      content: "Plan hazırlandı",
      action_card_payload: {
        "plan_id" => "PLAN #01",
        "title" => "Kill Locks",
        "tool_name" => "kill_db_locks_and_failover"
      }
    )

    assert_nothing_raised do
      AiSre::RemediationService.approve_plan!(incident, approved_by: "Deniz (On-Call SRE)")
    end

    assert_equal "resolved", incident.reload.status
    assert_equal "operational", @checkout.reload.status
  end

  test "SEV-1 approve_plan! without approved_by is blocked by GuardrailEngine" do
    incident = Incident.create!(
      service: @checkout,
      title: "DB Lock",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      recommended_action_plan: {
        "plan_id" => "PLAN #01",
        "title" => "Kill Locks",
        "tool_name" => "kill_db_locks_and_failover"
      }
    )

    assert_raises(AiSre::GuardrailEngine::UnauthorizedActionError) do
      AiSre::RemediationService.approve_plan!(incident, approved_by: nil)
    end

    assert_equal "investigating", incident.reload.status
  end
end
