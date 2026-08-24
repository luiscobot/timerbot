require "test_helper"

class TimersControllerTest < ActionDispatch::IntegrationTest
  include ActiveSupport::Testing::TimeHelpers

  test "the root writes nothing and offers an editable clock" do
    assert_no_difference("Timer.count") { get root_path }

    assert_response :success
    # Derived, so changing the default is a one-line change.
    minutes, seconds = Timer::DEFAULT_DURATION.divmod(60)
    assert_select "[data-duration-target=minutes]", text: format("%02d", minutes)
    assert_select "[data-duration-target=seconds]", text: format("%02d", seconds)
    assert_select "input[type=hidden][name=duration][value=?]", Timer::DEFAULT_DURATION.to_s
  end

  # Both ways out of the entry page create. Nothing else does.
  test "the root offers Iniciar and Proyectar and both post" do
    get root_path

    assert_select "form[action=?][method=post]", timers_path
    assert_select "form[action=?] input[type=submit][name=start]", timers_path
    assert_select "form[action=?] button[data-action*=?]", timers_path, "create#project"
    # A zero clock must not start; the submit is where that is caught.
    assert_select "main[data-action*=?]", "duration#submit"
    assert_select "main[data-controller~=?]", "duration"
  end

  test "create makes a timer and leaves it idle" do
    assert_difference("Timer.count") { post timers_path, params: { duration: 125 } }

    timer = Timer.last
    assert_redirected_to timer_path(timer)
    assert_equal 125, timer.duration
    assert timer.idle?
    assert_nil timer.started_at
  end

  test "create starts the countdown when asked to" do
    post timers_path, params: { duration: 125, start: "Iniciar" }

    timer = Timer.last
    assert_redirected_to timer_path(timer)
    assert timer.running?
  end

  test "creating is limited per address" do
    limit = TimersController::CREATION_LIMIT

    assert_difference("Timer.count", limit) do
      limit.times { post timers_path, params: { duration: 300 } }
    end

    assert_no_difference("Timer.count") do
      post timers_path, params: { duration: 300 }
    end

    assert_response :too_many_requests
  end

  # A page of its own would throw away the clock they had just set.
  test "the limit answers on the same screen, with the clock intact" do
    limit = TimersController::CREATION_LIMIT

    (limit + 1).times { post timers_path, params: { duration: 125 } }

    assert_response :too_many_requests
    assert_select "input[type=hidden][name=duration][value=?]", "125"
    assert_select ".error:not([hidden])", text: /Espera un momento/
    assert_select "input[type=submit][name=start]"
  end

  # The limit answers Proyectar in HTML; the create controller reads only the
  # status and posts the form to get the message up.
  test "the limit turns Proyectar away too" do
    TimersController::CREATION_LIMIT.times do
      post timers_path, params: { duration: 125 }, as: :json
    end

    assert_no_difference("Timer.count") do
      post timers_path, params: { duration: 125 }, as: :json
    end

    assert_response :too_many_requests
  end

  test "create clamps an out of range duration" do
    post timers_path, params: { duration: 10_000_000 }

    assert_equal Timer::MAX_DURATION, Timer.last.duration
  end

  test "create falls back to the default for a junk duration" do
    post timers_path, params: { duration: "abc" }

    assert_equal Timer::DEFAULT_DURATION, Timer.last.duration
  end

  # expect at the door: a bare POST must not mint a default-length timer.
  test "create refuses a missing or non-scalar duration" do
    assert_no_difference("Timer.count") do
      post timers_path
      assert_response :bad_request

      post timers_path, params: { duration: [ "1" ] }
      assert_response :bad_request
    end
  end

  # Two tabs to point, so it asks for both paths rather than a redirect.
  test "create hands back both paths as json" do
    post timers_path, params: { duration: 125 }, as: :json

    assert_response :success
    timer = Timer.last
    body = JSON.parse(response.body)
    assert_equal timer_path(timer), body["dashboard"]
    assert_equal projection_path(timer.projection_slug), body["projection"]
    assert_no_match timer.slug, body["projection"]
  end

  # Two inline pieces ride on the nonce: the theme script and the <style> Turbo
  # injects. Without a policy the page lands in the wrong palette.
  test "every page carries a policy, and the nonce reaches what needs it" do
    get root_path

    policy = response.headers["Content-Security-Policy"]
    nonce = policy[/script-src 'self' 'nonce-([^']+)'/, 1]

    assert_not_nil nonce, policy
    assert_includes policy, "default-src 'self'"
    assert_includes policy, "style-src 'self' 'nonce-#{nonce}'"
    assert_includes policy, "object-src 'none'"

    assert_select "script[nonce=?]", nonce
    # What Turbo reads to nonce the style element it injects.
    assert_select "meta[name=csp-nonce][content=?]", nonce
  end

  test "show renders the dashboard" do
    get timer_path(timers(:one))

    assert_response :success
    assert_select "#timer_clock"
    assert_select "#timer_controls button", text: "Iniciar"
  end

  test "the entry page binds the shortcuts too" do
    get root_path

    assert_select "[data-controller~=shortcuts]"
    assert_select ".control.start[title=?]", "Iniciar (Espacio)"
    assert_select ".control.projection[title=?]", "Proyectar (P)"
    # Nothing to put back yet, so R has no button here.
    assert_select ".control.reset", count: 0
  end

  test "the dashboard names its keyboard shortcuts on the buttons" do
    get timer_path(timers(:one))

    assert_select "[data-controller~=shortcuts]"
    assert_select ".control.start[title=?]", "Iniciar (Espacio)"
    assert_select ".control.reset[title=?]", "Reiniciar (R)"
    assert_select ".control.projection[title=?]", "Proyectar (P)"
  end

  test "update moves an idle clock" do
    timer = timers(:one)

    patch timer_path(timer), params: { duration: 90 }

    assert_response :no_content
    assert_equal 90, timer.reload.duration
  end

  # The same fold show does: a clock that ran out is idle, not busy.
  test "update accepts a timer that ran out unwatched" do
    travel_to Time.current do
      timers(:one).start
      travel 700.seconds

      patch timer_path(timers(:one)), params: { duration: 90 }

      assert_response :no_content
      assert_equal 90, timers(:one).reload.duration
    end
  end

  test "update refuses a running clock" do
    timer = timers(:one)
    timer.start

    patch timer_path(timer), params: { duration: 90 }

    assert_response :conflict
    assert_equal 600, timer.reload.duration
  end

  test "update refuses a paused clock" do
    timer = timers(:one)
    timer.start
    timer.pause

    patch timer_path(timer), params: { duration: 90 }

    assert_response :conflict
    assert_equal 600, timer.reload.duration
  end

  # The client refuses zero before it posts, but normalizes would fold one into
  # the default, so the endpoint holds the line too. 422, not 409: the state
  # was fine, the value was not.
  test "update refuses a duration of zero" do
    timer = timers(:one)

    patch timer_path(timer), params: { duration: 0 }

    assert_response :unprocessable_entity
    assert_equal 600, timer.reload.duration
  end

  # The same door as create: a duration[]= post answers 400 before the model
  # sees it.
  test "update refuses a non-scalar duration" do
    timer = timers(:one)

    patch timer_path(timer), params: { duration: [ "90" ] }

    assert_response :bad_request
    assert_equal 600, timer.reload.duration
  end

  # Same URL as the dashboard, different verb.
  test "the dashboard url takes the update" do
    timer = timers(:one)

    assert_equal timer_path(timer), "/t/#{timer.slug}"

    get "/t/#{timer.slug}/duration"
    assert_response :not_found
  end

  # The projection renders the same clock partial and must not learn the
  # control slug.
  test "only the dashboard wires the clock for editing" do
    timer = timers(:one)

    get timer_path(timer)
    assert_select "[data-duration-url-value=?]", timer_path(timer)
    assert_select "main[data-action*=?]", "duration#submit"

    get projection_path(timer.projection_slug)
    assert_select "[data-duration-url-value]", count: 0
    assert_select "[data-controller~=duration]", count: 0
  end

  # Without this the editor would offer an edit over a countdown.
  test "the clock hands the editor the status it goes by" do
    get timer_path(timers(:one))

    assert_select "#timer_clock[data-duration-target=clock][data-timer-status-value=idle]"
  end

  test "showing a timer that ran out unwatched folds it back to idle" do
    travel_to Time.current do
      timers(:one).start
      travel 700.seconds

      get timer_path(timers(:one))

      assert_response :success
      assert timers(:one).reload.idle?
      assert_select "[data-timer-remaining-ms-value=?]", "600000"
    end
  end

  test "rendering a running timer does not write to it" do
    timers(:one).start

    assert_no_changes -> { timers(:one).reload.updated_at } do
      get timer_path(timers(:one))
    end
  end

  # Every route looks its slug up for itself; one test catches the one that
  # forgets to forgive case.
  test "a slug is found whatever case it arrives in" do
    timer = timers(:one)
    shouted = timer.slug.upcase

    get "/t/#{shouted}"
    assert_response :success

    patch "/t/#{shouted}", params: { duration: 90 }
    assert_response :no_content

    post "/t/#{shouted}/run"
    assert_response :no_content
    assert timer.reload.running?

    delete "/t/#{shouted}/run"
    assert_response :no_content
    assert timer.reload.paused?

    post "/t/#{shouted}/reset"
    assert_response :no_content
    assert timer.reload.idle?
  end

  # Every control route, not just the run: the guard a new one would walk past.
  test "the projection slug cannot be used to control the timer" do
    timer = timers(:one)
    watching = timer.projection_slug

    post "/t/#{watching}/run"
    assert_response :not_found, "start answered to the projection slug"

    delete "/t/#{watching}/run"
    assert_response :not_found, "pause answered to the projection slug"

    post "/t/#{watching}/reset"
    assert_response :not_found, "reset answered to the projection slug"

    patch "/t/#{watching}", params: { duration: 90 }
    assert_response :not_found, "update answered to the projection slug"

    timer.reload
    assert timer.idle?
    assert_equal 600, timer.duration
  end

  test "unknown slug is a 404" do
    get "/t/missing"

    assert_response :not_found
  end

  test "a duration under /t is not a shorthand" do
    assert_no_difference("Timer.count") { get "/t/5m30s" }

    assert_response :not_found
  end

  test "the shorthand accepts minutes or seconds on their own" do
    get "/10m"
    assert_select "input[name=duration][value=?]", "600"

    get "/45s"
    assert_select "input[name=duration][value=?]", "45"
  end

  # Forgiven like the case of a slug: both are typed by hand.
  test "the shorthand takes its unit in either case" do
    get "/10M"
    assert_response :success
    assert_select "input[name=duration][value=?]", "600"

    get "/5M30S"
    assert_select "input[name=duration][value=?]", "330"
  end

  test "the shorthand clamps a duration past the ceiling" do
    get "/500m"

    assert_select "input[name=duration][value=?]", Timer::MAX_DURATION.to_s
  end

  test "the same shorthand works straight off the root" do
    assert_no_difference("Timer.count") { get "/5m5s" }

    assert_response :success
    assert_select "[data-duration-target=minutes]", text: "05"
    assert_select "[data-duration-target=seconds]", text: "05"
    assert_select "input[name=duration][value=?]", "305"
  end

  test "no route into the app starts a countdown on its own" do
    get root_path
    get "/5m5s"
    post timers_path, params: { duration: 305 }

    assert_empty Timer.running
  end

  test "the root shorthand does not swallow other paths" do
    assert_no_difference("Timer.count") do
      get "/nope"
      assert_response :not_found

      get "/up"
      assert_response :success
    end
  end

  test "a zero length shorthand is a 404" do
    assert_no_difference("Timer.count") { get "/0m0s" }

    assert_response :not_found
  end
end
