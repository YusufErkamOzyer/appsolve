# frozen_string_literal: true

require "digest"

module AiSre
  module GitProvider
    class GitError < StandardError; end
    class AuthenticationError < GitError; end
    class ResourceNotFoundError < GitError; end
    class ApiError < GitError; end

    class << self
      attr_accessor :provider_override

      def current
        return provider_override if provider_override.present?

        if ENV["GITHUB_TOKEN"].present? && ENV["QUICKCART_REPO"].present? && ENV["USE_MOCK_GIT"] != "true"
          @github_client ||= AiSre::GithubApiClient.new(
            token: ENV["GITHUB_TOKEN"],
            repo: ENV["QUICKCART_REPO"],
            api_url: ENV.fetch("GITHUB_API_URL", "https://api.github.com")
          )
        else
          @local_provider ||= AiSre::LocalGitProvider.new(
            repo_path: ENV.fetch("QUICKCART_LOCAL_REPO_PATH", Rails.root.join("..", "quickcart", "backend").to_s)
          )
        end
      end

      def with_provider(provider)
        old_provider = provider_override
        self.provider_override = provider
        yield
      ensure
        self.provider_override = old_provider
      end

      def reset!
        @github_client = nil
        @local_provider = nil
        self.provider_override = nil
      end
    end

    class Base
      # @param path [String] e.g. "src/services/cart.service.ts"
      # @param ref [String] branch name or commit SHA
      # @return [Hash] { content: String, sha: String }
      def get_file(path, ref: "main")
        raise NotImplementedError, "#{self.class}#get_file must be implemented"
      end

      # @param branch_name [String] e.g. "appsolve/fix-coupon-bug"
      # @param base_ref [String] e.g. "main"
      # @return [Hash] { ref: String, sha: String, branch_name: String }
      def create_branch(branch_name, base_ref: "main")
        raise NotImplementedError, "#{self.class}#create_branch must be implemented"
      end

      # @param branch [String]
      # @param path [String]
      # @param content [String]
      # @param message [String]
      # @param parent_sha [String, nil]
      # @return [Hash] { commit_sha: String, path: String, branch: String }
      def commit_patch(branch:, path:, content:, message:, parent_sha: nil)
        raise NotImplementedError, "#{self.class}#commit_patch must be implemented"
      end
      alias_method :commit_file_change, :commit_patch

      # @param title [String]
      # @param body [String]
      # @param head_branch [String]
      # @param base_branch [String]
      # @return [Hash] { pr_number: Integer, pr_url: String, branch_name: String, branch_url: String, diff_url: String, title: String, body: String }
      def create_pull_request(title:, body:, head_branch:, base_branch: "main")
        raise NotImplementedError, "#{self.class}#create_pull_request must be implemented"
      end

      # @param pr_number [Integer]
      # @param commit_title [String, nil]
      # @param merge_method [String]
      # @return [Hash] { merged: Boolean, message: String, merge_commit_sha: String }
      def merge_pull_request(pr_number:, commit_title: nil, merge_method: "squash")
        raise NotImplementedError, "#{self.class}#merge_pull_request must be implemented"
      end
    end
  end
end
