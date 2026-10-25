class StatusUpdate < ApplicationRecord
  PHASES = %w[investigating identified monitoring resolved autonomous_resolved].freeze

  belongs_to :incident, optional: true
  belongs_to :service, optional: true

  validates :phase, presence: true, inclusion: { in: PHASES }
  validates :public_message, presence: true

  scope :visible_to_public, -> { where(visible_on_status_page: true) }
  scope :recent_24h, -> { where("created_at >= ?", 24.hours.ago) }
  scope :chronological, -> { order(created_at: :asc) }

  default_scope { order(created_at: :desc) }

  def phase_label
    case phase
    when "investigating" then "İNCELENİYOR"
    when "identified" then "SORUN TESPİT EDİLDİ"
    when "monitoring" then "İZLENİYOR"
    when "resolved" then "ÇÖZÜLDÜ"
    when "autonomous_resolved" then "OTONOM ÇÖZÜLDÜ"
    else phase.to_s.upcase
    end
  end

  def formatted_time
    created_at.strftime("%H:%M:%S")
  end

  def as_public_json
    {
      id: id,
      incident_id: incident_id,
      incident_code: incident&.incident_code,
      severity: incident&.severity,
      service_id: service_id,
      service_name: service&.name,
      service_slug: service&.slug,
      phase: phase,
      phase_label: phase_label,
      public_message: public_message,
      visible_on_status_page: visible_on_status_page,
      occurred_at: created_at.iso8601,
      time_formatted: formatted_time
    }
  end
end
