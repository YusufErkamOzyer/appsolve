module Api
  module V1
    class ServicesController < ApplicationController
      def index
        services = Service.all.order(:id)
        system_status = Service.system_health_status
        updates = StatusUpdate.visible_to_public.limit(25)

        render json: {
          system_status: system_status,
          system_status_label: status_label(system_status),
          system_status_description: status_description(system_status),
          last_synced_at: Time.current.iso8601,
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
              last_incident_at: s.last_incident_at,
              metadata: s.metadata,
              active_incident: s.active_incident ? {
                id: s.active_incident.id,
                incident_code: s.active_incident.incident_code,
                title: s.active_incident.title,
                severity: s.active_incident.severity,
                status: s.active_incident.status
              } : nil
            }
          end,
          status_updates: updates.map(&:as_public_json)
        }
      end

      def show
        service = Service.find_by!(slug: params[:id])
        render json: service
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Service not found with slug: #{params[:id]}" }, status: :not_found
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
          "Bazı servislerimizde performans kaybı veya inceleme süreci devam etmektedir. Teknik ekibimiz durumu takip etmektedir."
        when "major_outage"
          "Kritik servis kesintisi tespit edilmiştir. Acil müdahale ve kurtarma çalışmaları devam etmektedir."
        else
          "Sistem durumu kontrol edilmektedir."
        end
      end

      def service_status_label(status)
        case status
        when "operational" then "ÇALIŞIYOR"
        when "degraded" then "PERFORMANS KAYBI"
        when "outage" then "KESİNTİ"
        else status.upcase
        end
      end
    end
  end
end
