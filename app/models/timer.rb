class Timer < ApplicationRecord
  SLUG_LENGTH = 6
  # No i, l or o: they read as 1 and 0 off a screen.
  SLUG_ALPHABET = ([ *"a".."z", *"0".."9" ] - %w[i l o]).freeze
  DEFAULT_DURATION = 300
  # One hour. The pages hand it to duration_controller.js, so this is the one
  # definition of the ceiling.
  MAX_DURATION = 60 * 60
  RETENTION = 30.days
  # A duration as a URL segment: /10m, /45s, /5m30s. Cased classes, not /i,
  # which a route constraint drops. Unanchored: route constraints reject \A.
  DURATION_SEGMENT = /\d+[mM]\d+[sS]|\d+[mM]|\d+[sS]/
  DURATION_SHAPED = /\A#{DURATION_SEGMENT}\z/
  DURATION_PATTERN = /\A(?:(\d+)m)?(?:(\d+)s)?\z/i

  enum :status, { idle: "idle", running: "running", paused: "paused" }, default: :idle

  # Clamped, not validated: a duration that survives assignment is legal. Also
  # coerces — zero or junk becomes the default. At create that is the answer:
  # only a hand-crafted POST sends junk there, and folding it still stores no
  # zero clock. An edit is refused instead — change_duration rejects before
  # assigning, so update can answer its 422.
  normalizes :duration, apply_to_nil: true, with: ->(duration) do
    seconds = duration.to_i
    seconds.positive? ? seconds.clamp(1, MAX_DURATION) : DEFAULT_DURATION
  end

  # Slugs are minted lowercase, and phones capitalise typed links. normalizes
  # reaches find_by too, so the finders below forgive case without doing it by
  # hand.
  normalizes :slug, :projection_slug, with: ->(slug) { slug.downcase }

  # No index on updated_at: this runs once a day.
  scope :abandoned, -> { where(updated_at: ..RETENTION.ago) }

  before_create :generate_slugs
  before_create :fill_remaining_seconds

  # Named for the column each kind of link may answer to, so the projection
  # slug can never find a timer to drive. Both hand back a settled timer:
  # expiry is folded in at lookup, so no caller has to remember to.
  def self.controlled_by(slug)
    find_by!(slug: slug).tap(&:complete)
  end

  def self.projected_by(projection_slug)
    find_by!(projection_slug: projection_slug).tap(&:complete)
  end

  # "5m30s", "10M" or "45s" as seconds. nil otherwise, which tells a shorthand
  # URL apart from an unknown slug.
  def self.parse_duration(text)
    match = DURATION_PATTERN.match(text.to_s)
    return if match.nil? || (match[1].nil? && match[2].nil?)

    seconds = (match[1].to_i * 60) + match[2].to_i
    seconds if seconds.positive?
  end

  def to_param
    slug
  end

  # Never writes: called on every render and broadcast.
  def remaining
    if running?
      [ remaining_seconds - (Time.current - started_at), 0 ].max
    else
      remaining_seconds.to_f
    end
  end

  # Ran out, but nothing wrote that down yet; complete does.
  def expired?
    running? && remaining.zero?
  end

  def start
    complete
    return if running?

    update!(status: :running, started_at: Time.current)
    broadcast_state
  end

  def pause
    complete
    return unless running?

    update!(status: :paused, remaining_seconds: remaining.ceil, started_at: nil)
    broadcast_state
  end

  def reset
    update!(status: :idle, remaining_seconds: duration, started_at: nil)
    broadcast_state
  end

  # Zero is refused here because normalizes would fold it into the default.
  # Idle-only is the controller's rule, where the 409 answers for it.
  def change_duration(seconds)
    seconds = seconds.to_i
    return false unless seconds.positive?

    self.duration = seconds
    self.remaining_seconds = duration
    save!
    # Clock only: resending the controls would drop the focus of anyone on one.
    broadcast_clock
    true
  end

  # Called by the finders at every lookup, by the transitions, and when a
  # client's countdown hits zero. Idempotent.
  def complete
    reset if expired?
  end

  private
    # Two streams: the projection subscribes only to the shared one, so it
    # never sees the control slug the controls embed.
    def broadcast_state
      broadcast_clock
      broadcast_replace_to [ self, :control ], target: "timer_controls", partial: "timers/controls", locals: { timer: self }
    end

    def broadcast_clock
      broadcast_replace_to self, target: "timer_clock", partial: "timers/clock", locals: { timer: self }
    end

    def fill_remaining_seconds
      self.remaining_seconds = duration
    end

    def generate_slugs
      self.slug ||= unique_slug(:slug)
      self.projection_slug ||= unique_slug(:projection_slug)
    end

    # Skips duration-shaped candidates, so /t/12m34s is never a real page, and
    # the slug already minted, so the projection link can never drive.
    def unique_slug(column)
      loop do
        candidate = SecureRandom.alphanumeric(SLUG_LENGTH, chars: SLUG_ALPHABET)
        next if candidate.match?(DURATION_SHAPED)
        next if candidate == slug

        break candidate unless self.class.exists?(column => candidate)
      end
    end
end
