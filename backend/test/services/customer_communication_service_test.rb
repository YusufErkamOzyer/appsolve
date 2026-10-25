require "test_helper"

class CustomerCommunicationServiceTest < ActiveSupport::TestCase
  class FakeJargonGeminiClient
    def generate_customer_status(incident:, phase:)
      {
        headline: "Ödeme Sorunu",
        public_message: "PostgreSQL üzerinde DB lock ve HTTP 504 hatası tespit edildi, stack trace inceleniyor."
      }
    end
  end

  setup do
    @checkout = Service.find_by!(slug: "checkout")
    @cart = Service.find_by!(slug: "cart")
    @catalog = Service.find_by!(slug: "catalog")
  end

  test "sanitizes internal technical jargon from messages" do
    incident = Incident.create!(
      service: @checkout,
      title: "DB Lock and 504 Gateway Timeout in postgresql",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "manual_command_only",
      raw_payload: { error: "deadlock detected" }
    )

    fake_client = FakeJargonGeminiClient.new
    service = AiSre::CustomerCommunicationService.new(incident, gemini_client: fake_client)
    update = service.publish(phase: "investigating")

    assert update.persisted?
    assert_equal "investigating", update.phase
    assert_equal "İNCELENİYOR", update.phase_label
    # Verify forbidden technical terms were sanitized
    refute_match(/db lock/i, update.public_message)
    refute_match(/http 504/i, update.public_message)
    refute_match(/stack trace/i, update.public_message)
    assert update.visible_on_status_page
  end

  test "SEV-3 incident creates public status update and autonomous resolution update" do
    incident = Incident.create!(
      service: @catalog,
      title: "CDN Edge Cache Bloat",
      severity: "SEV-3",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: { error_code: "IMAGE_CDN_CACHE_BLOAT", metrics: { memory_mb: 850 } }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    # Verify updates exist for SEV-3 (per user directive)
    updates = incident.status_updates.to_a
    assert updates.any?, "SEV-3 olayları durum sayfasında kurumsal olarak listelenmelidir"
    
    # Autonomous remediation should have resolved it
    assert_equal "resolved", incident.status
    assert_equal "operational", @catalog.reload.status

    phases = updates.map(&:phase)
    assert_includes phases, "investigating"
    assert(phases.include?("autonomous_resolved") || phases.include?("resolved"))
  end

  test "SEV-2 incident creates investigating, identified and resolves to operational" do
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon NaN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: { error_code: "CART_COUPON_NAN_ERROR" }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    assert_equal "degraded", @cart.reload.status
    assert_equal "approval_required", incident.autonomy_mode

    phases = incident.status_updates.pluck(:phase)
    assert_includes phases, "investigating"
    assert_includes phases, "identified"

    # Now approve plan (Stage 1: proposal -> PR; Stage 2: PR review -> merge & resolve)
    AiSre::RemediationService.approve_plan!(incident)
    AiSre::RemediationService.approve_plan!(incident)
    incident.reload

    assert_equal "resolved", incident.status
    assert_equal "operational", @cart.reload.status

    updated_phases = incident.status_updates.pluck(:phase)
    assert_includes updated_phases, "resolved"
  end

  test "SEV-1 incident sets outage and resolves cleanly via war room" do
    incident = Incident.create!(
      service: @checkout,
      title: "Payment Gateway Deadlock",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "pending_triage",
      raw_payload: { error_code: "PAYMENT_GATEWAY_DEADLOCK" }
    )

    AiSre::TriageService.call(incident)
    incident.reload

    assert_equal "outage", @checkout.reload.status
    assert_equal "manual_command_only", incident.autonomy_mode

    # War Room engineer resolution
    engineer_msg = incident.war_room_messages.create!(
      sender_type: "engineer",
      sender_name: "Lead SRE",
      content: "Sağlık kontrolü yap ve olayı kapat"
    )

    AiSre::WarRoomOrchestrator.call(incident: incident, engineer_message: engineer_msg)
    incident.reload

    assert_equal "resolved", incident.status
    assert_equal "operational", @checkout.reload.status

    phases = incident.status_updates.pluck(:phase)
    assert_includes phases, "resolved"
  end
end
