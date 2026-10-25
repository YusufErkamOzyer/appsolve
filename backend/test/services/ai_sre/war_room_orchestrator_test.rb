require "test_helper"

class WarRoomOrchestratorTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @incident = Incident.create!(
      service: @checkout,
      title: "HTTP_504_DB_LOCK: Ödeme kilitlendi",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      hypothesis: "Row lock deadlock on payment_records",
      reasoning: "Ödeme akışı tamamen kilitlendi, ciro kaybı yaşanıyor.",
      raw_payload: {
        "error_code" => "HTTP_504_DB_LOCK",
        "metrics" => { "error_rate" => 0.94 }
      }
    )

    # Initial explanation and PLAN #01
    @incident.war_room_messages.create!(
      sender_type: "gemini_ai_agent",
      sender_name: "@solver",
      message_type: "action_card",
      action_status: "pending",
      content: "İmplementasyon Planı (PLAN #01)",
      action_card_payload: {
        "plan_id" => "PLAN #01",
        "title" => "İlk Kurtarma Planı",
        "tool_name" => "kill_db_locks"
      }
    )
  end

  test "chat query with explanation requests returns @solver root cause explanation" do
    msg = @incident.war_room_messages.create!(
      sender_type: "engineer",
      sender_name: "Deniz (On-Call SRE)",
      content: "@solver hatayı ve kök neden hipotezini detaylı açıkla"
    )

    AiSre::WarRoomOrchestrator.call(incident: @incident, engineer_message: msg)

    agent_reply = @incident.war_room_messages.where(sender_type: "gemini_ai_agent").last
    assert_equal "@solver", agent_reply.sender_name
    assert_equal "text", agent_reply.message_type
    assert_includes agent_reply.content, "payment_records"
  end

  test "chat query asking for new/revised plan creates PLAN #02 action card" do
    msg = @incident.war_room_messages.create!(
      sender_type: "engineer",
      sender_name: "Deniz (On-Call SRE)",
      content: "@solver replikaya geçiş adımı ekleyerek yeni bir plan hazırla"
    )

    AiSre::WarRoomOrchestrator.call(incident: @incident, engineer_message: msg)

    new_action_card = @incident.war_room_messages.where(message_type: "action_card").last
    assert_equal "pending", new_action_card.action_status
    assert_equal "PLAN #02", new_action_card.action_card_payload["plan_id"]
    assert_includes new_action_card.action_card_payload["tool_name"], "kill_db_locks_and_failover"

    events = @incident.incident_events.pluck(:event_type)
    assert_includes events, "plan_created"
  end

  test "chat query asking for diagnostics produces system_diagnostic terminal message" do
    msg = @incident.war_room_messages.create!(
      sender_type: "engineer",
      sender_name: "Deniz (On-Call SRE)",
      content: "@solver aktif veritabanı kilitlerini kontrol et ve listele"
    )

    AiSre::WarRoomOrchestrator.call(incident: @incident, engineer_message: msg)

    diag_msg = @incident.war_room_messages.where(message_type: "system_diagnostic").last
    assert_not_nil diag_msg
    assert_includes diag_msg.content, "pg_stat_activity"
    assert_includes diag_msg.content, "48"

    events = @incident.incident_events.pluck(:event_type)
    assert_includes events, "diagnostic_executed"
  end

  test "chat query asking to resolve marks incident resolved and updates service status" do
    @checkout.update!(status: "outage")

    msg = @incident.war_room_messages.create!(
      sender_type: "engineer",
      sender_name: "Deniz (On-Call SRE)",
      content: "@solver servis sağlığını doğrula ve olayı kapat"
    )

    AiSre::WarRoomOrchestrator.call(incident: @incident, engineer_message: msg)

    assert_equal "resolved", @incident.reload.status
    assert_equal "operational", @checkout.reload.status
    events = @incident.incident_events.pluck(:event_type)
    assert_includes events, "incident_resolved"

    # Module 6: Otomatik Post-Mortem doğrulama
    assert_not_nil @incident.post_mortem
    assert_not_empty @incident.post_mortem.summary
    assert_not_empty @incident.post_mortem.root_cause
  end
end
