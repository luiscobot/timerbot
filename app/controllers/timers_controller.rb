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

  # A deadline is already a start, so only the duration path reads Iniciar's
  # start. The JSON is for Proyectar, which points two tabs; without
  # JavaScript it posts as a form and lands on the dashboard.
  def create
    timer = params[:deadline].present? ? timer_until_deadline : timer_for_duration

    respond_to do |format|
      format.html { redirect_to timer }
      format.json do
        render json: { dashboard: timer_path(timer),
                       watch: watch_path(timer.watch_slug) }
      end
    end
  rescue Timer::UnreachableDeadline => error
    refuse(error.message, :unprocessable_entity)
  rescue ArgumentError
    # iso8601 on an instant nothing can read: only a hand-crafted POST gets here.
    head :bad_request
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
    def timer_until_deadline
      Timer.running_until(Time.zone.iso8601(params.expect(:deadline)))
    end

    def timer_for_duration
      Timer.create!(duration: params.expect(:duration)).tap do |timer|
        timer.start if params[:start].present?
      end
    end

    # Same page, clock and chosen hour intact; nothing was created. permit, not
    # expect: a deadline may arrive with no duration at all, and nil is the
    # default the screen should show back.
    def refuse(message, status)
      @timer = Timer.new(duration: params.permit(:duration)[:duration])
      @deadline = params[:deadline]
      flash.now[:alert] = message

      # formats, because Proyectar asks for JSON and there is no JSON entry
      # page. It reads the status and posts the form to land on this screen.
      render :new, formats: :html, status: status
    end

    # rate_limit hands its handler no arguments.
    def too_many_timers
      refuse("Espera un momento.", :too_many_requests)
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
