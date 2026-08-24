# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_08_23_225730) do
  create_table "timers", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "duration", default: 300, null: false
    t.string "projection_slug", null: false
    t.integer "remaining_seconds", default: 300, null: false
    t.string "slug", null: false
    t.datetime "started_at"
    t.string "status", default: "idle", null: false
    t.datetime "updated_at", null: false
    t.index ["projection_slug"], name: "index_timers_on_projection_slug", unique: true
    t.index ["slug"], name: "index_timers_on_slug", unique: true
    t.check_constraint "duration >= 1", name: "durations_are_positive"
    t.check_constraint "remaining_seconds >= 0", name: "remaining_seconds_never_negative"
    t.check_constraint "status != 'running' OR started_at IS NOT NULL", name: "running_timers_have_a_start"
    t.check_constraint "status IN ('idle', 'running', 'paused')", name: "statuses_are_known"
  end
end
