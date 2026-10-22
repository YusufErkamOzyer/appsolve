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
            severity: params[:severity], # Optional, Step 2 Gemini AI Triage will auto-determine
            status: "investigating",
            autonomy_mode: "pending_triage",
            raw_payload: raw_payload
          )

          # Update service last incident timestamp
          service.update!(last_incident_at: Time.current)

          event = incident.incident_events.create!(
            event_type: "signal_received",
            actor: "system",
            title: "QuickCart ham telemetri sinyali yakalandı",
            details: "Harici QuickCart istemcisinden [#{error_code}] hata sinyali kaydedildi. Ayrıntı: #{message}",
            occurred_at: Time.current
          )

          render json: {
            status: "accepted",
            message: "Telemetri sinyali başarıyla kaydedildi.",
            incident: {
              id: incident.id,
              incident_code: incident.incident_code,
              service_slug: service.slug,
              service_name: service.name,
              title: incident.title,
              severity: incident.severity,
              status: incident.status,
              created_at: incident.created_at.iso8601,
              timeline_event: {
                id: event.id,
                event_type: event.event_type,
                title: event.title,
                details: event.details,
                occurred_at: event.occurred_at.iso8601
              }
            }
          }, status: :created
        rescue ActiveRecord::RecordInvalid => e
          render json: { error: e.message }, status: :unprocessable_entity
        end
      end
    end
  end
end
