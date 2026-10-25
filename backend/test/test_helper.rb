ENV["RAILS_ENV"] ||= "test"
ENV["MOCK_AI"] = "true"
ENV["USE_MOCK_GIT"] = "true"
require_relative "../config/environment"
ENV["MOCK_AI"] = "true"
ENV["USE_MOCK_GIT"] = "true"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    setup do
      AiSre::AutomationConfig.reset!
    end

    teardown do
      AiSre::AutomationConfig.reset!
    end

    # Add more helper methods to be used by all tests here...
  end
end
