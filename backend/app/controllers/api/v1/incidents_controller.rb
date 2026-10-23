module Api
  module V1
    class IncidentsController < ApplicationController
      def index
        incidents = Incident.includes(:service, :incident_events).order(created_at: :desc).limit(50)

        render json: {
          total_count: Incident.count,
          active_count: Incident.active.count,
          incidents: incidents.map { |inc| serialize_incident(inc) }
        }
      end

      def show
        incident = Incident.includes(:service, :incident_events, :war_room_messages, :post_mortem).find(params[:id])
        render json: serialize_incident(incident, full: true)
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
          hypothesis: inc.hypothesis,
          reasoning: inc.reasoning,
          recommended_action_plan: inc.recommended_action_plan,
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
          end
        }

        if full
          data[:raw_payload] = inc.raw_payload
          data[:recommended_action_plan] = inc.recommended_action_plan
          data[:messages] = inc.war_room_messages.map do |m|
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
          end
          data[:post_mortem] = inc.post_mortem ? {
            summary: inc.post_mortem.summary,
            root_cause: inc.post_mortem.root_cause,
            duration_seconds: inc.post_mortem.duration_seconds,
            mttr_formatted: inc.post_mortem.mttr_formatted,
            affected_services: inc.post_mortem.affected_services,
            action_items: inc.post_mortem.action_items,
            generated_by: inc.post_mortem.generated_by
          } : nil
        end

        data
      end
    end
  end
end
