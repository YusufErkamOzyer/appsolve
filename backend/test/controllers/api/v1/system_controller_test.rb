require "test_helper"

class Api::V1::SystemControllerTest < ActionDispatch::IntegrationTest
  setup do
    AiSre::AutomationConfig.reset!
  end

  teardown do
    AiSre::AutomationConfig.reset!
  end

  test "GET /api/v1/system/ai_status returns default connected status" do
    get api_v1_system_ai_status_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal true, json["ai_connected"]
    assert_equal "autonomous", json["mode"]
    assert_equal false, json["token_saving_active"]
  end

  test "POST /api/v1/system/ai_disconnect disconnects AI" do
    post api_v1_system_ai_disconnect_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal false, json["ai_connected"]
    assert_equal "paused", json["mode"]
    assert_equal true, json["token_saving_active"]
    assert_includes json["message"], "AI bağlantısı kesildi"
  end

  test "POST /api/v1/system/ai_connect reconnects AI" do
    AiSre::AutomationConfig.ai_connected = false

    post api_v1_system_ai_connect_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal true, json["ai_connected"]
    assert_equal "autonomous", json["mode"]
    assert_equal false, json["token_saving_active"]
    assert_includes json["message"], "AI ajanları başarıyla bağlandı"
  end

  test "POST /api/v1/system/toggle_ai alternates AI connection state" do
    post api_v1_system_toggle_ai_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal false, json["ai_connected"]

    post api_v1_system_toggle_ai_url
    assert_response :success
    json = JSON.parse(response.body)
    assert_equal true, json["ai_connected"]
  end
end
