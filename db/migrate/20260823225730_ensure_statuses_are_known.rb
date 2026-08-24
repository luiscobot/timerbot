class EnsureStatusesAreKnown < ActiveRecord::Migration[8.1]
  # The enum refuses these at assignment; this refuses them from raw writes too,
  # like the other constraints on this table.
  def change
    add_check_constraint :timers,
      "status IN ('idle', 'running', 'paused')",
      name: "statuses_are_known"
  end
end
