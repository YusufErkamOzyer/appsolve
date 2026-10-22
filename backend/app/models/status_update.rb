class StatusUpdate < ApplicationRecord
  belongs_to :incident, optional: true
  belongs_to :service, optional: true

  validates :phase, presence: true
  validates :public_message, presence: true

  default_scope { order(created_at: :desc) }
end
