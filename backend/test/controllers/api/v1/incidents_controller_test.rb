require "test_helper"

class Api::V1::IncidentsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @checkout = services(:checkout)
    @incident = Incident.create!(
      service: @checkout,
      title: "HTTP_504_DB_LOCK: Ödeme kilitlendi",
      severity: "SEV-1",
      status: "investigating",
      autonomy_mode: "manual_command_only",
      escalation_target: "on_call_and_team_lead",
      hypothesis: "Row lock deadlock on payment_records",
      reasoning: "Ödeme akışı tamamen kilitlendi, ciro kaybı yaşanıyor.",
      recommended_action_plan: {
        "plan_id" => "PLAN #01",
        "title" => "Kilitleri Temizle",
        "tool_name" => "kill_locks",
        "risk_level" => "high",
        "steps" => ["Bloke iş parçacıklarını sonlandır"]
      },
      raw_payload: {
        "error_code" => "HTTP_504_DB_LOCK",
        "metrics" => { "error_rate" => 0.94 }
      },
      sla_deadline: 15.minutes.from_now
    )

    @incident.incident_events.create!(
      event_type: "signal_received",
      actor: "system",
      title: "Sinyal yakalandı",
      details: "Ham telemetri alındı",
      occurred_at: 10.seconds.ago
    )
    @incident.incident_events.create!(
      event_type: "ai_triage_completed",
      actor: "gemini_ai_agent",
      title: "AI Triage tamamlandı",
      details: "SEV-1 kararı verildi",
      occurred_at: 8.seconds.ago
    )
  end

  test "GET /api/v1/incidents returns list with raw_payload and timeline events" do
    get api_v1_incidents_url, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal 1, json["total_count"]
    assert_equal 1, json["active_count"]
    assert_equal 1, json["incidents"].length

    inc = json["incidents"].first
    assert_equal @incident.id, inc["id"]
    assert_equal @incident.incident_code, inc["incident_code"]
    assert_equal "SEV-1", inc["severity"]
    assert_equal "manual_command_only", inc["autonomy_mode"]
    assert_equal "on_call_and_team_lead", inc["escalation_target"]
    assert_not_nil inc["raw_payload"]
    assert_equal "HTTP_504_DB_LOCK", inc["raw_payload"]["error_code"]
    assert_not_nil inc["sla_deadline"]

    events = inc["events"]
    assert_equal 2, events.length
    assert_equal "signal_received", events[0]["event_type"]
    assert_equal "ai_triage_completed", events[1]["event_type"]
  end

  test "GET /api/v1/incidents/:id returns full incident details" do
    get api_v1_incident_url(@incident), as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal @incident.id, json["id"]
    assert_equal "SEV-1", json["severity"]
    assert_equal "manual_command_only", json["autonomy_mode"]
    assert_equal "on_call_and_team_lead", json["escalation_target"]
    assert_equal "HTTP_504_DB_LOCK", json["raw_payload"]["error_code"]
    assert_kind_of Array, json["events"]
    assert_kind_of Array, json["messages"]
  end

  test "GET /api/v1/incidents/:id returns 404 for missing incident" do
    get api_v1_incident_url(id: 999999), as: :json
    assert_response :not_found
    json = JSON.parse(response.body)
    assert_equal "Incident not found", json["error"]
  end

  test "POST /api/v1/incidents/:id/approve_plan approves SEV-2 and returns 200 executed" do
    cart = services(:cart)
    cart.update!(status: "degraded")
    sev2_incident = Incident.create!(
      service: cart,
      title: "REDIS_COUPON_NAN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      hypothesis: "Corrupted promo_v2 key in Redis",
      recommended_action_plan: {
        "plan_id" => "PLAN #02",
        "title" => "Promo Bayrağını Geri Al",
        "tool_name" => "rollback_feature_flag",
        "risk_level" => "medium",
        "steps" => ["promo_v2 bayrağını kapat", "Redis kupon anahtarlarını temizle"]
      }
    )
    AiSre::RemediationService.route_after_triage!(sev2_incident)

    post approve_plan_api_v1_incident_url(sev2_incident), params: { approved_by: "Deniz (On-Call SRE)" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "executed", json["status"]
    assert_equal "resolved", json["incident"]["status"]
    assert_equal "operational", cart.reload.status
  end

  test "POST /api/v1/incidents/:id/approve_plan returns 403 Forbidden for SEV-1" do
    post approve_plan_api_v1_incident_url(@incident), params: { approved_by: "Deniz" }, as: :json
    assert_response :forbidden

    json = JSON.parse(response.body)
    assert_equal "GUARDRAIL_LOCKED", json["code"]
    assert_equal "investigating", @incident.reload.status
  end

  test "POST /api/v1/incidents/:id/reject_plan marks plan rejected and returns 200" do
    cart = services(:cart)
    sev2_incident = Incident.create!(
      service: cart,
      title: "REDIS_COUPON_NAN",
      severity: "SEV-2",
      status: "investigating",
      autonomy_mode: "approval_required",
      escalation_target: "on_call_engineer",
      recommended_action_plan: {
        "plan_id" => "PLAN #02",
        "title" => "Promo Bayrağını Geri Al",
        "tool_name" => "rollback_feature_flag",
        "steps" => ["Adım 1"]
      }
    )
    AiSre::RemediationService.route_after_triage!(sev2_incident)

    post reject_plan_api_v1_incident_url(sev2_incident), params: { rejected_by: "Deniz", reason: "Manuel komut girilecek" }, as: :json
    assert_response :success

    json = JSON.parse(response.body)
    assert_equal "rejected", json["status"]
    assert_equal "investigating", sev2_incident.reload.status
  end
end
