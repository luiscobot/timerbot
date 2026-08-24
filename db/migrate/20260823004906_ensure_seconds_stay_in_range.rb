class EnsureSecondsStayInRange < ActiveRecord::Migration[8.1]
  # normalizes clamps every duration on assignment and the transitions never
  # write a negative remainder; this keeps both rules through writes that skip
  # them. The hour ceiling stays out on purpose: MAX_DURATION is a knob already
  # mirrored in the JavaScript, and a third copy would have to move with it.
  def change
    add_check_constraint :timers, "duration >= 1",
      name: "durations_are_positive"
    add_check_constraint :timers, "remaining_seconds >= 0",
      name: "remaining_seconds_never_negative"
  end
end
