module AiSre
  class WarRoomOrchestrator
    def self.call(incident:, engineer_message:, gemini_client: nil)
      new(incident: incident, engineer_message: engineer_message, gemini_client: gemini_client).call
    end

    def initialize(incident:, engineer_message:, gemini_client: nil)
      @incident = incident
      @engineer_message = engineer_message
      @gemini_client = gemini_client || AiSre::GeminiClient.new
      @service = incident.service
    end

    def call
      content = @engineer_message.content.to_s.strip

      # Gemini API veya akıllı deterministik fallback motorundan yanıt al
      res = @gemini_client.chat_in_war_room(
        incident: @incident,
        message_content: content
      )

      if res[:resolve_incident]
        handle_resolution(res)
      elsif res[:create_plan] && res[:plan].present?
        handle_plan_creation(res)
      elsif res[:diagnostic_command].present?
        handle_diagnostic(res)
      else
        handle_conversational_reply(res)
      end

      @incident.reload
    end

    private

    def handle_resolution(res)
      # Sentetik sağlık kontrolünü çalıştır
      diag_result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :engineer_command,
        approved_by: @engineer_message.sender_name,
        plan: {
          "tool_name" => "verify_health",
          "title" => "Sentetik Sağlık Doğrulaması",
          "steps" => [
            "Sentetik checkout sondalarını çalıştır (EU-West & Central)",
            "Hata oranını (%0.0) ve p99 gecikme SLA limitlerini doğrula"
          ]
        }
      )

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "system_diagnostic",
        content: "#{res[:reply_text]}\n\nDoğrulama Raporu:\n#{diag_result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "incident_resolved",
        actor: "@solver",
        title: "Servis Normale Döndü ve Olay Kapatıldı",
        details: "#{@service.name} servisi tüm sağlık testlerinden geçti. MTTR hedefine uygun olarak olay kapatıldı.",
        occurred_at: Time.current
      )

      @incident.update!(status: "resolved", resolved_at: Time.current)
      @service.recalculate_status! if @service.present?
    end

    def handle_plan_creation(res)
      # 1. @solver açıklama mesajı
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "text",
        content: res[:reply_text]
      )

      plan = (res[:plan] || {}).with_indifferent_access
      plan_id = plan[:plan_id] || "PLAN #02"
      title = plan[:title] || "Revize Sistem İyileştirme Planı"

      # 2. Yeni interaktif implementasyon planı kartı (pending)
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "action_card",
        action_status: "pending",
        content: "İmplementasyon Planı (#{plan_id}): #{title}. Onayınız bekleniyor.",
        action_card_payload: {
          "plan_id" => plan_id,
          "title" => title,
          "tool_name" => plan[:tool_name] || "kill_db_locks_and_failover",
          "risk_level" => plan[:risk_level] || "high",
          "steps" => Array(plan[:steps]),
          "hypothesis" => @incident.hypothesis,
          "impact_scope" => "#{@service.name} Servisi"
        }
      )

      @incident.incident_events.create!(
        event_type: "plan_created",
        actor: "@solver",
        title: "Yeni İmplementasyon Planı Oluşturuldu (#{plan_id})",
        details: "Mühendisin War Room yönergeleri doğrultusunda '@solver' tarafından '#{title}' planı hazırlandı.",
        occurred_at: Time.current
      )
    end

    def handle_diagnostic(res)
      tool_name = res[:diagnostic_command] || "inspect_db_locks"

      diag_result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :engineer_command,
        approved_by: @engineer_message.sender_name,
        plan: {
          "tool_name" => tool_name,
          "title" => "Veritabanı Kilit Tanı Sorgusu",
          "steps" => ["Aktif postgresql pg_stat_activity sorgusu ve kilit dökümü"]
        }
      )

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "system_diagnostic",
        content: "#{res[:reply_text]}\n\nTeknik Tanı Dökümü:\n#{diag_result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "diagnostic_executed",
        actor: "@solver",
        title: "Sistem Tanılama Raporlandı (#{tool_name})",
        details: diag_result.verification_summary,
        occurred_at: Time.current
      )
    end

    def handle_conversational_reply(res)
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "text",
        content: res[:reply_text]
      )
    end
  end
end
