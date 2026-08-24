module Timers
  class RunsController < ApplicationController
    # Iniciar and Reanudar both: start resumes from whatever remains.
    def create
      Timer.controlled_by(params[:timer_slug]).start
      head :no_content
    end

    def destroy
      Timer.controlled_by(params[:timer_slug]).pause
      head :no_content
    end
  end
end
