module AiSre
  class CustomerCommunicationService
    JARGON_REPLACEMENTS = {
      /db lock|deadlock|veritabanı kilidi|postgresql lock/i => "servis kaynak yoğunluğu",
      /http 504|gateway timeout|504/i => "geçici yanıt gecikmesi",
      /http 500|internal server error|500 hatası/i => "beklenmeyen bir aksaklık",
      /stack trace|exception|nullpointer|traceback/i => "sistem uyarısı",
      /nan error|nan hatası/i => "hesaplama uyarısı",
      /promo_v2|feature flag|özellik bayrağı/i => "güncelleme adımı",
      /redis promo cache|cache bloat|önbellek şişmesi/i => "önbellek optimizasyonu",
      /pod|kubernetes|failover/i => "altyapı yönlendirmesi"
    }.freeze

    def self.publish_investigating!(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).publish(phase: "investigating")
    end

    def self.publish_identified!(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).publish(phase: "identified")
    end

    def self.publish_monitoring!(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).publish(phase: "monitoring")
    end

    def self.publish_resolved!(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).publish(phase: "resolved")
    end

    def self.publish_autonomous_resolution!(incident, gemini_client: nil)
      new(incident, gemini_client: gemini_client).publish(phase: "autonomous_resolved")
    end

    def initialize(incident, gemini_client: nil)
      @incident = incident
      @service = incident.service
      @gemini_client = gemini_client || AiSre::GeminiClient.new
    end

    def publish(phase:)
      raw_content = @gemini_client.generate_customer_status(incident: @incident, phase: phase)
      raw_message = raw_content[:public_message].presence || raw_content["public_message"] || "Sistem durumu güncellendi."
      clean_message = sanitize_jargon(raw_message)

      status_update = @incident.status_updates.create!(
        service: @service,
        phase: phase,
        public_message: clean_message,
        visible_on_status_page: true
      )

      phase_label = status_update.phase_label
      @incident.incident_events.create!(
        event_type: "customer_status_published",
        actor: "gemini_ai_agent",
        title: "Müşteri Durum Sayfası Güncellemesi Yayınlandı (#{phase_label})",
        details: "Müşteriler ve mobil uygulama için kurumsal duyuru yayınlandı: \"#{clean_message}\"",
        occurred_at: Time.current
      )

      status_update
    end

    private

    def sanitize_jargon(text)
      sanitized = text.dup
      JARGON_REPLACEMENTS.each do |pattern, replacement|
        sanitized.gsub!(pattern, replacement)
      end
      sanitized.strip
    end
  end
end
