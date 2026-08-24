class SweepTimersJob < ApplicationJob
  # delete_all: no callbacks, nothing associated.
  def perform
    Timer.abandoned.delete_all
  end
end
