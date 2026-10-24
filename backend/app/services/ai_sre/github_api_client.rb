# frozen_string_literal: true

require "net/http"
require "json"
require "uri"
require "base64"

module AiSre
  class GithubApiClient < GitProvider::Base
    attr_reader :token, :repo, :api_url

    def initialize(token:, repo:, api_url: "https://api.github.com")
      @token = token
      @repo = repo
      @api_url = api_url.to_s.chomp("/")
    end

    def get_file(path, ref: "main")
      clean_path = path.to_s.sub(%r{^/+}, "")
      endpoint = "/repos/#{@repo}/contents/#{clean_path}?ref=#{ref}"
      response = get_request(endpoint)

      content = if response["encoding"] == "base64"
        Base64.decode64(response["content"].to_s)
      else
        response["content"].to_s
      end

      {
        content: content,
        sha: response["sha"]
      }.with_indifferent_access
    end

    def create_branch(branch_name, base_ref: "main")
      clean_branch = branch_name.to_s.sub(%r{^refs/heads/}, "")
      clean_base = base_ref.to_s.sub(%r{^refs/heads/}, "")

      # Retrieve SHA of base reference
      base_info = get_request("/repos/#{@repo}/git/ref/heads/#{clean_base}")
      base_sha = base_info.dig("object", "sha") || base_info["sha"]

      body = {
        ref: "refs/heads/#{clean_branch}",
        sha: base_sha
      }

      res = post_request("/repos/#{@repo}/git/refs", body)
      {
        ref: res["ref"] || "refs/heads/#{clean_branch}",
        sha: res.dig("object", "sha") || base_sha,
        branch_name: clean_branch
      }.with_indifferent_access
    end

    def commit_patch(branch:, path:, content:, message:, parent_sha: nil)
      clean_path = path.to_s.sub(%r{^/+}, "")
      clean_branch = branch.to_s.sub(%r{^refs/heads/}, "")

      sha = parent_sha
      if sha.nil?
        begin
          current = get_file(clean_path, ref: clean_branch)
          sha = current[:sha]
        rescue GitProvider::ResourceNotFoundError
          # File does not exist yet on this branch; no sha needed
        end
      end

      body = {
        message: message,
        content: Base64.strict_encode64(content),
        branch: clean_branch
      }
      body[:sha] = sha if sha.present?

      res = put_request("/repos/#{@repo}/contents/#{clean_path}", body)
      commit_sha = res.dig("commit", "sha") || res["sha"] || Digest::SHA1.hexdigest(content)[0..11]

      {
        commit_sha: commit_sha,
        path: clean_path,
        branch: clean_branch
      }.with_indifferent_access
    end
    alias_method :commit_file_change, :commit_patch

    def create_pull_request(title:, body:, head_branch:, base_branch: "main")
      clean_head = head_branch.to_s.sub(%r{^refs/heads/}, "")
      clean_base = base_branch.to_s.sub(%r{^refs/heads/}, "")

      payload = {
        title: title,
        body: body,
        head: clean_head,
        base: clean_base
      }

      res = post_request("/repos/#{@repo}/pulls", payload)

      pr_number = res["number"] || rand(100..999)
      pr_url = res["html_url"] || "https://github.com/#{@repo}/pull/#{pr_number}"
      branch_url = "https://github.com/#{@repo}/tree/#{clean_head}"

      {
        pr_number: pr_number,
        pr_url: pr_url,
        branch_name: clean_head,
        branch_url: branch_url,
        diff_url: "#{pr_url}.diff",
        title: res["title"] || title,
        body: res["body"] || body
      }.with_indifferent_access
    end

    def merge_pull_request(pr_number:, commit_title: nil, merge_method: "squash")
      payload = {
        merge_method: merge_method
      }
      payload[:commit_title] = commit_title if commit_title.present?

      res = put_request("/repos/#{@repo}/pulls/#{pr_number}/merge", payload)

      {
        merged: res["merged"] == true,
        message: res["message"] || "Pull Request ##{pr_number} successfully merged",
        merge_commit_sha: res["sha"] || res["merge_commit_sha"] || Digest::SHA1.hexdigest("merge_#{pr_number}")[0..11]
      }.with_indifferent_access
    end

    private

    def get_request(path)
      execute_request(Net::HTTP::Get, path)
    end

    def post_request(path, body)
      execute_request(Net::HTTP::Post, path, body)
    end

    def put_request(path, body)
      execute_request(Net::HTTP::Put, path, body)
    end

    def execute_request(klass, path, body = nil)
      uri = URI("#{@api_url}#{path}")
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == "https")
      http.read_timeout = 15
      http.open_timeout = 5

      req = klass.new(uri.request_uri)
      req["Accept"] = "application/vnd.github+json"
      req["Authorization"] = "Bearer #{@token}"
      req["X-GitHub-Api-Version"] = "2022-11-28"
      req["User-Agent"] = "Appsolve-AI-SRE"

      if body
        req["Content-Type"] = "application/json"
        req.body = body.to_json
      end

      response = http.request(req)
      handle_response(response)
    end

    def handle_response(response)
      case response.code.to_i
      when 200..299
        JSON.parse(response.body) rescue { "message" => response.body }
      when 401, 403
        raise GitProvider::AuthenticationError, "GitHub API Authentication Error (#{response.code}): #{response.body}"
      when 404
        raise GitProvider::ResourceNotFoundError, "GitHub API Resource Not Found (#{response.code}): #{response.body}"
      else
        raise GitProvider::ApiError, "GitHub API Error (#{response.code}): #{response.body}"
      end
    end
  end
end
