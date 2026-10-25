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
    assert_equal "@solver", pm.generated_by

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

  test "generate_post_mortem uses gemini-3.8-flash and fails over to gemini-3.6-flash when quota exhausted" do
    old_mock = ENV["MOCK_AI"]
    ENV["MOCK_AI"] = "false"

    incident = Incident.create!(
      service: @checkout,
      title: "Checkout Outage for Quota Failover",
      severity: "SEV-1",
      status: "resolved",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      created_at: 10.seconds.ago,
      resolved_at: Time.current
    )

    client = AiSre::GeminiClient.new(api_key: "dummy_key", model: "antigravity-preview-latest")

    # Simulate 3.8 hitting HTTP 429 quota exhaustion, and 3.6 succeeding
    attempted_models = []
    client.define_singleton_method(:call_standard_generate_content_api) do |system_instruction:, user_prompt:, response_schema:, model: nil, timeout: 35|
      attempted_models << model
      if model == "gemini-3.8-flash"
        raise "Gemini API HTTP 429: Resource has been exhausted (quota limit reached)"
      else
        {
          summary: "Başarıyla üretilen rapor.",
          root_cause: "Kök neden açıklaması.",
          affected_services: ["Ödeme (checkout)"],
          action_items: ["Eşik kuralını güncelle"]
        }.with_indifferent_access
      end
    end

    begin
      res = client.generate_post_mortem(incident: incident)
      assert_equal ["gemini-3.8-flash", "gemini-3.6-flash"], attempted_models
      assert_equal "gemini-3.6-flash", res[:used_model]
      assert_not_equal "antigravity-preview-latest", res[:used_model]
    ensure
      ENV["MOCK_AI"] = old_mock
    end
  end
end
