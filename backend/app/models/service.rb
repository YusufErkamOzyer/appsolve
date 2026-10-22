class Service < ApplicationRecord
  STATUSES = %w[operational degraded outage].freeze

  has_many :incidents, dependent: :destroy
  has_many :status_updates, dependent: :nullify

  validates :name, presence: true
  validates :name_en, presence: true
  validates :slug, presence: true, uniqueness: true
  validates :status, inclusion: { in: STATUSES }

  def self.system_health_status
    current_statuses = pluck(:status)
    if current_statuses.include?("outage")
      "major_outage"
    elsif current_statuses.include?("degraded")
      "partial_outage"
    else
      "all_operational"
    end
  end

  def active_incident
    incidents.where.not(status: "resolved").order(created_at: :desc).first
  end
end
