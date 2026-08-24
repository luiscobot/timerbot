require "test_helper"

class SweepTimersJobTest < ActiveJob::TestCase
  test "it deletes what nobody has touched and leaves the rest" do
    stale = abandoned_timer
    fresh = Timer.create!

    assert_difference("Timer.count", -1) { SweepTimersJob.perform_now }

    assert_not Timer.exists?(stale.id)
    assert Timer.exists?(fresh.id)
    assert Timer.exists?(timers(:one).id)
  end

  test "it has nothing to do when everything is recent" do
    assert_no_difference("Timer.count") { SweepTimersJob.perform_now }
  end

  private
    # update_column, so the write does not move the timestamp it is setting.
    def abandoned_timer
      Timer.create!.tap { |timer| timer.update_column(:updated_at, (Timer::RETENTION + 1.day).ago) }
    end
end
