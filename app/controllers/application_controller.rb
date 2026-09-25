class ApplicationController < ActionController::Base
  allow_browser versions: :modern
  stale_when_importmap_changes

  # Around, and here: it wraps every action below, the rate limit's refusal
  # included, so nothing renders outside the language the browser asked for.
  around_action :switch_locale

  private
    def switch_locale(&)
      # Hygiene: the body's ETag already differs per language, but a cache
      # between here and the browser should know that a header decided it.
      response.set_header("Vary", "Accept-Language")
      I18n.with_locale(preferred_locale, &)
    end

    # The first language the browser lists that the app speaks. The header is
    # ordered by q, not by position; a region (en-US) counts as its language;
    # q=0 rules one out. Nothing spoken, or no header at all, is the default.
    def preferred_locale
      spoken = I18n.available_locales.map(&:to_s)
      ranges = request.headers["Accept-Language"].to_s.split(",").filter_map do |range|
        tag, weight = range.split(";q=", 2)
        language = tag.strip.downcase[/\A[a-z]+/]
        next unless language

        [ language, weight ? weight.to_f : 1.0 ]
      end

      ranges.reject { |_, weight| weight.zero? }
            .sort_by.with_index { |(_, weight), index| [ -weight, index ] }
            .map(&:first)
            .find { spoken.include?(it) } || I18n.default_locale
    end
end
