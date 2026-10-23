module Api
  module V1
    class StatusUpdatesController < ApplicationController
      def index
        limit = [params[:limit].to_i, 50].max
        limit = 20 if limit.zero?

        updates = StatusUpdate.visible_to_public.limit(limit)

        render json: {
          total_count: updates.size,
          last_synced_at: Time.current.iso8601,
          updates: updates.map(&:as_public_json)
        }
      end
    end
  end
end
