class CreateTimers < ActiveRecord::Migration[8.1]
  def change
    create_table :timers do |t|
      t.string :slug, null: false
      t.string :display_slug, null: false
      # Spelled out, not read from Timer::DEFAULT_DURATION, so this migration
      # cannot change meaning later. A test asserts the two agree.
      t.integer :duration, null: false, default: 300
      t.string :status, null: false, default: "idle"
      t.datetime :started_at
      t.integer :remaining_seconds, null: false, default: 300

      t.timestamps
    end

    add_index :timers, :slug, unique: true
    add_index :timers, :display_slug, unique: true
  end
end
