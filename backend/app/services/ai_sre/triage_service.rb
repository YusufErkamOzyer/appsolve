module AiSre
  class TriageService
    def self.call(incident, gemini_client: nil, jev_client: nil, auto_route: true)
      new(incident, gemini_client: gemini_client, jev_client: jev_client, auto_route: auto_route).call
    end

    def initialize(incident, gemini_client: nil, jev_client: nil, auto_route: true)
      @incident = incident
      @gemini_client = gemini_client || AiSre::GeminiClient.new
      @jev_client = jev_client || AiSre::TypesafeJevClient.new
      @auto_route = auto_route
    end

    def call
      service = @incident.service
      raw_payload = (@incident.raw_payload || {}).dup

      # Adım 1A: TypeSafe AI Jev (System One) ile Hata Kategorizasyonu ve SEV Kararı
      jev_decision = @jev_client.categorize_signal(service: service, raw_payload: raw_payload)
      raw_payload["jev_triage"] = jev_decision
      @incident.raw_payload = raw_payload

      # Adım 1B: Google AI Studio (Gemini) Ajanı ile Kök Neden Hipotezi ve Çözüm Planı Üretimi
      analysis = @gemini_client.analyze_signal(
        service: service,
        raw_payload: raw_payload,
        jev_decision: jev_decision
      )

      @incident.severity = analysis[:severity] || jev_decision[:severity] || "SEV-2"
      @incident.reasoning = analysis[:business_impact_reasoning]
      @incident.hypothesis = analysis[:root_cause_hypothesis]
      @incident.recommended_action_plan = analysis[:recommended_action_plan] || {}

      @incident.incident_events.build(
        event_type: "jev_categorization_completed",
        actor: "typesafe_jev_agent",
        title: "TypeSafe Jev Kategorizasyonu: #{@incident.severity} (#{jev_decision[:category]})",
        details: "Model: #{jev_decision[:model]} | Confidence: #{(jev_decision[:confidence].to_f * 100).round(1)}% | Rota: #{jev_decision[:tool_name]}",
        occurred_at: Time.current
      )

      @incident.incident_events.build(
        event_type: "ai_triage_completed",
        actor: "gemini_ai_agent",
        title: "AI SRE Ajanı Triage & Çözüm Planı Tamamlandı (#{@incident.severity})",
        details: "İş Etkisi: #{@incident.reasoning} | Kök Neden: #{@incident.hypothesis}",
        occurred_at: Time.current
      )

      # Adım 2: Otonomi Kilidi ve Akıllı Eskalasyon kurallarını işlet
      AiSre::GuardrailEngine.apply_guardrails!(@incident)

      # Müşteri Durum Sayfası ve Mobil Bildirimi (İnceleniyor)
      AiSre::CustomerCommunicationService.publish_investigating!(@incident, gemini_client: @gemini_client)

      # Adım 3: Üçlü Çözüm Yolu (Yol A otonom çözüm, Yol B eylem kartı, Yol C War Room hazırlığı)
      AiSre::RemediationService.route_after_triage!(@incident) if @auto_route

      @incident.reload
    end
  end
end
