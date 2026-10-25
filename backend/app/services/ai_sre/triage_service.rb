module AiSre
  class TriageService
    def self.call(incident, gemini_client: nil, jev_client: nil, auto_route: true, staged: false)
      new(incident, gemini_client: gemini_client, jev_client: jev_client, auto_route: auto_route, staged: staged).call
    end

    def self.call_staged(incident_id)
      incident = Incident.find_by(id: incident_id)
      return unless incident

      new(incident, auto_route: true, staged: true).call
    end

    def initialize(incident, gemini_client: nil, jev_client: nil, auto_route: true, staged: false)
      @incident = incident
      @gemini_client = gemini_client || AiSre::GeminiClient.new
      @jev_client = jev_client || AiSre::TypesafeJevClient.new
      @auto_route = auto_route
      @staged = staged
    end

    def call
      service = @incident.service
      raw_payload = (@incident.raw_payload || {}).dup

      # Adım 0: Hata düştü, henüz kategorize edilmedi
      @incident.update_ai_stage!("jev_categorizing", "Hata inceleniyor — @solver telemetri sinyalini kategorize ediyor...")
      sleep 1.2 if @staged

      # Adım 1A: TypeSafe AI Jev (System One) ile Hata Kategorizasyonu ve SEV Kararı
      jev_decision = @jev_client.categorize_signal(service: service, raw_payload: raw_payload)
      raw_payload["jev_triage"] = jev_decision
      @incident.severity = jev_decision[:severity] || "SEV-2"
      @incident.raw_payload = raw_payload

      @incident.incident_events.create!(
        event_type: "jev_categorization_completed",
        actor: "@solver",
        title: "@solver Kategorizasyonu: #{@incident.severity} (#{jev_decision[:category]})",
        details: "Ajan: @solver | Güven: #{(jev_decision[:confidence].to_f * 100).round(1)}% | Rota: #{jev_decision[:tool_name]}",
        occurred_at: Time.current
      )

      # Kullanıcı ekranında Jev kararının ve yeni SEV rozetinin hemen belirmesi için ara kayıt
      @incident.update_ai_stage!("ai_analyzing", "#{@incident.severity} belirlendi — @solver kök neden analizi ve müdahale planı çıkarıyor...")
      sleep 1.2 if @staged

      # Adım 1B: Google AI Studio (Gemini) Ajanı ile Kök Neden Hipotezi ve Çözüm Planı Üretimi
      analysis = @gemini_client.analyze_signal(
        service: service,
        raw_payload: raw_payload,
        jev_decision: jev_decision
      )

      @incident.severity = analysis[:severity] || jev_decision[:severity] || @incident.severity || "SEV-2"
      @incident.reasoning = analysis[:business_impact_reasoning]
      @incident.hypothesis = analysis[:root_cause_hypothesis]
      @incident.recommended_action_plan = analysis[:recommended_action_plan] || {}

      @incident.incident_events.create!(
        event_type: "ai_triage_completed",
        actor: "@solver",
        title: "@solver Triage ve Müdahale Planı Hazırlandı (#{@incident.severity})",
        details: "İş Etkisi: #{@incident.reasoning} | Kök Neden: #{@incident.hypothesis}",
        occurred_at: Time.current
      )

      # Adım 2: Otonomi Kilidi ve Akıllı Eskalasyon kurallarını işlet
      AiSre::GuardrailEngine.apply_guardrails!(@incident)

      # Müşteri Durum Sayfası ve Mobil Bildirimi (İnceleniyor)
      AiSre::CustomerCommunicationService.publish_investigating!(@incident, gemini_client: @gemini_client)

      # Adım 3: Üçlü Çözüm Yolu (Yol A otonom çözüm, Yol B eylem kartı, Yol C War Room hazırlığı)
      if @auto_route
        AiSre::RemediationService.route_after_triage!(@incident, staged: @staged)
      end

      @incident.reload
    end
  end
end
