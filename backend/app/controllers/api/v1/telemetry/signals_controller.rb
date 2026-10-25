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

          # Create incident without pre-assigned severity; TypeSafe Jev + Gemini AI Triage determines severity
          initial_payload = raw_payload.except("severity", :severity).merge(
            "ai_stage" => "jev_categorizing",
            "ai_status_text" => "Hata inceleniyor — TypeSafe Jev (System One) ile kategorize ediliyor..."
          )

          incident = Incident.create!(
            service: service,
            title: "#{error_code}: #{message.truncate(80)}",
            severity: nil,
            status: "investigating",
            autonomy_mode: "pending_triage",
            raw_payload: initial_payload
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

          # AI SRE Triage & Guardrail Motorunu çalıştır veya Token Tasarrufu Modunda atla
          is_staged_run = params[:staged] == true || params[:async] == true || (!Rails.env.test? && params[:sync] != true)

          if AiSre::AutomationConfig.ai_connected?
            incident_id = incident.id
            if !Rails.env.test? && is_staged_run
              # Canlı ortam: Asenkron arka plan iş parçacığıyla aşamalı ilerle
              Thread.new do
                Rails.application.executor.wrap do
                  AiSre::TriageService.call_staged(incident_id)
                end
              end
              triage_message = "Telemetri sinyali başarıyla alındı ve canlı aşamalı AI triyaj süreci başlatıldı."
            elsif is_staged_run
              # Test ortamında staged talep edildiyse senkron çalıştır
              AiSre::TriageService.call_staged(incident_id)
              triage_message = "Telemetri sinyali başarıyla alındı ve aşamalı AI triyaj tamamlandı."
            else
              # Standart test modu
              AiSre::TriageService.call(incident)
              triage_message = "Telemetri sinyali başarıyla işlendi ve AI Triage tamamlandı."
            end
          else
            handle_disconnected_ai(incident, service, error_code, message)
            triage_message = "AI bağlantısı kesik olduğu için sinyal token harcanmadan kaydedildi (Token Tasarrufu Modu)."
          end

          render json: {
            status: "accepted",
            message: triage_message,
            ai_automation_skipped: !AiSre::AutomationConfig.ai_connected?,
            incident: {
              id: incident.id,
              incident_code: incident.incident_code,
              service_slug: incident.service.slug,
              service_name: service.name,
              service_status: service.reload.status,
              title: incident.title,
              severity: params[:severity].presence || incident.severity,
              normalized_severity: incident.severity,
              ai_stage: incident.ai_stage,
              ai_status_text: incident.ai_status_text,
              jev_triage: incident.raw_payload&.dig("jev_triage"),
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

        private

        def handle_disconnected_ai(incident, service, error_code, message)
          code_upper = error_code.to_s.upcase
          msg_lower = message.to_s.downcase

          fallback_severity = if code_upper.include?("LOCK") || code_upper.include?("DEADLOCK") || msg_lower.include?("lock")
            "SEV-1"
          elsif code_upper.include?("COUPON") || msg_lower.include?("multiplier") || msg_lower.include?("nan")
            "SEV-2"
          elsif code_upper.include?("CACHE") || code_upper.include?("BLOAT")
            "SEV-3"
          else
            "SEV-2"
          end

          service_status = fallback_severity == "SEV-1" ? "outage" : "degraded"
          service.update!(status: service_status, last_incident_at: Time.current)

          incident.update!(
            severity: fallback_severity,
            status: "investigating",
            autonomy_mode: "manual_command_only",
            escalation_target: "none",
            hypothesis: "AI Ajanları Bağlantısı Kesik (Token Tasarrufu Modu). Telemetri kaydedildi.",
            reasoning: "Geliştirici mobil hata testi sırasında yapay zeka token tüketimini engellemek için AI bağlantısını kesti. Otomatik LLM ve karar motoru çağrıları atlandı."
          )

          incident.incident_events.create!(
            event_type: "ai_bypassed",
            actor: "system",
            title: "AI Ajanları Tetiklenmedi (Token Tasarrufu Modu)",
            details: "Appsolve app barından AI bağlantısı kesildiği için TypeSafe Jev ve Gemini Antigravity ajanları çalıştırılmadı. 0 token harcandı.",
            occurred_at: Time.current
          )

          incident.war_room_messages.create!(
            sender_type: "system",
            sender_name: "Appsolve Core",
            message_type: "system_diagnostic",
            content: "⏸️ [AI BAĞLANTISI KESİK - TOKEN TASARRUFU AKTİF]\n\nHata sinyali [#{error_code}] başarıyla kaydedildi ancak gereksiz token tüketimini önlemek amacıyla otomatik AI triyaj ve kod onarım motoru çalıştırılmadı.\n\nAI analizini başlatmak için Appsolve üst barındaki 'BAĞLAN' butonuna tıklayabilirsiniz."
          )

          public_msg = if fallback_severity == "SEV-1"
            "Ödeme sistemlerimizde geçici bir kilitlenme tespit edilmiş olup teknik ekiplerimiz müdahale etmektedir."
          elsif fallback_severity == "SEV-2"
            "Sepet ve indirim kuponu adımlarında geçici bir aksaklık tespit edilmiştir. İnceleme devam etmektedir."
          else
            "Katalog arama ve listeleme servislerimizde hafif yavaşlama gözlemlenmektedir."
          end

          StatusUpdate.create!(
            incident: incident,
            service: service,
            phase: "investigating",
            public_message: public_msg,
            visible_on_status_page: true
          )
        end
      end
    end
  end
end
