class WarRoomMessage < ApplicationRecord
  MESSAGE_TYPES = %w[text action_card system_diagnostic].freeze
  ACTION_STATUSES = %w[pending autonomous_executed executed rejected locked].freeze

  belongs_to :incident

  validates :sender_type, presence: true
  validates :sender_name, presence: true
  validates :content, presence: true
  validates :message_type, inclusion: { in: MESSAGE_TYPES }, allow_nil: true
  validates :action_status, inclusion: { in: ACTION_STATUSES }, allow_nil: true

  default_scope { order(created_at: :asc) }
end
