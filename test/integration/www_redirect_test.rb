require "test_helper"

class WwwRedirectTest < ActionDispatch::IntegrationTest
  test "www redirects to the bare host and keeps the path" do
    get "http://www.timerbot.co/5m30s"

    assert_response :moved_permanently
    assert_redirected_to "https://timerbot.co/5m30s"
  end

  # The slug pages are the ones people paste to each other, so a www link has
  # to carry its whole address over, query string included.
  test "www keeps the rest of the address" do
    get "http://www.timerbot.co/t/abc123?x=1"

    assert_redirected_to "https://timerbot.co/t/abc123?x=1"
  end

  test "the bare host is served, not redirected" do
    get "http://timerbot.co/"

    assert_response :success
  end
end
