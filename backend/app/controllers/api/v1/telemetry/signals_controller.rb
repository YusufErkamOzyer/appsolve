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
          if params[:raw_payload].present? && (params[:raw_payload].is_a?(ActionController::Parameters) || params[:raw_payload].is_a?(Hash))
            raw_payload = raw_payload.merge(params[:raw_payload].to_unsafe_h)
          end

          raw_severity = params[:severity].to_s.strip
          normalized_severity = case raw_severity.downcase
          when "sev1", "sev-1" then "SEV-1"
          when "sev2", "sev-2" then "SEV-2"
          when "sev3", "sev-3" then "SEV-3"
          else
            if raw_severity.present? && !raw_severity.start_with?("SEV-") && raw_severity.match?(/\Asev[-_]?\d+\z/i)
              "SEV-#{raw_severity.sub(/\Asev[-_]?/i, '')}"
            else
              raw_severity.presence
            end
          end

          incident = Incident.create!(
            service: service,
            title: "#{error_code}: #{message.truncate(80)}",
            severity: normalized_severity,
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
              service_slug: incident.service.slug,
              service_name: service.name,
              service_status: service.reload.status,
              title: incident.title,
              severity: params[:severity].presence || incident.severity,
              normalized_severity: incident.severity,
              raw_payload: incident.raw_payload,
              status: incident.status,
              autonomy_mode: incident.autonomy_mode,
              escalation_target: incident.escalation_target,
              sla_deadline: incident.sla_deadline&.iso8601,
              resolved_at: incident.resolved_at&.iso8601,
              reasoning: incident.reasoning,
              hypothesis: incident.hypothesis,
              recommended_action_plan: incident.recommended_action_plan,
              action_card: (
                latest_card = incident.war_room_messages.to_a.reverse.find { |m| m.message_type == "action_card" }
                (latest_card&.action_card_payload.presence || incident.recommended_action_plan || {}).slice(
                  "plan_id", "title", "tool_name", "risk_level", "hypothesis", "reasoning", "steps",
                  "github_branch", "github_branch_url", "github_pr_number", "github_pr_url",
                  "diff_content", "affected_file", "merge_status", "merge_commit_sha",
                  "sre_bridge_action", "sre_bridge_status", "sre_bridge_output",
                  "terminal_output", "verification_summary", "approved_by", "executed_at", "autonomous"
                )
              ),
              created_at: incident.created_at.iso8601,
              messages: incident.war_room_messages.map do |m|
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
              events: incident.incident_events.order(occurred_at: :asc, id: :asc).map do |ev|
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
