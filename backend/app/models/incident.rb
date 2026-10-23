class Incident < ApplicationRecord
  SEVERITIES = %w[SEV-1 SEV-2 SEV-3].freeze
  STATUSES = %w[investigating identified monitoring resolved].freeze
  AUTONOMY_MODES = %w[pending_triage full_autonomy approval_required manual_command_only].freeze
  ESCALATIONS = %w[none on_call_engineer on_call_and_team_lead].freeze

  belongs_to :service
  has_many :incident_events, dependent: :destroy
  has_many :war_room_messages, dependent: :destroy
  has_one :post_mortem, dependent: :destroy
  has_many :status_updates, dependent: :destroy

  validates :title, presence: true
  validates :status, inclusion: { in: STATUSES }
  validates :severity, inclusion: { in: SEVERITIES }, allow_nil: true
  validates :autonomy_mode, inclusion: { in: AUTONOMY_MODES }
  validates :escalation_target, inclusion: { in: ESCALATIONS }

  before_validation :generate_incident_code, on: :create

  scope :active, -> { where.not(status: "resolved").order(created_at: :desc) }
  scope :resolved, -> { where(status: "resolved").order(resolved_at: :desc) }

  def can_execute_autonomously?
    autonomy_mode == "full_autonomy" && severity == "SEV-3"
  end

  def requires_human_approval?
    autonomy_mode == "approval_required"
  end

  def locked_to_manual_commands?
    autonomy_mode == "manual_command_only"
  end

  private

  def generate_incident_code
    return if incident_code.present?

    last_id = Incident.maximum(:id) || 100
    self.incident_code = "#INC-#{last_id + 1}"
  end
end
