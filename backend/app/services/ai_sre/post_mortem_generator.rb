module AiSre
  class PostMortemGenerator
    def self.generate!(incident, gemini_client: nil, force_regenerate: false)
      new(incident, gemini_client: gemini_client).generate!(force_regenerate: force_regenerate)
    end

    def initialize(incident, gemini_client: nil)
      @incident = incident
      @gemini_client = gemini_client || AiSre::GeminiClient.new
      @service = incident.service
    end

    def generate!(force_regenerate: false)
      if @incident.post_mortem.present? && !force_regenerate
        return @incident.post_mortem
      end

      # MTTR ve kesinti süresi hesaplama
      start_time = @incident.created_at || Time.current
      end_time = @incident.resolved_at || Time.current
      diff_seconds = [((end_time - start_time)).to_i, 1].max
      mttr_formatted = format_mttr(diff_seconds)

      # Gemini AI veya deterministik fallback motorundan rapor al
      ai_result = @gemini_client.generate_post_mortem(incident: @incident)

      affected = Array(ai_result[:affected_services]).presence || [
        "#{@service&.name} (#{@service&.slug})"
      ]

      action_items = Array(ai_result[:action_items]).presence || [
        "#{@service&.name} servisi için alarm eşiklerini ve telemetri metriklerini gözden geçir",
        "Kök neden tekrarını önleyici mimari dayanıklılık testleri planla"
      ]

      pm = @incident.post_mortem || @incident.build_post_mortem
      pm.assign_attributes(
        summary: ai_result[:summary],
        root_cause: ai_result[:root_cause],
        duration_seconds: diff_seconds,
        mttr_formatted: mttr_formatted,
        affected_services: affected,
        action_items: action_items,
        generated_by: "@solver (AI SRE Ajanı)"
      )
      pm.save!

      # Timeline olay kaydı
      @incident.incident_events.create!(
        event_type: "post_mortem_generated",
        actor: "@solver",
        title: "Otomatik Post-Mortem Raporu Yayınlandı (PostMortem 1.1)",
        details: "Kök neden analizi, MTTR (#{mttr_formatted}) ve #{action_items.size} önleyici aksiyon maddesi içeren resmi rapor hazırlandı.",
        occurred_at: Time.current
      )

      # War Room içinde duyuru mesajı
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "text",
        content: "📄 OTOMATİK POST-MORTEM RAPORU YAYINLANDI (PostMortem 1.1)\n\n" \
                 "📋 Özet: #{ai_result[:summary]}\n\n" \
                 "🔍 Kök Neden: #{ai_result[:root_cause]}\n\n" \
                 "⏱️ MTTR (Çözüm Süresi): #{mttr_formatted}\n\n" \
                 "Raporun tamamını, etki matrisini ve önleyici aksiyon maddelerini Post-Mortem görüntüleyicisinde inceleyebilirsiniz."
      )

      pm
    end

    private

    def format_mttr(seconds)
      if seconds < 60
        "#{seconds} sn"
      else
        mins = seconds / 60
        remaining_secs = seconds % 60
        remaining_secs > 0 ? "#{mins} dk #{remaining_secs} sn" : "#{mins} dk"
      end
    end
  end
end
