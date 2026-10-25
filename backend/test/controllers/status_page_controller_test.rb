require "test_helper"

class StatusPageControllerTest < ActionDispatch::IntegrationTest
  test "GET /api/v1/status_page returns comprehensive mobile and web status payload" do
    get "/api/v1/status_page"

    assert_response :success
    data = JSON.parse(response.body)

    assert_includes %w[all_operational partial_outage major_outage], data["system_status"]
    assert data["system_status_label"].present?
    assert data["system_status_description"].present?
    assert data["last_synced_at"].present?

    # Verify 4 microservices
    assert_equal 4, data["services"].size
    slugs = data["services"].map { |s| s["slug"] }
    assert_includes slugs, "auth"
    assert_includes slugs, "catalog"
    assert_includes slugs, "cart"
    assert_includes slugs, "checkout"

    # Verify mobile metadata
    assert data["meta"].present?
    assert_equal 3, data["meta"]["poll_interval_seconds"]
    assert_equal true, data["meta"]["mobile_client_support"]
    assert_equal "/api/v1/telemetry/signals", data["meta"]["telemetry_endpoint"]

    # Verify arrays
    assert data.key?("status_updates")
    assert data.key?("active_incidents")
    assert data.key?("recent_incidents")
  end

  test "GET /api/v1/status_updates returns recent updates array" do
    get "/api/v1/status_updates"

    assert_response :success
    data = JSON.parse(response.body)

    assert data.key?("total_count")
    assert data.key?("updates")
  end
end
