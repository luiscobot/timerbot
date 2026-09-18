Rails.application.routes.draw do
  # www is a way of spelling this app's host, not a second name for it. First,
  # so it answers before any real route can, and straight to https, which
  # force_ssl would bounce it to anyway.
  constraints host: /\Awww\./i do
    match "(*path)", via: :all, to: redirect { |_, request|
      "https://#{request.host.sub(/\Awww\./i, "")}#{request.fullpath}"
    }
  end

  root "timers#new"

  # Control. Everything after /t is a slug, so /t/5m30s is a 404, not a
  # duration. No GET creates. Setting the duration is updating the timer: the
  # dashboard's URL with another verb, never a segment after the slug.
  resources :timers, path: "t", param: :slug, only: %i[create show update] do
    scope module: :timers do
      # Nouns: Iniciar and Reanudar create the run, Pausar destroys it,
      # Reiniciar creates a reset.
      resource :run, only: %i[create destroy]
      resource :reset, only: :create
    end
  end

  # Watch only, and its slug is minted independently of the control one. The
  # completion lives here because both pages share the broadcast clock.
  resources :watches, path: "w", param: :slug, only: :show do
    scope module: :watches do
      resource :completion, only: :create
    end
  end

  # Rendered, not a file in public/, because the ring is one color and which
  # one depends on the environment.
  get "favicon.svg" => "favicons#show"

  get "up" => "rails/health#show", as: :rails_health_check

  # /5m, /90s, /5m30s. Last and constrained, so it cannot shadow a real route.
  get ":duration", to: "timers#new", constraints: { duration: Timer::DURATION_SEGMENT }
end
