# frozen_string_literal: true

require "test_helper"

class GitProviderTest < ActiveSupport::TestCase
  setup do
    AiSre::GitProvider.reset!
  end

  teardown do
    AiSre::GitProvider.reset!
  end

  def with_mock_http(response_or_proc)
    original_new = Net::HTTP.method(:new)
    Net::HTTP.define_singleton_method(:new) do |*args|
      mock = Object.new
      mock.define_singleton_method(:use_ssl=) { |_| }
      mock.define_singleton_method(:read_timeout=) { |_| }
      mock.define_singleton_method(:open_timeout=) { |_| }
      mock.define_singleton_method(:request) do |req|
        if response_or_proc.respond_to?(:call)
          response_or_proc.call(req)
        else
          response_or_proc
        end
      end
      mock
    end
    yield
  ensure
    Net::HTTP.define_singleton_method(:new, original_new)
  end

  test "GitProvider.current returns LocalGitProvider when GITHUB_TOKEN is not set" do
    provider = AiSre::GitProvider.current
    assert_kind_of AiSre::LocalGitProvider, provider
  end

  test "GitProvider.with_provider allows overriding the current provider" do
    mock_provider = Object.new
    AiSre::GitProvider.with_provider(mock_provider) do
      assert_equal mock_provider, AiSre::GitProvider.current
    end
    assert_kind_of AiSre::LocalGitProvider, AiSre::GitProvider.current
  end

  # LocalGitProvider tests
  test "LocalGitProvider get_file, create_branch, commit_patch, create_pull_request, merge_pull_request flow" do
    provider = AiSre::LocalGitProvider.new
    provider.set_virtual_file("src/services/cart.service.ts", "export class CartService {}")

    # 1. get_file
    file = provider.get_file("src/services/cart.service.ts")
    assert_equal "export class CartService {}", file[:content]
    assert_not_nil file[:sha]

    # 2. create_branch
    branch = provider.create_branch("fix/test-branch")
    assert_equal "refs/heads/fix/test-branch", branch[:ref]
    assert_equal "fix/test-branch", branch[:branch_name]
    assert_not_nil branch[:sha]

    # 3. commit_patch
    commit = provider.commit_patch(
      branch: "fix/test-branch",
      path: "src/services/cart.service.ts",
      content: "export class CartService { /* patched */ }",
      message: "fix: apply coupon fix"
    )
    assert_equal "src/services/cart.service.ts", commit[:path]
    assert_equal "fix/test-branch", commit[:branch]
    assert_not_nil commit[:commit_sha]

    # File on new branch has updated content
    updated = provider.get_file("src/services/cart.service.ts", ref: "fix/test-branch")
    assert_includes updated[:content], "/* patched */"

    # 4. create_pull_request
    pr = provider.create_pull_request(
      title: "fix: coupon calculation",
      body: "Resolves NaN issue",
      head_branch: "fix/test-branch",
      base_branch: "main"
    )
    assert_kind_of Integer, pr[:pr_number]
    assert_includes pr[:pr_url], "/pull/#{pr[:pr_number]}"
    assert_includes pr[:branch_url], "fix/test-branch"
    assert_equal "fix: coupon calculation", pr[:title]

    # 5. merge_pull_request
    merge = provider.merge_pull_request(pr_number: pr[:pr_number])
    assert merge[:merged]
    assert_not_nil merge[:merge_commit_sha]
    assert_includes merge[:message], "merged into main"

    # Verify main branch now has merged changes
    main_file = provider.get_file("src/services/cart.service.ts", ref: "main")
    assert_includes main_file[:content], "/* patched */"
  end

  test "LocalGitProvider raises ResourceNotFoundError for missing files without fallback" do
    provider = AiSre::LocalGitProvider.new
    assert_raises(AiSre::GitProvider::ResourceNotFoundError) do
      provider.get_file("non_existent_file_xyz_123.rb")
    end
  end

  # GithubApiClient tests with mocked Net::HTTP
  test "GithubApiClient get_file decodes base64 content" do
    client = AiSre::GithubApiClient.new(token: "ghp_fake_token", repo: "test-owner/test-repo")

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    payload = {
      "name" => "cart.service.ts",
      "path" => "src/services/cart.service.ts",
      "sha" => "3d9a1f2b",
      "encoding" => "base64",
      "content" => Base64.encode64("export class CartService {}")
    }
    mock_response.define_singleton_method(:body) { payload.to_json }

    with_mock_http(mock_response) do
      result = client.get_file("src/services/cart.service.ts")
      assert_equal "export class CartService {}", result[:content]
      assert_equal "3d9a1f2b", result[:sha]
    end
  end

  test "GithubApiClient create_branch fetches base ref and posts new ref" do
    client = AiSre::GithubApiClient.new(token: "ghp_fake_token", repo: "test-owner/test-repo")

    base_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    base_response.define_singleton_method(:body) { { "object" => { "sha" => "base_commit_sha" } }.to_json }

    create_response = Net::HTTPSuccess.new("1.1", "201", "Created")
    create_response.define_singleton_method(:body) do
      { "ref" => "refs/heads/appsolve/fix-branch", "object" => { "sha" => "base_commit_sha" } }.to_json
    end

    call_count = 0
    handler = proc do |_req|
      call_count += 1
      call_count == 1 ? base_response : create_response
    end

    with_mock_http(handler) do
      res = client.create_branch("appsolve/fix-branch")
      assert_equal "appsolve/fix-branch", res[:branch_name]
      assert_equal "base_commit_sha", res[:sha]
    end

    assert_equal 2, call_count
  end

  test "GithubApiClient create_pull_request posts payload and returns PR metadata" do
    client = AiSre::GithubApiClient.new(token: "ghp_fake_token", repo: "test-owner/test-repo")

    mock_response = Net::HTTPSuccess.new("1.1", "201", "Created")
    pr_data = {
      "number" => 42,
      "html_url" => "https://github.com/test-owner/test-repo/pull/42",
      "title" => "fix: coupon bug",
      "body" => "Fixes bug"
    }
    mock_response.define_singleton_method(:body) { pr_data.to_json }

    with_mock_http(mock_response) do
      res = client.create_pull_request(
        title: "fix: coupon bug",
        body: "Fixes bug",
        head_branch: "appsolve/fix-branch",
        base_branch: "main"
      )

      assert_equal 42, res[:pr_number]
      assert_equal "https://github.com/test-owner/test-repo/pull/42", res[:pr_url]
      assert_equal "appsolve/fix-branch", res[:branch_name]
    end
  end

  test "GithubApiClient merge_pull_request puts merge request and returns commit SHA" do
    client = AiSre::GithubApiClient.new(token: "ghp_fake_token", repo: "test-owner/test-repo")

    mock_response = Net::HTTPSuccess.new("1.1", "200", "OK")
    merge_data = {
      "sha" => "merged_commit_sha_123",
      "merged" => true,
      "message" => "Pull Request successfully merged"
    }
    mock_response.define_singleton_method(:body) { merge_data.to_json }

    with_mock_http(mock_response) do
      res = client.merge_pull_request(pr_number: 42)
      assert res[:merged]
      assert_equal "merged_commit_sha_123", res[:merge_commit_sha]
    end
  end

  test "GithubApiClient raises AuthenticationError on 401" do
    client = AiSre::GithubApiClient.new(token: "bad_token", repo: "test-owner/test-repo")

    mock_response = Net::HTTPUnauthorized.new("1.1", "401", "Unauthorized")
    mock_response.define_singleton_method(:body) { { "message" => "Bad credentials" }.to_json }

    with_mock_http(mock_response) do
      assert_raises(AiSre::GitProvider::AuthenticationError) do
        client.get_file("some_file.rb")
      end
    end
  end
end
