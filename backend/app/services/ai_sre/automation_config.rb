module AiSre
  class AutomationConfig
    class << self
      def state_file
        Rails.root.join("tmp", "ai_automation_state_#{Rails.env}.json")
      end

      def ai_connected?
        return @ai_connected unless @ai_connected.nil?

        if File.exist?(state_file)
          begin
            data = JSON.parse(File.read(state_file))
            @ai_connected = data["ai_connected"] != false
          rescue
            @ai_connected = true
          end
        else
          @ai_connected = true
        end
        @ai_connected
      end

      def ai_connected=(value)
        @ai_connected = value ? true : false
        begin
          FileUtils.mkdir_p(File.dirname(state_file))
          File.write(state_file, JSON.generate({
            ai_connected: @ai_connected,
            mode: @ai_connected ? "autonomous" : "paused",
            updated_at: Time.current.iso8601
          }))
        rescue => e
          Rails.logger.warn("Could not persist AI automation state: #{e.message}")
        end
        @ai_connected
      end

      def reset!
        @ai_connected = true
        FileUtils.rm_f(state_file)
      end

      def status_payload
        connected = ai_connected?
        {
          ai_connected: connected,
          mode: connected ? "autonomous" : "paused",
          label: connected ? "AI Ajanları Bağlı (Otomatik Triyaj)" : "AI Bağlantısı Kesik (Token Tasarrufu)",
          token_saving_active: !connected,
          updated_at: Time.current.iso8601
        }
      end
    end
  end
end
