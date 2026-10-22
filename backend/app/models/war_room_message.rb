class WarRoomMessage < ApplicationRecord
  belongs_to :incident

  validates :sender_type, presence: true
  validates :sender_name, presence: true
  validates :content, presence: true

  default_scope { order(created_at: :asc) }
end
