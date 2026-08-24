class ProjectionsController < ApplicationController
  # Watch only: this slug reaches no transition, and the page never sees the
  # control one.
  def show
    @timer = Timer.projected_by(params[:slug])
  end
end
