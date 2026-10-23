module Api
  module V1
    module Telemetry
      class SignalsController < ApplicationController
        def create
          service_slug = params[:service_slug] || params[:service]
          service = Service.find_by(slug: service_slug) || Service.find_by("LOWER(name) = ?", service_slug.to_s.downcase) || Service.first

          error_code = params[:error_code] || "UNKNOWN_TELEMETRY_ERROR"
          message = params[:message] || "Ham telemetri hata sinyali alındı."
          raw_payload = params.to_unsafe_h

          incident = Incident.create!(
            service: service,
            title: "#{error_code}: #{message.truncate(80)}",
            severity: params[:severity],
            status: "investigating",
            autonomy_mode: "pending_triage",
            raw_payload: raw_payload
          )

          # Update service last incident timestamp
          service.update!(last_incident_at: Time.current)

          incident.incident_events.create!(
            event_type: "signal_received",
            actor: "system",
            title: "QuickCart ham telemetri sinyali yakalandı",
            details: "Harici QuickCart istemcisinden [#{error_code}] hata sinyali kaydedildi. Ayrıntı: #{message}",
            occurred_at: Time.current
          )

          # AI SRE Triage & Guardrail Motorunu çalıştır
          AiSre::TriageService.call(incident)

          render json: {
            status: "accepted",
            message: "Telemetri sinyali başarıyla işlendi ve AI Triage tamamlandı.",
            incident: {
              id: incident.id,
              incident_code: incident.incident_code,
              service_slug: service.slug,
              service_name: service.name,
              service_status: service.reload.status,
              title: incident.title,
              severity: incident.severity,
              status: incident.status,
              autonomy_mode: incident.autonomy_mode,
              escalation_target: incident.escalation_target,
              sla_deadline: incident.sla_deadline&.iso8601,
              reasoning: incident.reasoning,
              hypothesis: incident.hypothesis,
              recommended_action_plan: incident.recommended_action_plan,
              created_at: incident.created_at.iso8601,
              events: incident.incident_events.order(occurred_at: :asc).map do |ev|
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
          }, status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { error: e.message }, status: :unprocessable_entity
        end
      end
    end
  end
end
