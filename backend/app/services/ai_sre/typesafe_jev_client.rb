# frozen_string_literal: true

require "net/http"
require "json"
require "uri"

module AiSre
  # TypeSafe AI "System One" (Jev) Decision Engine Client
  # Built according to `.agents/skills/typesafe-ai/SKILL.md`:
  # - "Judgments from Jev, decisions in code"
  # - Bundles atomic questions (`score`, `choice`, `noul`) in a single parallel request
  # - Reads TYPESAFE_API_KEY strictly from ENV (never hardcoded)
  class TypesafeJevClient
    API_URL = "https://api.typesafe.ai/v1/systemone"
    DEFAULT_MODEL = "jev-latest"

    # Keep all question wording, options, criteria, and thresholds in one place (SKILL.md Workflow #2)
    QUESTIONS = {
      severity_score: {
        type: "score",
        instructions: "Rate the operational business impact of this incident on the e-commerce platform using `service_slug`, `error_message`, `stack_trace`, and `metrics`.",
        criteria: [
          "Minor performance or infrastructure issue: catalog or image cache bloat, high cache memory watermark, or non-critical latency while core browsing, cart, and checkout work normally.",
          "Major partial feature failure: a runtime code exception (such as TypeError, ReferenceError, NaN calculation, or coupon discount failure) breaks a specific feature like applying a coupon, while general browsing remains up.",
          "Critical total service outage: checkout or payment processing is completely blocked by a database lock timeout, deadlock, or >50% error rate, preventing customers from completing orders."
        ]
      },
      incident_category: {
        type: "choice",
        instructions: "Which technical failure category describes the root problem in `error_message`, `stack_trace`, and `context`?",
        criteria: {
          database_deadlock: "Database row lock contention, blocked transaction PID, or query timeout on checkout or payment_records tables.",
          application_code_bug: "Runtime source code bug such as TypeError, undefined property access, NaN math calculation, or division by zero in application logic.",
          cache_resource_bloat: "In-memory or CDN catalog cache key bloat, memory pressure exceeding watermark, or stale thumbnail cache.",
          auth_session_failure: "User authentication, login endpoint, or session token service outage."
        }
      },
      blocks_checkout_or_payment: {
        type: "noul",
        instructions: "Does this incident block customers from completing payment or checkout transactions due to a database lock or gateway timeout?"
      },
      is_runtime_code_exception: {
        type: "noul",
        instructions: "Does `error_message` or `stack_trace` indicate a source code calculation or runtime exception (such as TypeError, undefined property, or NaN) in cart or coupon logic?"
      },
      is_cache_or_memory_bloat: {
        type: "noul",
        instructions: "Is this incident about cache key bloat or memory pressure in the catalog or CDN cache?"
      }
    }.freeze

     NOUL_HIGH_THRESHOLD = 0.7
     NOUL_LOW_THRESHOLD = 0.3

    def initialize(api_key: ENV["TYPESAFE_API_KEY"], model: ENV.fetch("TYPESAFE_MODEL", DEFAULT_MODEL))
      @api_key = api_key
      @model = model
    end

    def configured?
      @api_key.present? && ENV["MOCK_AI"] != "true"
    end

    # Categorizes raw telemetry state using Jev and applies the code truth table
    def categorize_signal(service:, raw_payload:)
      state = build_clean_state(service: service, raw_payload: raw_payload)

      if configured?
        begin
          response = call_system_one_api(state: state)
          return evaluate_truth_table(response: response, state: state)
        rescue StandardError => e
          Rails.logger.warn("[AiSre::TypesafeJevClient] Jev API call failed (#{e.message}), using deterministic truth table fallback.")
        end
      end

      fallback_truth_table(state: state)
    end

    private

    # Design the state (SKILL.md):
    # - Structure with named fields
    # - Ensure every field is relevant
    # - Strip any pre-labeled severity so the model judges purely from telemetry evidence
    def build_clean_state(service:, raw_payload:)
      payload = (raw_payload || {}).with_indifferent_access
      nested = payload[:raw_payload].is_a?(Hash) ? payload[:raw_payload].with_indifferent_access : {}

      {
        service_slug: (service&.slug || payload[:service_slug] || "unknown").to_s,
        service_name: (service&.name || payload[:service_name] || "Unknown Service").to_s,
        service_description: service&.description.to_s,
        error_code: (payload[:error_code] || nested[:error_code] || "UNCLASSIFIED_ERROR").to_s,
        error_message: (payload[:message] || nested[:message] || "Unhandled service telemetry signal").to_s,
        stack_trace: (nested[:stack_trace] || payload[:stack_trace]).to_s.slice(0, 3000),
        source_file: (nested[:source_file] || payload[:source_file]).to_s,
        line_number: nested[:line_number] || payload[:line_number],
        metrics: payload[:metrics] || nested[:metrics] || {},
        context: nested[:context] || payload[:context] || {
          bloat_count: nested[:bloat_count] || payload[:bloat_count],
          memory_mb: nested[:memory_mb] || payload[:memory_mb]
        }.compact
      }.compact
    end

    def call_system_one_api(state:)
      url = URI(API_URL)
      http = Net::HTTP.new(url.host, url.port)
      http.use_ssl = true
      http.read_timeout = 10
      http.open_timeout = 5

      request = Net::HTTP::Post.new(
        url.request_uri,
        {
          "Content-Type" => "application/json",
          "Authorization" => "Bearer #{@api_key}"
        }
      )

      request.body = {
        model: @model,
        state: state,
        questions: QUESTIONS
      }.to_json

      response = http.request(request)
      unless response.is_a?(Net::HTTPSuccess)
        raise "TypeSafe SystemOne HTTP #{response.code}: #{response.body}"
      end

      JSON.parse(response.body).with_indifferent_access
    end

    # "Judgments from Jev, decisions in code" (SKILL.md)
    # Maps Jev's typed primitives (score, choice, noul) to concrete SRE severity, category, and tool_name.
    def evaluate_truth_table(response:, state:)
      res = (response || {}).with_indifferent_access
      answers = (res[:answers] || {}).with_indifferent_access

      score_ans = answers[:severity_score] || {}
      cat_ans = answers[:incident_category] || {}
      blocks_checkout = answers.dig(:blocks_checkout_or_payment, :noul).to_f
      is_code_bug = answers.dig(:is_runtime_code_exception, :noul).to_f
      is_cache_bloat = answers.dig(:is_cache_or_memory_bloat, :noul).to_f

      raw_score = score_ans[:score].to_f
      chosen_category = cat_ans[:choice].to_s

      # Truth Table Decision Logic (Judgments from Jev, decisions in code)
      category = if chosen_category.present? && chosen_category != "null"
        chosen_category
      elsif blocks_checkout >= NOUL_HIGH_THRESHOLD
        "database_deadlock"
      elsif is_cache_bloat >= NOUL_HIGH_THRESHOLD
        "cache_resource_bloat"
      elsif is_code_bug >= NOUL_HIGH_THRESHOLD
        "application_code_bug"
      else
        "application_code_bug"
      end

      severity = if blocks_checkout >= NOUL_HIGH_THRESHOLD || category == "database_deadlock" || raw_score >= 1.5
        "SEV-1"
      elsif is_cache_bloat >= NOUL_HIGH_THRESHOLD || (category == "cache_resource_bloat" && raw_score < 1.0) || raw_score < 0.5
        "SEV-3"
      else
        "SEV-2"
      end

      tool_name, risk_level = case category
      when "database_deadlock"
        [ "kill_db_locks_and_failover", "high" ]
      when "cache_resource_bloat"
        [ "flush_cache", "low" ]
      when "auth_session_failure"
        [ "rollback_feature_flag", (severity == "SEV-1" ? "high" : "medium") ]
      else
        [ "rollback_feature_flag", (severity == "SEV-1" ? "high" : "medium") ]
      end

      {
        provider: "typesafe_jev",
        model: res[:model] || @model,
        severity: severity,
        category: category,
        tool_name: tool_name,
        risk_level: risk_level,
        confidence: [ score_ans[:confidence].to_f, cat_ans[:confidence].to_f ].max.round(4),
        score: raw_score.round(4),
        probabilities: {
          severity_levels: score_ans[:probabilities] || {},
          categories: cat_ans[:probabilities] || {},
          blocks_checkout_or_payment: blocks_checkout.round(4),
          is_runtime_code_exception: is_code_bug.round(4),
          is_cache_or_memory_bloat: is_cache_bloat.round(4)
        }
      }.with_indifferent_access
    end

    def fallback_truth_table(state:)
      slug = state[:service_slug].to_s.downcase
      err_code = state[:error_code].to_s.upcase
      msg = state[:error_message].to_s.downcase
      stack = state[:stack_trace].to_s.downcase
      error_rate = state.dig(:metrics, :error_rate).to_f

      if slug == "checkout" || err_code.include?("LOCK") || err_code.include?("504") || msg.include?("deadlock") || msg.include?("lock") || error_rate >= 0.7
        {
          provider: "deterministic_fallback",
          model: "fallback-truth-table",
          severity: "SEV-1",
          category: "database_deadlock",
          tool_name: "kill_db_locks_and_failover",
          risk_level: "high",
          confidence: 0.95,
          score: 2.0,
          probabilities: { blocks_checkout_or_payment: 0.98 }
        }.with_indifferent_access
      elsif slug == "catalog" || err_code.include?("CACHE") || err_code.include?("BLOAT") || msg.include?("cache") || msg.include?("bloat")
        {
          provider: "deterministic_fallback",
          model: "fallback-truth-table",
          severity: "SEV-3",
          category: "cache_resource_bloat",
          tool_name: "flush_cache",
          risk_level: "low",
          confidence: 0.95,
          score: 0.0,
          probabilities: { is_cache_or_memory_bloat: 0.98 }
        }.with_indifferent_access
      else
        {
          provider: "deterministic_fallback",
          model: "fallback-truth-table",
          severity: "SEV-2",
          category: "application_code_bug",
          tool_name: "rollback_feature_flag",
          risk_level: "medium",
          confidence: 0.95,
          score: 1.0,
          probabilities: { is_runtime_code_exception: 0.98 }
        }.with_indifferent_access
      end
    end
  end
end
