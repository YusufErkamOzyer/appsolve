module Api
  module V1
    class StatusPageController < ApplicationController
      def show
        services = Service.all.order(:id)
        system_status = Service.system_health_status
        updates = StatusUpdate.visible_to_public.limit(30)
        active_incidents = Incident.active.order(created_at: :desc)
        recent_incidents = Incident.where("created_at >= ?", 48.hours.ago).order(created_at: :desc).limit(10)

        render json: {
          system_status: system_status,
          system_status_label: status_label(system_status),
          system_status_description: status_description(system_status),
          last_synced_at: Time.current.iso8601,
          meta: {
            app_name: "Appsolve Status Engine",
            version: "1.1",
            poll_interval_seconds: 3,
            mobile_client_support: true,
            telemetry_endpoint: "/api/v1/telemetry/signals"
          },
          services: services.map do |s|
            {
              id: s.id,
              name: s.name,
              name_en: s.name_en,
              slug: s.slug,
              status: s.status,
              status_label: service_status_label(s.status),
              uptime_percentage: s.uptime_percentage,
              description: s.description,
              last_incident_at: s.last_incident_at&.iso8601,
              active_incident: s.active_incident ? {
                id: s.active_incident.id,
                incident_code: s.active_incident.incident_code,
                title: s.active_incident.title,
                severity: s.active_incident.severity,
                status: s.active_incident.status
              } : nil
            }
          end,
          status_updates: updates.map(&:as_public_json),
          active_incidents: active_incidents.map { |inc| incident_summary(inc) },
          recent_incidents: recent_incidents.map { |inc| incident_summary(inc) }
        }
      end

      private

      def status_label(status)
        case status
        when "all_operational" then "Tüm Sistemler Normal Çalışıyor"
        when "partial_outage" then "Kısmi Performans Kaybı"
        when "major_outage" then "Kritik Sistem Kesintisi"
        else "Bilinmeyen Durum"
        end
      end

      def status_description(status)
        case status
        when "all_operational"
          "Tüm mobil ve web servislerimiz kesintisiz ve yüksek performansla hizmet vermektedir. Altyapı telemetrisi gerçek zamanlı doğrulanmaktadır."
        when "partial_outage"
          "Bazı servislerimizde performans kaybı veya inceleme süreci devam etmektedir. Teknik ekibimiz durumu yakından takip etmektedir."
        when "major_outage"
          "Kritik servis kesintisi tespit edilmiştir. Acil müdahale ve sistem kurtarma çalışmaları devam etmektedir."
        else
          "Sistem durumu kontrol edilmektedir."
        end
      end

      def service_status_label(status)
        case status
        when "operational" then "ÇALIŞIYOR"
        when "degraded" then "PERFORMANS KAYBI"
        when "outage" then "KESİNTİ"
        else status.to_s.upcase
        end
      end

      def incident_summary(incident)
        {
          id: incident.id,
          incident_code: incident.incident_code,
          service_name: incident.service&.name,
          service_slug: incident.service&.slug,
          severity: incident.severity,
          status: incident.status,
          title: incident.title,
          created_at: incident.created_at.iso8601,
          resolved_at: incident.resolved_at&.iso8601,
          updates: incident.status_updates.visible_to_public.map(&:as_public_json)
        }
      end
    end
  end
end
