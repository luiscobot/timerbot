ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # The rate limit counts in the cache, keyed by address, and every test comes
    # from the same one.
    setup { Rails.cache.clear }
  end
end

module ActionDispatch
  class IntegrationTest
    # Rails comes from www.example.com, which routes.rb redirects. These tests
    # are about what the app serves, so they ask for it by its bare host; the
    # redirect is tested where it belongs.
    setup { host! "example.com" }
  end
end
