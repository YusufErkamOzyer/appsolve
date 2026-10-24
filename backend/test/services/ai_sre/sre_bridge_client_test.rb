# frozen_string_literal: true

require "test_helper"

class SreBridgeClientTest < ActiveSupport::TestCase
  setup do
    @client = AiSre::SreBridgeClient.new(
      bridge_url: "http://localhost:4000",
      secret_token: "quickcart-sre-secret-token"
    )
  end

  def with_mock_http(response_or_proc)
    original_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) do |*args|
      mock = Object.new
      mock.define_singleton_method(:use_ssl=) { |_| }
      mock.define_singleton_method(:read_timeout=) { |_| }
      mock.define_singleton_method(:open_timeout=) { |_| }
      mock.define_singleton_method(:request) do |req|
        if response_or_proc.respond_to?(:call)
          response_or_proc.call(req)
        else
          response_or_proc
        end
      end
      mock
    end
    yield
  ensure
    Net::HTTP.define_singleton_method(:new, original_new)
  end

  test "inspect_db_locks sends POST /api/bridge/v1/exec with command and bearer auth" do
    expected_response = {
      "status" => "success",
      "command" => "inspect_db_locks",
      "output" => "No locks currently detected in registry.",
      "data" => { "count" => 0, "status" => "CLEAR" }
    }

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { expected_response.to_json }

    recorded_req = nil
    handler = proc do |req|
      recorded_req = req
      mock_response
    end

    with_mock_http(handler) do
      res = @client.inspect_db_locks(incident_id: 10)
      assert_equal "success", res[:status]
      assert_equal "inspect_db_locks", res[:command]
      assert_equal 0, res.dig(:data, :count)
    end

    assert_not_nil recorded_req
    assert_equal "/api/bridge/v1/exec", recorded_req.path
    assert_equal "Bearer quickcart-sre-secret-token", recorded_req["Authorization"]
    assert_equal "application/json", recorded_req["Content-Type"]

    body = JSON.parse(recorded_req.body)
    assert_equal "inspect_db_locks", body["command"]
    assert_equal 10, body["incident_id"]
  end

  test "kill_db_locks dispatches command and receives termination summary" do
    expected_response = {
      "status" => "success",
      "command" => "kill_db_locks",
      "output" => "Terminated 1 active locks.",
      "data" => { "killed_count" => 1 }
    }

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { expected_response.to_json }

    with_mock_http(mock_response) do
      res = @client.kill_db_locks
      assert_equal "success", res[:status]
      assert_equal "kill_db_locks", res[:command]
      assert_includes res[:output], "Terminated"
    end
  end

  test "inspect_cache and purge_cache dispatch properly to bridge" do
    purge_response = {
      "status" => "success",
      "command" => "purge_cache",
      "output" => "Purged 5000 cached keys.",
      "data" => { "purged_keys" => 5000 }
    }

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { purge_response.to_json }

    with_mock_http(mock_response) do
      res = @client.purge_cache
      assert_equal "success", res[:status]
      assert_equal "purge_cache", res[:command]
      assert_equal 5000, res.dig(:data, :purged_keys)
    end
  end

  test "sync_source dispatches target_file and content parameters" do
    sync_response = {
      "status" => "success",
      "command" => "sync_source",
      "output" => "Source file 'src/services/cart.service.ts' safely synced and reloaded.",
      "data" => { "file" => "src/services/cart.service.ts", "status" => "synced_and_reloaded" }
    }

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { sync_response.to_json }

    recorded_req = nil
    handler = proc do |req|
      recorded_req = req
      mock_response
    end

    with_mock_http(handler) do
      res = @client.sync_source(
        target_file: "src/services/cart.service.ts",
        content: "export class CartService { /* patched */ }"
      )
      assert_equal "success", res[:status]
      assert_equal "sync_source", res[:command]
      assert_includes res[:output], "safely synced"
    end

    assert_not_nil recorded_req
    body = JSON.parse(recorded_req.body)
    assert_equal "sync_source", body["command"]
    assert_equal "src/services/cart.service.ts", body.dig("params", "target_file")
    assert_includes body.dig("params", "content"), "/* patched */"
  end

  test "health_check verifies overall subsystem health" do
    health_response = {
      "status" => "success",
      "command" => "health_check",
      "output" => "All QuickCart subsystem services operational.",
      "data" => { "healthy" => true, "auth" => 200, "catalog" => 200, "cart" => 200, "checkout" => 200 }
    }

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    mock_response.define_singleton_method(:body) { health_response.to_json }

    with_mock_http(mock_response) do
      res = @client.health_check
      assert_equal "success", res[:status]
      assert res.dig(:data, :healthy)
    end
  end

  test "raises UnauthorizedError when bridge responds with 401" do
    mock_response = Net::HTTPUnauthorized.new("1.1", "401", "Unauthorized")
    mock_response.define_singleton_method(:body) { { "error" => "UNAUTHORIZED_BRIDGE_ACCESS" }.to_json }

    with_mock_http(mock_response) do
      assert_raises(AiSre::SreBridgeClient::UnauthorizedError) do
        @client.health_check
      end
    end
  end

  test "returns error hash without raising when bridge server is connection refused" do
    handler = proc do |_req|
      raise Errno::ECONNREFUSED, "Connection refused - connect(2) for 127.0.0.1:4000"
    end

    with_mock_http(handler) do
      res = @client.health_check
      assert_equal "error", res[:status]
      assert_includes res[:output], "Bridge unreachable"
      assert_not_nil res[:error]
    end
  end
end
