module Projections
  class CompletionsController < ApplicationController
    # A client's countdown hit zero. Keyed by the projection slug, so the
    # broadcast clock never carries the control one. Idempotent: racing
    # clients are fine.
    def create
      Timer.projected_by(params[:projection_slug]).complete
      head :no_content
    end
  end
end
