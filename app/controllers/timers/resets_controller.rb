module Timers
  class ResetsController < ApplicationController
    def create
      Timer.controlled_by(params[:timer_slug]).reset
      head :no_content
    end
  end
end
