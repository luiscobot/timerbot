require "test_helper"

class WatchesControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "it renders the clock and nothing to drive it with" do
    get watch_path(timers(:one).watch_slug)

    assert_response :success
    assert_select "#timer_clock"
    assert_select "#timer_controls", count: 0
  end

  test "it subscribes to the clock stream of its language" do
    timer = timers(:one)

    get watch_path(timer.watch_slug)

    assert_select "html[lang=es]"
    assert_select "turbo-cable-stream-source", count: 1
    assert_select "turbo-cable-stream-source[signed-stream-name=?]",
                  Turbo::StreamsChannel.signed_stream_name([ timer, :es ])
    assert_select ".minutes .label", "minutos"

    get watch_path(timer.watch_slug), headers: { "Accept-Language" => "en" }

    assert_select "html[lang=en]"
    assert_select "turbo-cable-stream-source", count: 1
    assert_select "turbo-cable-stream-source[signed-stream-name=?]",
                  Turbo::StreamsChannel.signed_stream_name([ timer, :en ])
    assert_select ".minutes .label", "minutes"
    assert_select ".seconds .label", "seconds"
    assert_select ".control.fullscreen[aria-label=?]", "Full screen"
    assert_select ".control.fullscreen[data-fullscreen-exit-label-value=?]", "Exit full screen"
  end

  # The point of the second slug: this page hangs on a wall.
  test "the page never exposes the control slug" do
    timer = timers(:one)

    get watch_path(timer.watch_slug)

    assert_response :success
    assert_no_match timer.slug, response.body
  end

  test "the watch slug is found whatever case it arrives in" do
    get "/w/#{timers(:one).watch_slug.upcase}"

    assert_response :success
  end

  test "an unknown slug is a 404" do
    get "/w/missing"

    assert_response :not_found
  end

  # What the watch page is left showing when the countdown ends: the zero, not
  # the duration it started from.
  test "it folds back a timer that ran out unwatched, at zero" do
    travel_to Time.current do
      timers(:one).start
      travel 700.seconds

      get watch_path(timers(:one).watch_slug)

      assert_response :success
      assert timers(:one).reload.idle?
      assert_select "[data-timer-remaining-ms-value=?]", "0"
      assert_select ".minutes .digits", "00"
      assert_select ".seconds .digits", "00"
    end
  end

  test "rendering a running timer does not write to it" do
    timers(:one).start

    assert_no_changes -> { timers(:one).reload.updated_at } do
      get watch_path(timers(:one).watch_slug)
    end
  end
end
