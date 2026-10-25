require "test_helper"

class PublicStatusPageFlowTest < ActionDispatch::IntegrationTest
  setup do
    post "/api/v1/system/reset"
  end

  test "complete end-to-end status page lifecycle with mobile client signals" do
    # 1. Baseline: All systems operational
    get "/api/v1/status_page"
    assert_response :success
    base_data = JSON.parse(response.body)
    assert_equal "all_operational", base_data["system_status"]
    assert_equal "Tüm Sistemler Normal Çalışıyor", base_data["system_status_label"]
    assert_equal 4, base_data["services"].size
    assert(base_data["services"].all? { |s| s["status"] == "operational" })

    # 2. Mobile client sends SEV-3 signal
    post "/api/v1/telemetry/signals", params: {
      service_slug: "catalog",
      error_code: "IMAGE_CDN_CACHE_BLOAT",
      message: "CDN Edge Cache doluluğu %90 eşiğini aştı",
      severity: "SEV-3",
      metadata: { client: "mobile_app_ios" }
    }
    assert_response :success

    get "/api/v1/status_page"
    assert_response :success
    sev3_data = JSON.parse(response.body)
    # Since it's autonomous, incident is resolved and services remain operational
    assert_equal "all_operational", sev3_data["system_status"]
    # Per user directive, SEV-3 update IS listed in the corporate status updates feed
    assert sev3_data["status_updates"].any? { |u| u["service_slug"] == "catalog" }

    # 3. Mobile client sends SEV-2 signal
    post "/api/v1/telemetry/signals", params: {
      service_slug: "cart",
      error_code: "CART_COUPON_NAN_ERROR",
      message: "Kupon hesaplamada promo_v2 hatası",
      severity: "SEV-2",
      metadata: { client: "mobile_app_android" }
    }
    assert_response :success
    cart_incident_id = JSON.parse(response.body)["incident"]["id"]

    # Status page should reflect partial outage
    get "/api/v1/status_page"
    assert_response :success
    sev2_data = JSON.parse(response.body)
    assert_equal "partial_outage", sev2_data["system_status"]
    cart_svc = sev2_data["services"].find { |s| s["slug"] == "cart" }
    assert_equal "degraded", cart_svc["status"]
    assert_equal "PERFORMANS KAYBI", cart_svc["status_label"]

    # Verify corporate status updates for cart exist and are jargon-free
    cart_updates = sev2_data["status_updates"].select { |u| u["service_slug"] == "cart" }
    assert cart_updates.any?
    cart_updates.each do |up|
      refute_match(/nan error|promo_v2|redis promo cache/i, up["public_message"])
    end

    # Approve plan for SEV-2 (Stage 1: proposal -> PR; Stage 2: merge -> resolve)
    post "/api/v1/incidents/#{cart_incident_id}/approve_plan", params: {
      approved_by: "Nöbetçi Mühendis"
    }
    assert_response :success
    post "/api/v1/incidents/#{cart_incident_id}/approve_plan", params: {
      approved_by: "Nöbetçi Mühendis"
    }
    assert_response :success

    # Status page should immediately turn back to operational
    get "/api/v1/status_page"
    assert_response :success
    resolved_data = JSON.parse(response.body)
    assert_equal "all_operational", resolved_data["system_status"]
    assert_equal "operational", resolved_data["services"].find { |s| s["slug"] == "cart" }["status"]
    # Resolved status update exists
    assert resolved_data["status_updates"].any? { |u| u["service_slug"] == "cart" && u["phase"] == "resolved" }

    # 4. Mobile client sends SEV-1 signal
    post "/api/v1/telemetry/signals", params: {
      service_slug: "checkout",
      error_code: "PAYMENT_GATEWAY_DEADLOCK",
      message: "Ödeme ağ geçidi kilitlendi",
      severity: "SEV-1",
      metadata: { client: "mobile_app_ios" }
    }
    assert_response :success
    checkout_incident_id = JSON.parse(response.body)["incident"]["id"]

    get "/api/v1/status_page"
    assert_response :success
    sev1_data = JSON.parse(response.body)
    assert_equal "major_outage", sev1_data["system_status"]
    assert_equal "outage", sev1_data["services"].find { |s| s["slug"] == "checkout" }["status"]

    # Resolve via War Room
    post "/api/v1/incidents/#{checkout_incident_id}/messages", params: {
      content: "Doğrula ve olayı kapat",
      sender_name: "Lead SRE"
    }
    assert_response :success

    # Status page returns to all_operational immediately
    get "/api/v1/status_page"
    assert_response :success
    final_data = JSON.parse(response.body)
    assert_equal "all_operational", final_data["system_status"]
    assert_equal "operational", final_data["services"].find { |s| s["slug"] == "checkout" }["status"]
    assert final_data["status_updates"].any? { |u| u["service_slug"] == "checkout" && u["phase"] == "resolved" }
  end
end
