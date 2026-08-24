require "test_helper"

class Watches::CompletionsControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "it stops a timer that has run out at zero" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 700.seconds
      post watch_completion_path(timers(:one).watch_slug)

      assert_response :no_content
      assert timers(:one).reload.idle?
      assert_equal 0, timers(:one).reload.remaining_seconds
    end
  end

  test "it is ignored while time remains" do
    post timer_run_path(timers(:one))
    post watch_completion_path(timers(:one).watch_slug)

    assert_response :no_content
    assert timers(:one).reload.running?
  end

  # Every open page posts this; the second must not reset a restarted clock.
  test "a second one changes nothing" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 700.seconds
      post watch_completion_path(timers(:one).watch_slug)
      post watch_completion_path(timers(:one).watch_slug)

      assert_response :no_content
      assert timers(:one).reload.idle?
      assert_equal 0, timers(:one).reload.remaining_seconds
    end
  end

  test "an unknown slug is a 404" do
    post "/w/missing/completion"

    assert_response :not_found
  end
end
