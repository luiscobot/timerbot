class TimersController < ApplicationController
  # Well above normal use: SweepTimersJob is what bounds the table.
  CREATION_LIMIT = 10

  rate_limit to: CREATION_LIMIT, within: 1.minute, only: :create,
             with: :too_many_timers

  before_action :set_timer, only: %i[show update]

  # / and the shorthand. Nothing is written until Iniciar or Proyectar.
  def new
    @timer = Timer.new(duration: requested_duration)
  end

  # Only Iniciar sends start. The JSON is for Proyectar, which points two tabs;
  # without JavaScript it posts as a form and lands on the dashboard.
  def create
    timer = Timer.create!(duration: params.expect(:duration))
    timer.start if params[:start].present?

    respond_to do |format|
      format.html { redirect_to timer }
      format.json do
        render json: { dashboard: timer_path(timer),
                       projection: projection_path(timer.projection_slug) }
      end
    end
  end

  # show is implicit: set_timer leaves nothing for it to do.

  # In the order the refusals happen: the state first, then the value. Idle
  # only: a running or paused clock counts against remaining_seconds, so moving
  # the duration under it would orphan that number.
  def update
    if !@timer.idle?
      head :conflict
    elsif @timer.change_duration(params.expect(:duration))
      head :no_content
    else
      head :unprocessable_entity
    end
  end

  private
    # Same page, clock intact; 429 because nothing was created.
    def too_many_timers
      @timer = Timer.new(duration: params.expect(:duration))
      flash.now[:alert] = "Espera un momento."

      render :new, status: :too_many_requests
    end

    # The route constraint guarantees the shape, so parse_duration only comes
    # back empty for a zero like /0m.
    def requested_duration
      return Timer::DEFAULT_DURATION unless params[:duration]

      Timer.parse_duration(params[:duration]) || raise(ActiveRecord::RecordNotFound)
    end

    def set_timer
      @timer = Timer.controlled_by(params[:slug])
    end
end
