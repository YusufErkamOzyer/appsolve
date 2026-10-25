module Api
  module V1
    class IncidentsController < ApplicationController
      def index
        incidents = Incident.includes(:service, :incident_events, :war_room_messages, :post_mortem).order(created_at: :desc).limit(50)

        render json: {
          total_count: Incident.count,
          active_count: Incident.active.count,
          incidents: incidents.map { |inc| serialize_incident(inc, full: true) }
        }
      end

      def show
        incident = Incident.includes(:service, :incident_events, :war_room_messages, :post_mortem).find(params[:id])
        render json: serialize_incident(incident, full: true)
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      end

      def approve_plan
        incident = Incident.includes(:service, :incident_events, :war_room_messages).find(params[:id])
        approved_by = params[:approved_by] || "Nöbetçi Mühendis (On-Call SRE)"
        plan_id = params[:plan_id]
        message_id = params[:message_id]
        is_staged = params[:staged] == true || (!Rails.env.test? && params[:sync] != true)

        AiSre::RemediationService.approve_plan!(
          incident,
          approved_by: approved_by,
          plan_id: plan_id,
          message_id: message_id,
          staged: is_staged
        )

        render json: {
          status: "executed",
          message: "İmplementasyon planı başarıyla onaylandı ve uygulandı.",
          incident: serialize_incident(incident.reload, full: true)
        }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      rescue AiSre::GuardrailEngine::UnauthorizedActionError => e
        render json: { error: e.message, code: "GUARDRAIL_LOCKED" }, status: :forbidden
      rescue AiSre::RemediationService::AlreadyResolvedError => e
        render json: { error: e.message, code: "ALREADY_RESOLVED" }, status: :unprocessable_entity
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def create_message
        incident = Incident.includes(:service, :incident_events, :war_room_messages).find(params[:id])
        content = params[:content].to_s.strip

        if content.blank?
          return render json: { error: "Mesaj içeriği boş olamaz." }, status: :unprocessable_entity
        end

        sender_name = params[:sender_name].presence || "Nöbetçi Mühendis (On-Call SRE)"
        sender_type = params[:sender_type].presence || "engineer"

        # Mühendis mesajını kaydet
        engineer_msg = incident.war_room_messages.create!(
          sender_type: sender_type,
          sender_name: sender_name,
          content: content,
          message_type: "text"
        )

        # @solver War Room orkestratörünü tetikle
        AiSre::WarRoomOrchestrator.call(incident: incident, engineer_message: engineer_msg)

        render json: {
          status: "ok",
          message: "Mesaj iletildi ve @solver yanıtladı.",
          engineer_message: engineer_msg,
          incident: serialize_incident(incident.reload, full: true)
        }, status: :created
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def reject_plan
        incident = Incident.includes(:service, :incident_events, :war_room_messages).find(params[:id])
        rejected_by = params[:rejected_by] || "Nöbetçi Mühendis (On-Call SRE)"
        reason = params[:reason]

        AiSre::RemediationService.reject_plan!(incident, rejected_by: rejected_by, reason: reason)

        render json: {
          status: "rejected",
          message: "Eylem planı reddedildi. War Room üzerinden manuel talimatlar bekleniyor.",
          incident: serialize_incident(incident.reload, full: true)
        }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      rescue AiSre::RemediationService::AlreadyResolvedError => e
        render json: { error: e.message, code: "ALREADY_RESOLVED" }, status: :unprocessable_entity
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def regenerate_post_mortem
        incident = Incident.includes(:service, :incident_events, :war_room_messages, :post_mortem).find(params[:id])
        unless incident.status == "resolved"
          return render json: { error: "Yalnızca çözülmüş olaylar için Post-Mortem raporu oluşturulabilir." }, status: :unprocessable_entity
        end

        pm = AiSre::PostMortemGenerator.generate!(incident, force_regenerate: true)

        render json: {
          status: "ok",
          message: "Post-Mortem raporu AI ile başarıyla yeniden sentezlendi.",
          post_mortem: {
            summary: pm.summary,
            root_cause: pm.root_cause,
            duration_seconds: pm.duration_seconds,
            mttr_formatted: pm.mttr_formatted,
            affected_services: pm.affected_services,
            action_items: pm.action_items,
            generated_by: pm.generated_by,
            created_at: pm.created_at.iso8601
          },
          incident: serialize_incident(incident.reload, full: true)
        }, status: :ok
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      rescue StandardError => e
        render json: { error: e.message }, status: :internal_server_error
      end

      def export_post_mortem
        incident = Incident.includes(:service, :post_mortem).find(params[:id])
        unless incident.post_mortem.present?
          return render json: { error: "Bu olay için henüz bir Post-Mortem raporu bulunmuyor." }, status: :not_found
        end

        markdown = incident.post_mortem.to_markdown
        clean_code = incident.incident_code.gsub(/[^0-9A-Za-z_-]/, "")
        filename = "post-mortem-#{clean_code}.md"

        send_data markdown,
                  filename: filename,
                  type: "text/markdown; charset=utf-8",
                  disposition: "attachment"
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Incident not found" }, status: :not_found
      end

      private

      def serialize_incident(inc, full: false)
        data = {
          id: inc.id,
          incident_code: inc.incident_code,
          title: inc.title,
          severity: inc.severity,
          status: inc.status,
          autonomy_mode: inc.autonomy_mode,
          escalation_target: inc.escalation_target,
          ai_stage: inc.ai_stage,
          ai_status_text: inc.ai_status_text,
          jev_triage: inc.raw_payload&.dig("jev_triage"),
          hypothesis: inc.hypothesis,
          reasoning: inc.reasoning,
          recommended_action_plan: inc.recommended_action_plan,
          action_card: (
            latest_card = inc.war_room_messages.to_a.reverse.find { |m| m.message_type == "action_card" }
            (latest_card&.action_card_payload.presence || inc.recommended_action_plan || {}).slice(
              "plan_id", "title", "tool_name", "risk_level", "hypothesis", "reasoning", "steps", "plan_stage",
              "github_branch", "github_branch_url", "github_pr_number", "github_pr_url",
              "diff_content", "affected_file", "merge_status", "merge_commit_sha",
              "sre_bridge_action", "sre_bridge_status", "sre_bridge_output",
              "terminal_output", "verification_summary", "approved_by", "executed_at", "autonomous"
            )
          ),
          raw_payload: inc.raw_payload,
          sla_deadline: inc.sla_deadline&.iso8601,
          resolved_at: inc.resolved_at&.iso8601,
          created_at: inc.created_at.iso8601,
          service: {
            id: inc.service.id,
            name: inc.service.name,
            slug: inc.service.slug,
            status: inc.service.status
          },
          events: inc.incident_events.map do |ev|
            {
              id: ev.id,
              event_type: ev.event_type,
              actor: ev.actor,
              title: ev.title,
              details: ev.details,
              occurred_at: ev.occurred_at.iso8601
            }
          end,
          messages: inc.war_room_messages.map do |m|
            {
              id: m.id,
              sender_type: m.sender_type,
              sender_name: m.sender_name,
              content: m.content,
              message_type: m.message_type,
              action_card_payload: m.action_card_payload,
              action_status: m.action_status,
              created_at: m.created_at.iso8601
            }
          end,
          post_mortem: inc.post_mortem ? {
            summary: inc.post_mortem.summary,
            root_cause: inc.post_mortem.root_cause,
            duration_seconds: inc.post_mortem.duration_seconds,
            mttr_formatted: inc.post_mortem.mttr_formatted,
            affected_services: inc.post_mortem.affected_services,
            action_items: inc.post_mortem.action_items,
            generated_by: inc.post_mortem.generated_by,
            created_at: inc.post_mortem.created_at.iso8601
          } : nil
        }

        data
      end
    end
  end
end
