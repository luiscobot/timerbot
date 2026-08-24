require "test_helper"
# Not autoloaded by the gem.
require "turbo/broadcastable/test_helper"

class TimerTest < ActiveSupport::TestCase
  include ActiveSupport::Testing::TimeHelpers
  include Turbo::Broadcastable::TestHelper

  test "creation generates a slug and applies defaults" do
    timer = Timer.create!

    assert_match(/\A[a-z0-9]{6}\z/, timer.slug)
    assert_equal Timer::DEFAULT_DURATION, timer.duration
    assert_equal Timer::DEFAULT_DURATION, timer.remaining_seconds
    assert timer.idle?
  end

  # Two spellings of one number, and they drifted apart once already.
  test "the column default is the default duration" do
    assert_equal Timer::DEFAULT_DURATION, Timer.column_defaults["duration"]
    assert_equal Timer::DEFAULT_DURATION, Timer.column_defaults["remaining_seconds"]
  end

  test "both slugs are lowercase, legible and independent of each other" do
    10.times do
      timer = Timer.create!

      assert_match(/\A[a-z0-9]{6}\z/, timer.slug)
      assert_match(/\A[a-z0-9]{6}\z/, timer.projection_slug)
      # The lookalikes of 1 and 0 the alphabet leaves out.
      assert_no_match(/[ilo]/, timer.slug + timer.projection_slug)
      assert_not_equal timer.slug, timer.projection_slug
    end
  end

  # Forced: the generator repeating itself is a lottery no run would see.
  # Patched by hand: minitest 6 dropped stub with minitest/mock.
  test "the projection slug is never minted equal to the control slug" do
    candidates = [ "abcdef", "abcdef", "xyz789" ]
    SecureRandom.define_singleton_method(:alphanumeric) { |*, **| candidates.shift }

    timer = Timer.create!

    assert_equal "abcdef", timer.slug
    assert_equal "xyz789", timer.projection_slug
  ensure
    SecureRandom.singleton_class.remove_method(:alphanumeric)
  end

  # The one place the case of a hand-typed link is forgiven.
  test "either slug is found whatever case it arrives in" do
    timer = timers(:one)

    assert_equal timer, Timer.controlled_by(timer.slug.upcase)
    assert_equal timer, Timer.projected_by(timer.projection_slug.upcase)
  end

  # The projection slug can never find a timer to drive.
  test "neither slug answers for the other" do
    timer = timers(:one)

    assert_raises(ActiveRecord::RecordNotFound) { Timer.controlled_by(timer.projection_slug) }
    assert_raises(ActiveRecord::RecordNotFound) { Timer.projected_by(timer.slug) }
  end

  # No caller has to remember the fold: a lookup hands back a settled timer.
  test "the finders fold back a timer that ran out unwatched" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 700.seconds
      assert Timer.controlled_by(timer.slug).idle?

      timer.reload.start
      travel 700.seconds
      assert Timer.projected_by(timer.projection_slug).idle?
    end
  end

  test "start begins the countdown" do
    timer = timers(:one)

    freeze_time do
      timer.start

      assert timer.running?
      assert_equal Time.current, timer.started_at
    end
  end

  test "start while running does not restart the countdown" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      original_start = timer.started_at

      travel 60.seconds
      timer.start

      assert_equal original_start, timer.reload.started_at
    end
  end

  test "remaining decreases with wall-clock time while running" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 60.seconds

      assert_in_delta 540.0, timer.remaining, 1.0
    end
  end

  test "pause freezes the remaining time" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 60.seconds
      timer.pause

      assert timer.paused?
      assert_equal 540, timer.remaining_seconds

      travel 120.seconds
      assert_equal 540.0, timer.remaining
    end
  end

  test "start after pause resumes from where it left off" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 60.seconds
      timer.pause
      travel 300.seconds
      timer.start
      travel 40.seconds

      assert_in_delta 500.0, timer.remaining, 1.0
    end
  end

  test "reset restores the full duration" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 60.seconds
      timer.reset

      assert timer.idle?
      assert_equal 600, timer.remaining_seconds
      assert_nil timer.started_at
    end
  end

  test "change_duration moves an idle clock and the value it will count from" do
    timer = timers(:one)

    assert timer.change_duration(90)
    assert_equal 90, timer.duration
    assert_equal 90, timer.remaining_seconds
  end

  test "change_duration clamps like any other way in" do
    timer = timers(:one)

    timer.change_duration(10_000_000)

    assert_equal Timer::MAX_DURATION, timer.duration
    assert_equal Timer::MAX_DURATION, timer.remaining_seconds
  end

  # Captures rather than assert_no_turbo_stream_broadcasts, which asserts the
  # whole log for a stream, not what the block added.
  test "change_duration broadcasts the clock and leaves the controls alone" do
    timer = timers(:one)

    clock = capture_turbo_stream_broadcasts timer do
      controls = capture_turbo_stream_broadcasts [ timer, :control ] do
        timer.change_duration(90)
      end

      assert_empty controls, "the controls were re-sent"
    end

    assert_equal 1, clock.count
  end

  # A transition does change the buttons, so that one sends both.
  test "a transition broadcasts the controls as well" do
    timer = timers(:one)

    assert_turbo_stream_broadcasts timer, count: 1 do
      assert_turbo_stream_broadcasts [ timer, :control ], count: 1 do
        timer.start
      end
    end
  end

  # normalizes would fold a non-positive duration into the default, leaving the
  # clock at five minutes and reporting success.
  test "change_duration refuses anything that is not a positive number" do
    timer = timers(:one)

    [ 0, -5, "abc", nil, "" ].each do |value|
      assert_not timer.change_duration(value), "accepted #{value.inspect}"
      assert_equal 600, timer.reload.duration
    end
  end

  # Not the default, which the column carries anyway.
  test "creation starts the clock at its full duration" do
    assert_equal 90, Timer.create!(duration: 90).remaining_seconds
  end

  test "remaining reports an expired timer as zero without writing" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 700.seconds

      assert_no_changes -> { timer.reload.updated_at } do
        assert_equal 0.0, timer.remaining
        assert timer.expired?
      end
    end
  end

  test "an expired running timer folds back to idle when completed" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 700.seconds
      timer.complete

      assert timer.idle?
      assert_equal 600.0, timer.remaining
    end
  end

  test "complete resets an expired timer and is idempotent" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 700.seconds

      timer.complete
      assert timer.idle?
      assert_equal 600, timer.remaining_seconds

      timer.complete
      assert timer.idle?
    end
  end

  test "complete does nothing while time remains" do
    timer = timers(:one)

    travel_to Time.current do
      timer.start
      travel 60.seconds
      timer.complete

      assert timer.running?
    end
  end

  # DURATION_PATTERN is a second spelling of the shape DURATION_SEGMENT admits
  # into the routes; this is what notices them drifting apart.
  test "every duration the route admits is parsed" do
    { "5m" => 300, "45s" => 45, "5m30s" => 330, "10M" => 600, "5M30S" => 330 }.each do |segment, seconds|
      assert_match(Timer::DURATION_SHAPED, segment)
      assert_equal seconds, Timer.parse_duration(segment), "#{segment} did not parse"
    end

    # A zero is admitted by shape and refused by value, which is /0m's 404.
    assert_match(Timer::DURATION_SHAPED, "0m")
    assert_nil Timer.parse_duration("0m")
  end

  # Forgiven like the case of a slug, so /10M is the page /10m is.
  test "parse_duration takes the unit in either case" do
    assert_equal 330, Timer.parse_duration("5m30s")
    assert_equal 330, Timer.parse_duration("5M30S")
    assert_equal 600, Timer.parse_duration("10M")
    assert_nil Timer.parse_duration("5 m")
    assert_nil Timer.parse_duration("abc")
  end

  test "abandoned finds the ones nobody has touched" do
    stale = Timer.create!
    stale.update_column(:updated_at, (Timer::RETENTION + 1.day).ago)

    assert_includes Timer.abandoned, stale
    assert_not_includes Timer.abandoned, Timer.create!
  end

  # Expiry folds in lazily, so it is still marked running. Abandoned anyway.
  test "abandoned includes a run nobody ever watched" do
    forgotten = Timer.create!
    forgotten.start
    forgotten.update_column(:updated_at, (Timer::RETENTION + 1.day).ago)

    assert forgotten.reload.running?
    assert_includes Timer.abandoned, forgotten
  end

  test "using a timer keeps it out of reach of the sweep" do
    timer = Timer.create!
    timer.update_column(:updated_at, (Timer::RETENTION + 1.day).ago)

    timer.start

    assert_not_includes Timer.abandoned, timer
  end

  # The transitions always write the pair together; the database keeps the rule
  # after a refactor.
  test "the database refuses a running timer with no start" do
    timer = timers(:one)

    assert_raises(ActiveRecord::StatementInvalid) do
      timer.update_columns(status: "running", started_at: nil)
    end
  end

  # Raw SQL: even update_columns casts through normalizes, which folds a zero
  # duration back into range.
  test "the database refuses a zero duration and a negative remainder" do
    timer = timers(:one)

    assert_raises(ActiveRecord::StatementInvalid) do
      Timer.lease_connection.execute("UPDATE timers SET duration = 0 WHERE id = #{timer.id}")
    end

    assert_raises(ActiveRecord::StatementInvalid) do
      Timer.lease_connection.execute("UPDATE timers SET remaining_seconds = -1 WHERE id = #{timer.id}")
    end
  end

  # The enum refuses these at assignment, so only raw SQL can even try.
  test "the database refuses a status it does not know" do
    timer = timers(:one)

    assert_raises(ActiveRecord::StatementInvalid) do
      Timer.lease_connection.execute("UPDATE timers SET status = 'bogus' WHERE id = #{timer.id}")
    end
  end

  test "slugs are unique" do
    timer = Timer.create!
    duplicate = Timer.new(slug: timer.slug)

    assert_raises(ActiveRecord::RecordNotUnique) { duplicate.save!(validate: false) }
  end

  test "duration is clamped into range on the way in" do
    assert_equal Timer::MAX_DURATION, Timer.new(duration: 10_000_000).duration
    assert_equal 1, Timer.new(duration: 1).duration
  end

  test "a duration that is not a positive number falls back to the default" do
    assert_equal Timer::DEFAULT_DURATION, Timer.new(duration: 0).duration
    assert_equal Timer::DEFAULT_DURATION, Timer.new(duration: -5).duration
    assert_equal Timer::DEFAULT_DURATION, Timer.new(duration: "abc").duration
    assert_equal Timer::DEFAULT_DURATION, Timer.new(duration: nil).duration
  end

  test "a slug shaped like a duration is never minted" do
    assert_nil Timer::DURATION_SEGMENT.match("abc123")
    assert_no_match(Timer::DURATION_SHAPED, Timer.create!.slug)
  end
end
