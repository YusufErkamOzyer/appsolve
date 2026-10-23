require "test_helper"

class PostMortemGeneratorTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
    @catalog = services(:catalog)
  end

  test "generate! creates PostMortem for SEV-1 incident with correct MTTR and events" do
    created_time = 120.seconds.ago
    resolved_time = Time.current

    incident = Incident.create!(
      service: @checkout,
      title: "Checkout 504 Deadlock",
      severity: "SEV-1",
      status: "resolved",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      hypothesis: "Row lock contention in payment_records",
      reasoning: "Ödeme akışı tamamen kilitlendi.",
      created_at: created_time,
      resolved_at: resolved_time
    )

    pm = AiSre::PostMortemGenerator.generate!(incident)

    assert_not_nil pm
    assert_equal incident.id, pm.incident_id
    assert_not_empty pm.summary
    assert_not_empty pm.root_cause
    assert pm.duration_seconds >= 120
    assert_includes pm.mttr_formatted, "dk"
    assert_not_empty pm.action_items
    assert_equal "@solver (AI SRE Ajanı)", pm.generated_by

    # IncidentEvent created
    event = incident.incident_events.find_by(event_type: "post_mortem_generated")
    assert_not_nil event
    assert_equal "@solver", event.actor

    # WarRoomMessage created
    msg = incident.war_room_messages.last
    assert_not_nil msg
    assert_includes msg.content, "OTOMATİK POST-MORTEM RAPORU YAYINLANDI"
  end

  test "generate! does not overwrite existing post_mortem unless force_regenerate is true" do
    incident = Incident.create!(
      service: @cart,
      title: "Cart Coupon Error",
      severity: "SEV-2",
      status: "resolved",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      created_at: 30.seconds.ago,
      resolved_at: Time.current
    )

    pm1 = AiSre::PostMortemGenerator.generate!(incident)
    orig_summary = pm1.summary

    # Change summary manually
    pm1.update!(summary: "Özel el ile yazılmış özet")

    # Calling generate! without force should return existing
    pm2 = AiSre::PostMortemGenerator.generate!(incident, force_regenerate: false)
    assert_equal "Özel el ile yazılmış özet", pm2.summary

    # Calling with force_regenerate: true should re-run generator
    pm3 = AiSre::PostMortemGenerator.generate!(incident, force_regenerate: true)
    assert_not_equal "Özel el ile yazılmış özet", pm3.summary
  end

  test "generate! works seamlessly for SEV-3 autonomous incidents" do
    incident = Incident.create!(
      service: @catalog,
      title: "CDN Cache Bloat",
      severity: "SEV-3",
      status: "resolved",
      autonomy_mode: "full_autonomy",
      escalation_target: "none",
      created_at: 4.seconds.ago,
      resolved_at: Time.current
    )

    pm = AiSre::PostMortemGenerator.generate!(incident)

    assert_not_nil pm
    assert_includes pm.mttr_formatted, "sn"
    assert_includes pm.affected_services.first, "Katalog"
    assert_not_empty pm.action_items
  end
end
