module AiSre
  class TriageService
    def self.call(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).call
    end

    def initialize(incident, gemini_client: nil)
      @incident = incident
      @gemini_client = gemini_client || AiSre::GeminiClient.new
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

      @incident.reload
    end
  end
end
