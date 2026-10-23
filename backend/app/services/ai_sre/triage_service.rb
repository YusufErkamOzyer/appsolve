module AiSre
  class TriageService
    def self.call(incident, gemini_client: nil, auto_route: true)
      new(incident, gemini_client: gemini_client, auto_route: auto_route).call
    end

    def initialize(incident, gemini_client: nil, auto_route: true)
      @incident = incident
      @gemini_client = gemini_client || AiSre::GeminiClient.new
      @auto_route = auto_route
    end

    def call
      service = @incident.service
      raw_payload = @incident.raw_payload || {}

      analysis = @gemini_client.analyze_signal(service: service, raw_payload: raw_payload)

      @incident.severity = analysis[:severity] || "SEV-2"
      @incident.reasoning = analysis[:business_impact_reasoning]
      @incident.hypothesis = analysis[:root_cause_hypothesis]
      @incident.recommended_action_plan = analysis[:recommended_action_plan] || {}

      @incident.incident_events.build(
        event_type: "ai_triage_completed",
        actor: "gemini_ai_agent",
        title: "AI SRE Ajanı Triage Tamamlandı (#{@incident.severity})",
        details: "İş Etkisi: #{@incident.reasoning} | Kök Neden: #{@incident.hypothesis}",
        occurred_at: Time.current
      )

      # Otonomi Kilidi ve Akıllı Eskalasyon kurallarını işlet
      AiSre::GuardrailEngine.apply_guardrails!(@incident)

      # Müşteri Durum Sayfası ve Mobil Bildirimi (İnceleniyor)
      AiSre::CustomerCommunicationService.publish_investigating!(@incident, gemini_client: @gemini_client)

      # Adım 3: Üçlü Çözüm Yolu (Yol A otonom çözüm, Yol B eylem kartı, Yol C War Room hazırlığı)
      AiSre::RemediationService.route_after_triage!(@incident) if @auto_route

      @incident.reload
    end
  end
end
