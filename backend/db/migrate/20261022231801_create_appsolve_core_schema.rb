class CreateAppsolveCoreSchema < ActiveRecord::Migration[8.1]
  def change
    create_table :services do |t|
      t.string :name, null: false
      t.string :name_en, null: false
      t.string :slug, null: false
      t.string :status, null: false, default: "operational"
      t.text :description
      t.float :uptime_percentage, default: 99.98
      t.datetime :last_incident_at
      t.json :metadata, default: {}

      t.timestamps
    end
    add_index :services, :slug, unique: true

    create_table :incidents do |t|
      t.references :service, null: false, foreign_key: true
      t.string :incident_code, null: false
      t.string :title, null: false
      t.string :severity # "SEV-1", "SEV-2", "SEV-3" or nil (pending triage)
      t.string :status, null: false, default: "investigating" # investigating, identified, monitoring, resolved
      t.string :autonomy_mode, default: "pending_triage" # pending_triage, full_autonomy, approval_required, manual_command_only
      t.string :escalation_target, default: "none" # none, on_call_engineer, on_call_and_team_lead
      t.text :hypothesis
      t.text :reasoning
      t.json :recommended_action_plan, default: {}
      t.json :raw_payload, default: {}
      t.datetime :sla_deadline
      t.datetime :resolved_at

      t.timestamps
    end
    add_index :incidents, :incident_code, unique: true
    add_index :incidents, :status
    add_index :incidents, :severity

    create_table :incident_events do |t|
      t.references :incident, null: false, foreign_key: true
      t.string :event_type, null: false # signal_received, triage_completed, escalation_triggered, action_proposed, action_executed, sev_downgraded, resolved
      t.string :actor, null: false, default: "system" # system, ai_sre_agent, engineer
      t.string :title, null: false
      t.text :details
      t.datetime :occurred_at, null: false

      t.timestamps
    end
    add_index :incident_events, :event_type

    create_table :war_room_messages do |t|
      t.references :incident, null: false, foreign_key: true
      t.string :sender_type, null: false # ai_agent, engineer, system
      t.string :sender_name, null: false
      t.text :content, null: false
      t.string :message_type, default: "text" # text, hypothesis, action_card, command_output, system_alert
      t.json :action_card_payload, default: {}
      t.string :action_status # pending, approved, rejected, executed

      t.timestamps
    end

    create_table :post_mortems do |t|
      t.references :incident, null: false, foreign_key: true
      t.text :summary, null: false
      t.text :root_cause, null: false
      t.integer :duration_seconds, default: 0
      t.string :mttr_formatted
      t.json :affected_services, default: []
      t.json :action_items, default: []
      t.string :generated_by, default: "AI SRE Agent"

      t.timestamps
    end

    create_table :status_updates do |t|
      t.references :incident, foreign_key: true
      t.references :service, foreign_key: true
      t.string :phase, null: false, default: "investigating" # investigating, identified, monitoring, resolved
      t.text :public_message, null: false
      t.boolean :visible_on_status_page, null: false, default: true

      t.timestamps
    end
  end
end
