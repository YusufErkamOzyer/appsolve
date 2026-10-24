module AiSre
  class RemediationService
    class AlreadyResolvedError < StandardError; end
    class InvalidStateError < StandardError; end

    def self.route_after_triage!(incident)
      new(incident).route_after_triage!
    end

    def self.approve_plan!(incident, approved_by: "Nöbetçi Mühendis (On-Call SRE)", plan_id: nil, message_id: nil)
      new(incident).approve_plan!(approved_by: approved_by, plan_id: plan_id, message_id: message_id)
    end

    def self.reject_plan!(incident, rejected_by: "Nöbetçi Mühendis (On-Call SRE)", reason: nil)
      new(incident).reject_plan!(rejected_by: rejected_by, reason: reason)
    end

    def initialize(incident)
      @incident = incident
      @service = incident.service
    end

    def route_after_triage!
      if @incident.can_execute_autonomously?
        execute_autonomous_resolution!
      elsif @incident.requires_human_approval?
        prepare_human_approval_card!
      elsif @incident.locked_to_manual_commands?
        prepare_manual_war_room_state!
      end

      @incident.reload
    end

    def approve_plan!(approved_by: "Nöbetçi Mühendis (On-Call SRE)", plan_id: nil, message_id: nil)
      if @incident.status == "resolved"
        raise AlreadyResolvedError, "Olay (#{@incident.incident_code}) zaten çözülmüş durumda."
      end

      # Guardrail Engine doğrulaması (insan onayı kontrolü)
      AiSre::GuardrailEngine.authorize_approved_plan!(@incident, approved_by: approved_by)

      # İlgili action_card mesajını bul (mesaj id'si, plan_id veya en son pending plan)
      action_card_msg =
        if message_id.present?
          @incident.war_room_messages.find_by(id: message_id)
        elsif plan_id.present?
          @incident.war_room_messages.where(message_type: "action_card").to_a.find { |m| m.action_card_payload&.dig("plan_id") == plan_id }
        else
          @incident.war_room_messages.where(message_type: "action_card", action_status: "pending").last ||
            @incident.war_room_messages.where(message_type: "action_card").last
        end

      plan = action_card_msg&.action_card_payload.presence || @incident.recommended_action_plan || {}
      active_plan_id = plan["plan_id"] || plan[:plan_id] || "PLAN #01"
      title = plan["title"] || plan[:title] || "Sistem Müdahalesi"

      @incident.incident_events.create!(
        event_type: "plan_approved",
        actor: "on_call_engineer",
        title: "İmplementasyon Planı Onaylandı (#{active_plan_id})",
        details: "#{approved_by} tarafından '#{title}' planı tek tıkla onaylandı ve icra başlatıldı.",
        occurred_at: Time.current
      )

      # Müdahale aracını çalıştır
      result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :human_approved,
        approved_by: approved_by,
        plan: plan
      )

      payload = build_action_card_payload(result: result, approved_by: approved_by, plan: plan)

      if action_card_msg
        action_card_msg.update!(
          action_status: "executed",
          action_card_payload: payload,
          content: "#{title} implementasyon planı #{approved_by} onayıyla başarıyla uygulandı."
        )
      else
        @incident.war_room_messages.create!(
          sender_type: "gemini_ai_agent",
          sender_name: "@solver (AI SRE Ajanı)",
          message_type: "action_card",
          action_status: "executed",
          content: "#{title} implementasyon planı #{approved_by} onayıyla başarıyla uygulandı.",
          action_card_payload: payload
        )
      end

      # Ajanın teknik doğrulama mesajı
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "system_diagnostic",
        content: "İmplementasyon tamamlandı: #{result.verification_summary}\n\nTeknik Çıktı:\n#{result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "remediation_executed",
        actor: "gemini_ai_agent",
        title: "Sistem Düzeltmesi Başarıyla Uygulandı (#{result.tool_name})",
        details: result.verification_summary,
        occurred_at: Time.current
      )

      @incident.incident_events.create!(
        event_type: "incident_resolved",
        actor: "gemini_ai_agent",
        title: "Servis Normale Döndü ve Olay Kapatıldı",
        details: "#{@service.name} servisi operasyonel duruma getirildi. MTTR hedefine uygun olarak olay kapatıldı.",
        occurred_at: Time.current
      )

      # Olayı kapat ve servis durumunu yeniden hesapla
      @incident.update!(status: "resolved", resolved_at: Time.current)
      @service.recalculate_status! if @service.present?

      # Müşteri Durum Sayfası ve Mobil Bildirimi (Çözüldü)
      AiSre::CustomerCommunicationService.publish_resolved!(@incident)

      # Otomatik Post-Mortem Raporu Üretimi (PostMortem 1.1)
      AiSre::PostMortemGenerator.generate!(@incident)

      @incident.reload
    end

    def reject_plan!(rejected_by: "Nöbetçi Mühendis (On-Call SRE)", reason: nil)
      if @incident.status == "resolved"
        raise AlreadyResolvedError, "Olay (#{@incident.incident_code}) zaten çözülmüş durumda."
      end

      plan = @incident.recommended_action_plan || {}
      plan_id = plan["plan_id"] || "PLAN #01"

      @incident.incident_events.create!(
        event_type: "plan_rejected",
        actor: "on_call_engineer",
        title: "Eylem Planı Reddedildi (#{plan_id})",
        details: "#{rejected_by} tarafından önerilen plan reddedildi. #{reason.present? ? "Gerekçe: #{reason}" : 'Manuel komut moduna geçildi.'}",
        occurred_at: Time.current
      )

      action_card_msg = @incident.war_room_messages.find_by(message_type: "action_card", action_status: "pending")
      if action_card_msg
        payload = (action_card_msg.action_card_payload || {}).dup
        payload["rejected_by"] = rejected_by
        payload["rejected_at"] = Time.current.iso8601
        payload["rejection_reason"] = reason

        action_card_msg.update!(
          action_status: "rejected",
          action_card_payload: payload,
          content: "Önerilen eylem planı mühendis tarafından reddedildi."
        )
      end

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "text",
        content: "Eylem planı reddedildi. Sistemi korumak için beklemeye geçtim; lütfen War Room üzerinden manuel talimatlarınızı iletin."
      )

      @incident.reload
    end

    private

    # Yol A (SEV-3): Tam Otonom İnsansız Çözüm
    def execute_autonomous_resolution!
      result = AiSre::SystemToolRunner.execute!(
        incident: @incident,
        execution_mode: :autonomous
      )

      payload = build_action_card_payload(result: result, autonomous: true)

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "action_card",
        action_status: "autonomous_executed",
        content: "Minör SEV-3 olayı için otonom iyileştirme planı insan müdahalesi olmadan icra edildi.",
        action_card_payload: payload
      )

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "system_diagnostic",
        content: "Otonom Doğrulama: #{result.verification_summary}\n\nTeknik Çıktı:\n#{result.terminal_output}"
      )

      @incident.incident_events.create!(
        event_type: "autonomous_remediation_executed",
        actor: "gemini_ai_agent",
        title: "Otonom Sistem Müdahalesi Uygulandı (#{result.plan_id})",
        details: "#{result.tool_name} aracı tam yetkiyle çalıştırıldı: #{result.verification_summary}",
        occurred_at: Time.current
      )

      @incident.incident_events.create!(
        event_type: "incident_resolved",
        actor: "gemini_ai_agent",
        title: "Servis Sağlığı Doğrulandı ve Olay Kapatıldı",
        details: "#{@service.name} servisi metrikleri normale döndü. Olay insan müdahalesi gerekmeden otonom olarak çözüldü.",
        occurred_at: Time.current
      )

      @incident.update!(status: "resolved", resolved_at: Time.current)
      @service.recalculate_status! if @service.present?

      # Müşteri Durum Sayfası ve Mobil Bildirimi (SEV-3 Otonom Çözüm)
      AiSre::CustomerCommunicationService.publish_autonomous_resolution!(@incident)

      # Otomatik Post-Mortem Raporu Üretimi (PostMortem 1.1)
      AiSre::PostMortemGenerator.generate!(@incident)
    end

    # Yol B (SEV-2): Nöbetçi Mühendis İçin İnteraktif Eylem Kartı Hazırlığı
    def prepare_human_approval_card!
      plan = @incident.recommended_action_plan || {}
      payload = {
        "plan_id" => plan["plan_id"] || "PLAN #02",
        "title" => plan["title"] || "Sistem İyileştirme Planı",
        "tool_name" => plan["tool_name"] || "rollback_feature_flag",
        "risk_level" => plan["risk_level"] || "medium",
        "hypothesis" => @incident.hypothesis,
        "reasoning" => @incident.reasoning,
        "steps" => Array(plan["steps"]),
        "estimated_duration" => "10-15 dk",
        "impact_scope" => "#{@service.name} Servisi (#{@service.slug})"
      }

      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "Gemini AI SRE Ajanı",
        message_type: "action_card",
        action_status: "pending",
        content: "Kök neden hipotezi doğrultusunda tek tıkla uygulanabilir bir iyileştirme planı hazırladım. Onayınız bekleniyor.",
        action_card_payload: payload
      )

      @incident.incident_events.create!(
        event_type: "action_card_posted",
        actor: "gemini_ai_agent",
        title: "War Room İçine Eylem Kartı Bırakıldı (#{payload['plan_id']})",
        details: "Nöbetçi mühendisin tek tıkla onaylayabileceği çözüm planı War Room'da hazırlandı.",
        occurred_at: Time.current
      )

      # Müşteri Durum Sayfası ve Mobil Bildirimi (Sorun Tespit Edildi / Müdahale Hazırlandı)
      AiSre::CustomerCommunicationService.publish_identified!(@incident)
    end

    # Yol C (SEV-1): AI Hipotez, Hata Açıklaması ve Tek Tıkla İnteraktif İmplementasyon Planı
    def prepare_manual_war_room_state!
      plan = @incident.recommended_action_plan || {}
      payload = {
        "plan_id" => plan["plan_id"] || "PLAN #01",
        "title" => plan["title"] || "Kritik Sistem Kurtarma",
        "tool_name" => plan["tool_name"] || "kill_db_locks_and_failover",
        "risk_level" => "high",
        "hypothesis" => @incident.hypothesis,
        "steps" => Array(plan["steps"]),
        "guardrail_status" => "manual_command_only"
      }

      # 1. @solver Hata ve Hipotez Açıklaması
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "text",
        content: "🚨 KRİTİK SEV-1 KRİZİ TESPİT EDİLDİ\n\n" \
                 "🔍 Hata Açıklaması: #{@incident.reasoning}\n\n" \
                 "💡 Kök Neden Hipotezi: #{@incident.hypothesis}\n\n" \
                 "Bu sorunu gidermek üzere aşağıda 'PLAN #01' implementasyon planını hazırladım. " \
                 "Tek tıkla çalıştırabilir veya sohbet üzerinden bana (@solver) yeni yönergeler vererek planı revize etmemi isteyebilirsiniz."
      )

      # 2. Tek tıkla çalıştırılabilir ilk implementasyon planı (pending)
      @incident.war_room_messages.create!(
        sender_type: "gemini_ai_agent",
        sender_name: "@solver (AI SRE Ajanı)",
        message_type: "action_card",
        action_status: "pending",
        content: "İmplementasyon Planı (#{payload['plan_id']}): #{payload['title']}. Onayınız bekleniyor.",
        action_card_payload: payload
      )

      @incident.incident_events.create!(
        event_type: "war_room_opened",
        actor: "gemini_ai_agent",
        title: "War Room Açıldı: @solver İmplementasyon Planı Hazırladı (SEV-1)",
        details: "Nöbetçi Mühendis ve Takım Lideri için canlı kriz odası açıldı. @solver ilk müdahale planını sundu.",
        occurred_at: Time.current
      )

      # Müşteri Durum Sayfası ve Mobil Bildirimi (Sorun Tespit Edildi / Kurtarma Planı Hazırlandı)
      AiSre::CustomerCommunicationService.publish_identified!(@incident)
    end

    def build_action_card_payload(result:, approved_by: nil, autonomous: false, plan: nil)
      p = plan || @incident.recommended_action_plan || {}
      {
        "plan_id" => result.plan_id.presence || p["plan_id"] || "PLAN #01",
        "title" => result.title.presence || p["title"] || "Sistem Müdahalesi",
        "tool_name" => result.tool_name.presence || p["tool_name"],
        "risk_level" => p["risk_level"] || (autonomous ? "low" : "high"),
        "hypothesis" => @incident.hypothesis,
        "steps" => result.executed_steps.presence || p["steps"],
        "terminal_output" => result.terminal_output,
        "verification_summary" => result.verification_summary,
        "executed_at" => result.executed_at.iso8601,
        "approved_by" => approved_by,
        "autonomous" => autonomous
      }
    end
  end
end
