require "test_helper"

class Projections::CompletionsControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "it resets a timer that has run out" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 700.seconds
      post projection_completion_path(timers(:one).projection_slug)

      assert_response :no_content
      assert timers(:one).reload.idle?
    end
  end

  test "it is ignored while time remains" do
    post timer_run_path(timers(:one))
    post projection_completion_path(timers(:one).projection_slug)

    assert_response :no_content
    assert timers(:one).reload.running?
  end

  # Every open page posts this; the second must not reset a restarted clock.
  test "a second one changes nothing" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 700.seconds
      post projection_completion_path(timers(:one).projection_slug)
      post projection_completion_path(timers(:one).projection_slug)

      assert_response :no_content
      assert timers(:one).reload.idle?
      assert_equal 600, timers(:one).reload.remaining_seconds
    end
  end

  test "an unknown slug is a 404" do
    post "/p/missing/completion"

    assert_response :not_found
  end
end
