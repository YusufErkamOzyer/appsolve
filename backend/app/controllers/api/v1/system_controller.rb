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

      # GET /api/v1/system/ai_status
      def ai_status
        render json: AiSre::AutomationConfig.status_payload
      end

      # POST /api/v1/system/ai_connect
      def ai_connect
        AiSre::AutomationConfig.ai_connected = true
        render json: AiSre::AutomationConfig.status_payload.merge(
          message: "AI ajanları başarıyla bağlandı. Hata sinyalleri otomatik olarak triyaj edilecek."
        )
      end

      # POST /api/v1/system/ai_disconnect
      def ai_disconnect
        AiSre::AutomationConfig.ai_connected = false
        render json: AiSre::AutomationConfig.status_payload.merge(
          message: "AI bağlantısı kesildi. Token tasarrufu aktif: Hata sinyalleri yapay zeka ajanlarını tetiklemeyecek."
        )
      end

      # POST /api/v1/system/toggle_ai
      def toggle_ai
        current_state = AiSre::AutomationConfig.ai_connected?
        AiSre::AutomationConfig.ai_connected = !current_state
        render json: AiSre::AutomationConfig.status_payload
      end
    end
  end
end
