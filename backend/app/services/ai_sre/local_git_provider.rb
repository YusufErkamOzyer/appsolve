# frozen_string_literal: true

require "digest"
require "fileutils"

module AiSre
  class LocalGitProvider < GitProvider::Base
    attr_reader :repo_path, :branches, :branch_files, :pull_requests, :pr_counter

    def initialize(repo_path: nil)
      @repo_path = repo_path || Rails.root.join("..", "quickcart", "backend").to_s
      @branches = {
        "main" => {
          sha: Digest::SHA1.hexdigest("initial_main_commit")[0..11],
          created_at: Time.current
        }
      }
      @branch_files = Hash.new { |hash, key| hash[key] = {} }
      @pull_requests = {}
      @pr_counter = 100
    end

    def set_virtual_file(path, content, ref: "main")
      clean_ref = ref.to_s.sub(%r{^refs/heads/}, "")
      clean_path = path.to_s.sub(%r{^/+}, "")
      sha = Digest::SHA1.hexdigest(content)[0..11]
      @branch_files[clean_ref][clean_path] = {
        content: content,
        sha: sha,
        message: "set_virtual_file"
      }
      sha
    end

    def get_file(path, ref: "main")
      clean_path = path.to_s.sub(%r{^/+}, "")
      clean_ref = ref.to_s.sub(%r{^refs/heads/}, "")

      # 1. Check in-memory branch commits
      if @branch_files[clean_ref]&.key?(clean_path)
        item = @branch_files[clean_ref][clean_path]
        return {
          content: item[:content],
          sha: item[:sha]
        }.with_indifferent_access
      end

      # 2. Check base branch ("main") if ref is not main
      if clean_ref != "main" && @branch_files["main"]&.key?(clean_path)
        item = @branch_files["main"][clean_path]
        return {
          content: item[:content],
          sha: item[:sha]
        }.with_indifferent_access
      end

      # 3. Check filesystem if repo_path exists
      file_on_disk = find_file_on_disk(clean_path)
      if file_on_disk && File.exist?(file_on_disk)
        content = File.read(file_on_disk)
        sha = Digest::SHA1.hexdigest(content)[0..11]
        return {
          content: content,
          sha: sha
        }.with_indifferent_access
      end

      # 4. Built-in fallback template for known files in testing/simulation
      fallback_content = default_fallback_content_for(clean_path)
      if fallback_content
        sha = Digest::SHA1.hexdigest(fallback_content)[0..11]
        return {
          content: fallback_content,
          sha: sha
        }.with_indifferent_access
      end

      raise GitProvider::ResourceNotFoundError, "File not found: '#{clean_path}' (ref: #{clean_ref})"
    end

    def create_branch(branch_name, base_ref: "main")
      clean_branch = branch_name.to_s.sub(%r{^refs/heads/}, "")
      clean_base = base_ref.to_s.sub(%r{^refs/heads/}, "")

      base_sha = @branches[clean_base]&.dig(:sha) || Digest::SHA1.hexdigest(clean_base)[0..11]
      branch_sha = Digest::SHA1.hexdigest("branch_#{clean_branch}_from_#{base_sha}")[0..11]

      @branches[clean_branch] = {
        sha: branch_sha,
        base_ref: clean_base,
        created_at: Time.current
      }

      # Inherit files from base branch if any were committed
      if @branch_files[clean_base].present?
        @branch_files[clean_base].each do |p, data|
          @branch_files[clean_branch][p] ||= data.dup
        end
      end

      {
        ref: "refs/heads/#{clean_branch}",
        sha: branch_sha,
        branch_name: clean_branch
      }.with_indifferent_access
    end

    def commit_patch(branch:, path:, content:, message:, parent_sha: nil)
      clean_branch = branch.to_s.sub(%r{^refs/heads/}, "")
      clean_path = path.to_s.sub(%r{^/+}, "")

      # Ensure branch exists
      create_branch(clean_branch) unless @branches.key?(clean_branch)

      commit_sha = Digest::SHA1.hexdigest("#{clean_branch}:#{clean_path}:#{content}:#{Time.current.to_f}")[0..11]

      @branch_files[clean_branch][clean_path] = {
        content: content,
        sha: commit_sha,
        message: message,
        committed_at: Time.current
      }

      @branches[clean_branch][:sha] = commit_sha

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

      @pr_counter += 1
      pr_number = @pr_counter

      repo_slug = ENV.fetch("QUICKCART_REPO", "appsolve-sre/quickcart")
      pr_url = "https://github.com/#{repo_slug}/pull/#{pr_number}"
      branch_url = "https://github.com/#{repo_slug}/tree/#{clean_head}"

      @pull_requests[pr_number] = {
        pr_number: pr_number,
        title: title,
        body: body,
        head_branch: clean_head,
        base_branch: clean_base,
        state: "open",
        pr_url: pr_url,
        branch_url: branch_url,
        created_at: Time.current
      }

      {
        pr_number: pr_number,
        pr_url: pr_url,
        branch_name: clean_head,
        branch_url: branch_url,
        diff_url: "#{pr_url}.diff",
        title: title,
        body: body
      }.with_indifferent_access
    end

    def merge_pull_request(pr_number:, commit_title: nil, merge_method: "squash")
      num = pr_number.to_i
      pr = @pull_requests[num]

      unless pr
        repo_slug = ENV.fetch("QUICKCART_REPO", "appsolve-sre/quickcart")
        clean_head = "appsolve/fix-pr-#{num}"
        pr = {
          pr_number: num,
          title: commit_title || "Remediation fix [PR ##{num}]",
          body: "Auto-generated PR for remediation",
          head_branch: clean_head,
          base_branch: "main",
          state: "open",
          pr_url: "https://github.com/#{repo_slug}/pull/#{num}",
          branch_url: "https://github.com/#{repo_slug}/tree/#{clean_head}",
          created_at: Time.current
        }
        @pull_requests[num] = pr
      end

      if pr[:state] == "merged"
        return {
          merged: true,
          message: "Pull Request ##{num} already merged into #{pr[:base_branch]}",
          merge_commit_sha: pr[:merge_commit_sha] || Digest::SHA1.hexdigest("merge_pr_#{num}")[0..11]
        }.with_indifferent_access
      end

      merge_sha = Digest::SHA1.hexdigest("merge_pr_#{num}_#{Time.current.to_f}")[0..11]
      pr[:state] = "merged"
      pr[:merge_commit_sha] = merge_sha
      pr[:merged_at] = Time.current

      # Copy changes from head branch into base branch ("main")
      head_branch = pr[:head_branch]
      base_branch = pr[:base_branch]

      if @branch_files[head_branch].present?
        @branch_files[head_branch].each do |p, data|
          @branch_files[base_branch][p] = data.dup
        end
      end

      {
        merged: true,
        message: "Pull Request ##{num} successfully merged into #{base_branch}",
        merge_commit_sha: merge_sha
      }.with_indifferent_access
    end

    private

    def find_file_on_disk(clean_path)
      candidates = [
        File.expand_path(clean_path, @repo_path),
        File.expand_path(File.join("src", clean_path.sub(%r{^src/}, "")), @repo_path),
        Rails.root.join("..", "quickcart", "backend", clean_path).to_s,
        Rails.root.join("..", "quickcart", "backend", "src", clean_path.sub(%r{^src/}, "")).to_s,
        Rails.root.join("..", clean_path).to_s
      ]

      candidates.find { |candidate| File.exist?(candidate) && !File.directory?(candidate) }
    end

    def default_fallback_content_for(path)
      if path.include?("cart.service") || path.include?("cart")
        <<~TYPESCRIPT
          // Default QuickCart CartService fallback template
          export class CartService {
            public static applyCoupon(cartId: string, couponCode: string) {
              const promoConfig: any = { tieredRates: {} };
              const rateConfig = promoConfig.tieredRates[coupon.tier];
              const buggyDiscount = (100 * rateConfig.multiplier) / 100;
              return buggyDiscount;
            }
          }
        TYPESCRIPT
      elsif path.include?("calculator.py")
        <<~PYTHON
          # Default QuickCart calculator.py fallback template
          def calculate_discount(subtotal, coupon_code):
              factor = 0
              return (subtotal / factor) * 0.2
        PYTHON
      end
    end
  end
end
