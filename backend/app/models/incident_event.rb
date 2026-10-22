class IncidentEvent < ApplicationRecord
  belongs_to :incident

  validates :event_type, presence: true
  validates :title, presence: true
  validates :occurred_at, presence: true

  default_scope { order(occurred_at: :asc) }
end
