module AiSre
  class GuardrailEngine
    class UnauthorizedActionError < StandardError; end

    def self.apply_guardrails!(incident)
      new(incident).apply!
    end

    def self.authorize_autonomous_execution!(incident)
      new(incident).authorize_autonomous_execution!
    end

    def self.authorize_approved_plan!(incident, approved_by: "on_call_engineer")
      new(incident).authorize_approved_plan!(approved_by: approved_by)
    end

    def self.authorize_engineer_command!(incident, engineer_name: "on_call_engineer")
      new(incident).authorize_engineer_command!(engineer_name: engineer_name)
    end

    def initialize(incident)
      @incident = incident
      @service = incident.service
    end

    def apply!
      case @incident.severity
      when "SEV-1"
        apply_sev1_guardrails!
      when "SEV-2"
        apply_sev2_guardrails!
      when "SEV-3"
        apply_sev3_guardrails!
      else
        apply_fallback_guardrails!
      end

      @incident.save!
      @incident
    end

    def authorize_autonomous_execution!
      unless @incident.autonomy_mode == "full_autonomy" && @incident.severity == "SEV-3"
        @incident.incident_events.create!(
          event_type: "guardrail_blocked",
          actor: "guardrail_engine",
          title: "GÜVENLİK KİLİDİ: İzinsiz Otonom Müdahale Engellendi",
          details: "Ajanın #{@incident.severity || 'Bilinmeyen'} seviyesindeki #{@incident.incident_code} olayına otonom müdahale girişimi Guardrail motoru tarafından kod seviyesinde engellendi (Mevcut mod: #{@incident.autonomy_mode}).",
          occurred_at: Time.current
        )

        raise UnauthorizedActionError,
              "Guardrail ihlali: #{@incident.severity} seviyesindeki olaya otonom müdahale yapılamaz! Mevcut yetki modu: #{@incident.autonomy_mode}."
      end

      true
    end

    def authorize_approved_plan!(approved_by: "on_call_engineer")
      if approved_by.blank?
        @incident.incident_events.create!(
          event_type: "guardrail_blocked",
          actor: "guardrail_engine",
          title: "GÜVENLİK KİLİDİ: İsimsiz/Yetkisiz Onay Reddedildi",
          details: "İmplementasyon planları ancak yetkili bir nöbetçi mühendisin açık onayıyla yürütülebilir.",
          occurred_at: Time.current
        )

        raise UnauthorizedActionError, "Guardrail ihlali: Onaylayan mühendis bilgisi zorunludur!"
      end

      if @incident.autonomy_mode == "manual_command_only"
        @incident.incident_events.create!(
          event_type: "guardrail_authorized",
          actor: "guardrail_engine",
          title: "GÜVENLİK KİLİDİ: Mühendis Doğrudan Onayı Yetkilendirildi (SEV-1)",
          details: "#{approved_by} tarafından @solver implementasyon planı incelendi ve doğrudan icra yetkisi verildi.",
          occurred_at: Time.current
        )
      end

      true
    end

    def authorize_engineer_command!(engineer_name: "on_call_engineer")
      @incident.incident_events.create!(
        event_type: "guardrail_authorized",
        actor: "guardrail_engine",
        title: "GÜVENLİK KİLİDİ: Mühendis Doğrudan Komutu Yetkilendirildi",
        details: "#{engineer_name} tarafından verilen doğrudan komut icraya alındı.",
        occurred_at: Time.current
      )
      true
    end

    private

    def apply_sev1_guardrails!
      @incident.autonomy_mode = "manual_command_only"
      @incident.escalation_target = "on_call_and_team_lead"
      @incident.sla_deadline = 15.minutes.from_now

      @service.update!(status: "outage") if @service.present?

      @incident.incident_events.build(
        event_type: "guardrail_locked",
        actor: "guardrail_engine",
        title: "Otonomi Kilidi: TAM GÜVENLİK KİLİDİ DEVREDE (SEV-1)",
        details: "Kritik SEV-1 kesintisi sebebiyle ajanın otonom müdahale yetkisi tamamen kapatıldı. Yalnızca War Room üzerinden mühendis komutları icra edilebilir.",
        occurred_at: Time.current
      )

      @incident.incident_events.build(
        event_type: "escalation_triggered",
        actor: "guardrail_engine",
        title: "Akıllı Eskalasyon: Nöbetçi Mühendis ve Takım Lideri Çağrıldı",
        details: "15 dakikalık SLA geri sayım sayacı başlatıldı. SRE On-Call ve Takım Liderine P1 çağrısı gönderildi.",
        occurred_at: Time.current
      )
    end

    def apply_sev2_guardrails!
      @incident.autonomy_mode = "approval_required"
      @incident.escalation_target = "on_call_engineer"
      @incident.sla_deadline = 30.minutes.from_now

      @service.update!(status: "degraded") if @service.present? && @service.status == "operational"

      @incident.incident_events.build(
        event_type: "guardrail_locked",
        actor: "guardrail_engine",
        title: "Otonomi Kilidi: TEK TIKLA İNSAN ONAYI ŞARTI (SEV-2)",
        details: "Ajanın doğrudan müdahalesi kilitlendi. Çözüm planı hazırlandı, nöbetçi mühendisin eylem kartı üzerinden onayı bekleniyor.",
        occurred_at: Time.current
      )

      @incident.incident_events.build(
        event_type: "escalation_triggered",
        actor: "guardrail_engine",
        title: "Akıllı Eskalasyon: Nöbetçi Mühendis Çağrıldı",
        details: "30 dakikalık çözüm hedefi belirlendi. War Room içine interaktif onay kartı bırakıldı.",
        occurred_at: Time.current
      )
    end

    def apply_sev3_guardrails!
      @incident.autonomy_mode = "full_autonomy"
      @incident.escalation_target = "none"
      @incident.sla_deadline = nil

      @incident.incident_events.build(
        event_type: "guardrail_locked",
        actor: "guardrail_engine",
        title: "Otonomi Kilidi: TAM OTONOMİ YETKİSİ TANINDI (SEV-3)",
        details: "Düşük riskli minör olay tespit edildi. Ajan, insan onayı beklemeksizin düzeltmeyi kendi başına uygulama yetkisine sahiptir.",
        occurred_at: Time.current
      )

      @incident.incident_events.build(
        event_type: "escalation_triggered",
        actor: "guardrail_engine",
        title: "Akıllı Eskalasyon: Sessiz Mod (Kimse Rahatsız Edilmedi)",
        details: "Ana kullanıcı akışı çalıştığı için insan çağrısı yapılmadı. Otonom iyileştirme adımı başlatıldı.",
        occurred_at: Time.current
      )
    end

    def apply_fallback_guardrails!
      @incident.autonomy_mode = "approval_required"
      @incident.escalation_target = "on_call_engineer"
      @incident.sla_deadline = 60.minutes.from_now
    end
  end
end
