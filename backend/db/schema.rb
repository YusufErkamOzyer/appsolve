# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_10_22_231801) do
  create_table "incident_events", force: :cascade do |t|
    t.integer "incident_id", null: false
    t.string "event_type", null: false
    t.string "actor", default: "system", null: false
    t.string "title", null: false
    t.text "details"
    t.datetime "occurred_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["event_type"], name: "index_incident_events_on_event_type"
    t.index ["incident_id"], name: "index_incident_events_on_incident_id"
  end

  create_table "incidents", force: :cascade do |t|
    t.integer "service_id", null: false
    t.string "incident_code", null: false
    t.string "title", null: false
    t.string "severity"
    t.string "status", default: "investigating", null: false
    t.string "autonomy_mode", default: "pending_triage"
    t.string "escalation_target", default: "none"
    t.text "hypothesis"
    t.text "reasoning"
    t.json "recommended_action_plan", default: {}
    t.json "raw_payload", default: {}
    t.datetime "sla_deadline"
    t.datetime "resolved_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["incident_code"], name: "index_incidents_on_incident_code", unique: true
    t.index ["service_id"], name: "index_incidents_on_service_id"
    t.index ["severity"], name: "index_incidents_on_severity"
    t.index ["status"], name: "index_incidents_on_status"
  end

  create_table "post_mortems", force: :cascade do |t|
    t.integer "incident_id", null: false
    t.text "summary", null: false
    t.text "root_cause", null: false
    t.integer "duration_seconds", default: 0
    t.string "mttr_formatted"
    t.json "affected_services", default: []
    t.json "action_items", default: []
    t.string "generated_by", default: "AI SRE Agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["incident_id"], name: "index_post_mortems_on_incident_id"
  end

  create_table "services", force: :cascade do |t|
    t.string "name", null: false
    t.string "name_en", null: false
    t.string "slug", null: false
    t.string "status", default: "operational", null: false
    t.text "description"
    t.float "uptime_percentage", default: 99.98
    t.datetime "last_incident_at"
    t.json "metadata", default: {}
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_services_on_slug", unique: true
  end

  create_table "status_updates", force: :cascade do |t|
    t.integer "incident_id"
    t.integer "service_id"
    t.string "phase", default: "investigating", null: false
    t.text "public_message", null: false
    t.boolean "visible_on_status_page", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["incident_id"], name: "index_status_updates_on_incident_id"
    t.index ["service_id"], name: "index_status_updates_on_service_id"
  end

  create_table "war_room_messages", force: :cascade do |t|
    t.integer "incident_id", null: false
    t.string "sender_type", null: false
    t.string "sender_name", null: false
    t.text "content", null: false
    t.string "message_type", default: "text"
    t.json "action_card_payload", default: {}
    t.string "action_status"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["incident_id"], name: "index_war_room_messages_on_incident_id"
  end

  add_foreign_key "incident_events", "incidents"
  add_foreign_key "incidents", "services"
  add_foreign_key "post_mortems", "incidents"
  add_foreign_key "status_updates", "incidents"
  add_foreign_key "status_updates", "services"
  add_foreign_key "war_room_messages", "incidents"
end
