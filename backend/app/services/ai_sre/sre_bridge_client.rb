# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module AiSre
  class SreBridgeClient
    class BridgeError < StandardError; end
    class UnauthorizedError < BridgeError; end
    class CommandError < BridgeError; end
    class ConnectionError < BridgeError; end

    DEFAULT_BRIDGE_URL = "http://localhost:4000"
    DEFAULT_BRIDGE_SECRET = "quickcart-sre-secret-token"

    attr_reader :bridge_url, :secret_token

    def initialize(bridge_url: nil, secret_token: nil)
      @bridge_url = (bridge_url || ENV["QUICKCART_BRIDGE_URL"] || DEFAULT_BRIDGE_URL).to_s.chomp("/")
      @secret_token = secret_token || ENV["QUICKCART_BRIDGE_SECRET"] || DEFAULT_BRIDGE_SECRET
    end

    def exec(command, params = {}, incident_id: nil, requested_by: "Appsolve AI SRE")
      uri = URI("#{@bridge_url}/api/bridge/v1/exec")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.read_timeout = 10
      http.open_timeout = 3

      req = Net::HTTP::Post.new(uri.request_uri)
      req["Content-Type"] = "application/json"
      req["Authorization"] = "Bearer #{@secret_token}"

      body_payload = {
        command: command.to_s,
        params: params,
        incident_id: incident_id,
        requested_by: requested_by
      }
      req.body = body_payload.to_json

      response = http.request(req)
      handle_response(response, command)
    rescue Errno::ECONNREFUSED, Errno::EADDRNOTAVAIL, Net::OpenTimeout, Net::ReadTimeout, SocketError => e
      Rails.logger.warn("[AiSre::SreBridgeClient] Failed to connect to bridge at #{@bridge_url}: #{e.message}")
      {
        status: "error",
        command: command.to_s,
        output: "Bridge unreachable at #{@bridge_url} (#{e.message})",
        data: {},
        error: e.message
      }.with_indifferent_access
    end

    def inspect_db_locks(params = {}, incident_id: nil)
      exec("inspect_db_locks", params, incident_id: incident_id)
    end

    def kill_db_locks(params = {}, incident_id: nil)
      exec("kill_db_locks", params, incident_id: incident_id)
    end

    def inspect_cache(params = {}, incident_id: nil)
      exec("inspect_cache", params, incident_id: incident_id)
    end

    def purge_cache(params = {}, incident_id: nil)
      exec("purge_cache", params, incident_id: incident_id)
    end

    def sync_source(target_file:, content:, params: {}, incident_id: nil)
      all_params = (params || {}).merge(target_file: target_file, content: content)
      exec("sync_source", all_params, incident_id: incident_id)
    end

    def health_check(params = {}, incident_id: nil)
      exec("health_check", params, incident_id: incident_id)
    end

    private

    def handle_response(response, command)
      case response.code.to_i
      when 200..299
        parsed = JSON.parse(response.body) rescue { "status" => "success", "command" => command, "output" => response.body }
        parsed = parsed.with_indifferent_access
        parsed[:status] ||= "success"
        parsed
      when 401
        raise UnauthorizedError, "QuickCart SRE Bridge Unauthorized: #{response.body}"
      else
        parsed = JSON.parse(response.body) rescue { "error" => response.body }
        parsed = parsed.with_indifferent_access
        parsed[:status] ||= "error"
        parsed[:command] ||= command
        parsed[:output] ||= parsed[:message] || parsed[:error] || "Bridge error HTTP #{response.code}"
        parsed
      end
    end
  end
end
