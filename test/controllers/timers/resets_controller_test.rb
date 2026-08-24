require "test_helper"

class Timers::ResetsControllerTest < ActionDispatch::IntegrationTest
  test "resetting restores the full duration" do
    post timer_run_path(timers(:one))
    post timer_reset_path(timers(:one))

    assert_response :no_content
    timer = timers(:one).reload
    assert timer.idle?
    assert_equal 600, timer.remaining_seconds
  end

  test "an unknown slug is a 404" do
    post "/t/missing/reset"

    assert_response :not_found
  end
end
