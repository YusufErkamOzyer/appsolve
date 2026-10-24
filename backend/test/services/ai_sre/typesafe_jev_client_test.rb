# frozen_string_literal: true

require "test_helper"

class TypesafeJevClientTest < ActiveSupport::TestCase
  setup do
    @checkout = services(:checkout)
    @cart = services(:cart)
    @catalog = services(:catalog)
    @client = AiSre::TypesafeJevClient.new
  end

  test "evaluates Jev System One score, choice, and noul judgments into SEV-1 truth table decision" do
    mock_response = {
      "model" => "jev-1.14.0",
      "answers" => {
        "severity_score" => {
          "type" => "score",
          "score" => 1.98,
          "confidence" => 0.99,
          "probabilities" => { "0" => 0.0, "1" => 0.02, "2" => 0.98 }
        },
        "incident_category" => {
          "type" => "choice",
          "choice" => "database_deadlock",
          "confidence" => 1.0,
          "probabilities" => { "database_deadlock" => 1.0, "application_code_bug" => 0.0 }
        },
        "blocks_checkout_or_payment" => { "type" => "noul", "noul" => 0.99 },
        "is_runtime_code_exception" => { "type" => "noul", "noul" => 0.01 },
        "is_cache_or_memory_bloat" => { "type" => "noul", "noul" => 0.0 }
      }
    }

    decision = @client.send(:evaluate_truth_table, response: mock_response, state: {})
    assert_equal "typesafe_jev", decision[:provider]
    assert_equal "jev-1.14.0", decision[:model]
    assert_equal "SEV-1", decision[:severity]
    assert_equal "database_deadlock", decision[:category]
    assert_equal "kill_db_locks_and_failover", decision[:tool_name]
    assert_equal "high", decision[:risk_level]
    assert_equal 1.0, decision[:confidence]
  end

  test "evaluates Jev System One judgments into SEV-2 application_code_bug decision" do
    mock_response = {
      "model" => "jev-1.14.0",
      "answers" => {
        "severity_score" => {
          "type" => "score",
          "score" => 1.0,
          "confidence" => 1.0,
          "probabilities" => { "0" => 0.0, "1" => 1.0, "2" => 0.0 }
        },
        "incident_category" => {
          "type" => "choice",
          "choice" => "application_code_bug",
          "confidence" => 1.0,
          "probabilities" => { "database_deadlock" => 0.0, "application_code_bug" => 1.0 }
        },
        "blocks_checkout_or_payment" => { "type" => "noul", "noul" => 0.12 },
        "is_runtime_code_exception" => { "type" => "noul", "noul" => 0.99 },
        "is_cache_or_memory_bloat" => { "type" => "noul", "noul" => 0.0 }
      }
    }

    decision = @client.send(:evaluate_truth_table, response: mock_response, state: {})
    assert_equal "SEV-2", decision[:severity]
    assert_equal "application_code_bug", decision[:category]
    assert_equal "rollback_feature_flag", decision[:tool_name]
    assert_equal "medium", decision[:risk_level]
  end

  test "evaluates Jev System One judgments into SEV-3 cache_resource_bloat decision" do
    mock_response = {
      "model" => "jev-1.14.0",
      "answers" => {
        "severity_score" => {
          "type" => "score",
          "score" => 0.05,
          "confidence" => 0.98,
          "probabilities" => { "0" => 0.95, "1" => 0.05, "2" => 0.0 }
        },
        "incident_category" => {
          "type" => "choice",
          "choice" => "cache_resource_bloat",
          "confidence" => 0.99,
          "probabilities" => { "cache_resource_bloat" => 0.99 }
        },
        "blocks_checkout_or_payment" => { "type" => "noul", "noul" => 0.01 },
        "is_runtime_code_exception" => { "type" => "noul", "noul" => 0.01 },
        "is_cache_or_memory_bloat" => { "type" => "noul", "noul" => 0.98 }
      }
    }

    decision = @client.send(:evaluate_truth_table, response: mock_response, state: {})
    assert_equal "SEV-3", decision[:severity]
    assert_equal "cache_resource_bloat", decision[:category]
    assert_equal "flush_cache", decision[:tool_name]
    assert_equal "low", decision[:risk_level]
  end
end
