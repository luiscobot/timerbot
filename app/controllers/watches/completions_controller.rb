module Watches
  class CompletionsController < ApplicationController
    # A client's countdown hit zero. Keyed by the watch slug, so the broadcast
    # clock never carries the control one. Idempotent: racing clients are fine.
    def create
      Timer.watched_by(params[:watch_slug]).complete
      head :no_content
    end
  end
end
