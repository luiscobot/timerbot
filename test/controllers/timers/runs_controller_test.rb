require "test_helper"

class Timers::RunsControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "creating the run begins the countdown" do
    post timer_run_path(timers(:one))

    assert_response :no_content
    assert timers(:one).reload.running?
  end

  test "destroying it freezes the countdown where it stands" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 60.seconds
      delete timer_run_path(timers(:one))

      assert_response :no_content
      timer = timers(:one).reload
      assert timer.paused?
      assert_equal 540, timer.remaining_seconds
    end
  end

  # Reanudar is Iniciar again: the remainder on the record makes it a resume.
  test "creating it again resumes from what was left" do
    travel_to Time.current do
      post timer_run_path(timers(:one))
      travel 60.seconds
      delete timer_run_path(timers(:one))
      travel 300.seconds
      post timer_run_path(timers(:one))

      assert_response :no_content
      timer = timers(:one).reload
      assert timer.running?
      assert_in_delta 540.0, timer.remaining, 1.0
    end
  end

  test "an unknown slug is a 404" do
    post "/t/missing/run"

    assert_response :not_found
  end
end
