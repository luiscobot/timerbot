require "test_helper"

class ProjectionsControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "it renders the clock and nothing to drive it with" do
    get projection_path(timers(:one).projection_slug)

    assert_response :success
    assert_select "#timer_clock"
    assert_select "#timer_controls", count: 0
  end

  # The point of the second slug: this page hangs on a wall.
  test "the page never exposes the control slug" do
    timer = timers(:one)

    get projection_path(timer.projection_slug)

    assert_response :success
    assert_no_match timer.slug, response.body
  end

  test "the projection slug is found whatever case it arrives in" do
    get "/p/#{timers(:one).projection_slug.upcase}"

    assert_response :success
  end

  test "an unknown slug is a 404" do
    get "/p/missing"

    assert_response :not_found
  end

  test "it folds back a timer that ran out unwatched" do
    travel_to Time.current do
      timers(:one).start
      travel 700.seconds

      get projection_path(timers(:one).projection_slug)

      assert_response :success
      assert timers(:one).reload.idle?
    end
  end

  test "rendering a running timer does not write to it" do
    timers(:one).start

    assert_no_changes -> { timers(:one).reload.updated_at } do
      get projection_path(timers(:one).projection_slug)
    end
  end
end
