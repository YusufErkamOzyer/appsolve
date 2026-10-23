require "test_helper"

class PostMortemTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @incident = Incident.create!(
      service: @checkout,
      title: "Payment Deadlock",
      severity: "SEV-1",
      status: "resolved",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      resolved_at: Time.current
    )
  end

  test "validates presence of summary and root_cause" do
    pm = PostMortem.new(incident: @incident)
    assert_not pm.valid?
    assert_includes pm.errors[:summary], "can't be blank"
    assert_includes pm.errors[:root_cause], "can't be blank"

    pm.summary = "Yönetici özeti metni."
    pm.root_cause = "Veritabanı satır kilitlenmesi."
    assert pm.valid?
  end

  test "sets default attributes" do
    pm = PostMortem.create!(
      incident: @incident,
      summary: "Özet",
      root_cause: "Kök neden"
    )

    assert_equal "@solver (Gemini AI SRE Ajanı)", pm.generated_by
    assert_equal [], pm.affected_services
    assert_equal [], pm.action_items
  end

  test "to_markdown produces structured SRE markdown document" do
    pm = PostMortem.create!(
      incident: @incident,
      summary: "Ödeme altyapısında kriz yaşandı ve çözüldü.",
      root_cause: "payment_records tablosunda deadlock oluştu.",
      duration_seconds: 45,
      mttr_formatted: "45 sn",
      affected_services: ["Ödeme (checkout)", "Sepet (cart)"],
      action_items: [
        "Veritabanı lock timeout süresini 5000ms yap",
        "Circuit breaker eşiklerini güncelle"
      ]
    )

    md = pm.to_markdown
    assert_includes md, "POST-MORTEM RAPORU // #{@incident.incident_code}"
    assert_includes md, "1. Olay Künyesi"
    assert_includes md, "2. Yönetici Özeti (Executive Summary)"
    assert_includes md, "3. Kök Neden Analizi (Root Cause Analysis - RCA)"
    assert_includes md, "4. Etkilenen Servisler ve Kapsam"
    assert_includes md, "5. Önleyici ve İyileştirici Aksiyon Maddeleri"
    assert_includes md, "Ödeme (checkout)"
    assert_includes md, "Circuit breaker eşiklerini güncelle"
  end
end
