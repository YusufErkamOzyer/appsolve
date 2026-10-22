module Api
  module V1
    class SystemController < ApplicationController
      def reset
        Incident.destroy_all
        StatusUpdate.destroy_all
        Service.update_all(status: "operational", last_incident_at: nil)

        render json: {
          status: "ok",
          message: "Sistem durumu başarıyla sıfırlandı. Tüm servisler operasyonel yeşil duruma getirildi.",
          timestamp: Time.current.iso8601
        }
      end
    end
  end
end
