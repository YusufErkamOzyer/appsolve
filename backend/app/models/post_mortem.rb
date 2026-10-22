class PostMortem < ApplicationRecord
  belongs_to :incident

  validates :summary, presence: true
  validates :root_cause, presence: true
end
