class EnsureRunningTimersHaveAStart < ActiveRecord::Migration[8.1]
  # remaining subtracts elapsed time from started_at, so a row that says running
  # without one raises on every render of the clock.
  def change
    add_check_constraint :timers,
      "status != 'running' OR started_at IS NOT NULL",
      name: "running_timers_have_a_start"
  end
end
