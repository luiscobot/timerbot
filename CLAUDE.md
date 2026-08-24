# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimerBot is a Ruby on Rails 8 countdown timer web application. Timers are
server-side records with shareable short slugs, so anyone with the link can join
and control the same timer in real time (not just tabs of one browser). The
`Timer` model (`app/models/timer.rb`) is the source of truth; state changes
broadcast to all connected clients via Turbo Streams over ActionCable, and each
client ticks locally against a server deadline
(`app/javascript/controllers/timer_controller.js`).

> Rebuilt from an earlier Astro + localStorage/BroadcastChannel version, which
> has been removed from this repository. The background-image feature that
> version had has not been rebuilt; there is no ActiveStorage in this app.

## Commands

- `bin/rails server` - Start the development server (http://localhost:3000)
- `bin/rails test` - Run the test suite, JavaScript included: a wrapper test
  shells out to every `test/javascript/*_test.mjs`, each of which runs the real
  module against a stub DOM. It skips where node is missing.
- `node test/javascript/duration_test.mjs` - one set of JavaScript checks on
  its own; `shortcut_test.mjs` and `timer_test.mjs` are the others
- `bin/rails console` - Interactive console
- `bin/rails db:prepare` - Create/migrate the database
- `bin/rubocop` - Ruby style (rails-omakase)
- `npx oxlint app/javascript test/javascript` - JavaScript style. The version is
  pinned in `.githooks/pre-commit`, which is what runs it for real

## Architecture

### Core Components

- **app/models/timer.rb** - Timer model; source of truth for timer state
- **app/jobs/sweep_timers_job.rb** - deletes timers nobody has touched in
  `Timer::RETENTION`, scheduled daily by `config/recurring.yml`
- **app/controllers/timers_controller.rb** - new, create, show and update (the
  duration). The controls are resources of their own, one file each:
  `timers/runs_controller.rb` (Iniciar and Reanudar create the run, Pausar
  destroys it) and `timers/resets_controller.rb` (Reiniciar)
- **app/controllers/watches_controller.rb** - the watch-only page, with
  `watches/completions_controller.rb` for a countdown that reached zero
- **app/javascript/controllers/timer_controller.js** - Stimulus controller that
  ticks locally against the server-provided deadline
- **app/javascript/controllers/duration_controller.js** - makes a clock editable
  while it is idle, on the entry page and the dashboard alike. It also owns the
  entry page's hour pill: it stocks the list with the hours that can still be
  reached, and a pick aims the clock at one and counts the units down to it
- **app/javascript/controllers/create_controller.js** - Proyectar on the entry
  page: creates, then points this tab at the dashboard and a new one at the
  watch page
- **app/javascript/controllers/shortcuts_controller.js** - on both the entry
  page and the dashboard: Space works whichever of Iniciar/Pausar/Reanudar is
  showing, R reiniciar, P proyectar, H the hour pill on the entry page. Each one
  clicks the button rather than
  posting on its own, so a key cannot drift from what its control does. T is
  bound by the appearance controller and F by the fullscreen one, so each
  follows its button wherever that partial goes. `app/javascript/shortcut.js`
  holds the one definition of when a bare key counts, and all three ask it:
  Space belongs to whatever control has focus, the letters do not.

### Routes (`config/routes.rb`)

Each timer has two independently generated slugs. The control slug drives it;
the watch slug only watches. The watch page never receives the control slug,
over HTTP or over the websocket.

Every control is a resource rather than a verb hung off the timer: the run is
the record Iniciar creates and Pausar destroys, and Reiniciar creates a reset.
A new control means a new resource, not another action on `timers`.

No GET creates. The entry page renders an editable clock with no record behind
it, and creating is folded into the first action that needs one — Iniciar or
Proyectar — so there is no step whose only job is to create. Both `show` actions
do write, but only to fold back a timer that ran out unwatched.

- `root "timers#new"` - the clock before there is anything to save
- `/5m30s`, `/10m`, `/45s` - the same, preset, in either case, so `/10M` is the
  page `/10m` is. Root only: everything after `/t` is a slug, so `/t/5m30s` is a
  404
- `POST /t` - create, and start too when Iniciar sent it. Takes `deadline`
  instead of `duration` when an hour was picked: an ISO 8601 instant, which
  creates the timer already running, so `start` means nothing there. A `422`
  refuses an hour that passed or one further off than `MAX_DURATION`, on the
  entry page like the `429` below. Answers a
  redirect, or JSON for Proyectar, which has two tabs to point. Rate limited per
  address to `TimersController::CREATION_LIMIT` a minute — the only action that
  mints a record, so the only one limited. Over the line it re-renders the entry
  page with a `429` and a message, keeping the clock as it was — sending them to a
  page of their own would throw that away
- `GET /t/:slug` - control dashboard anyone with the link can join (`timers#show`)
- `PATCH /t/:slug` - set the duration of an idle clock: `204`, `409` when it is
  not idle, or `422` when the value is no duration at all. The dashboard's own
  URL with a different verb: a duration is never a segment after the slug
- `POST /t/:slug/run` - Iniciar, and Reanudar from a pause: which one it is is
  the record's to know. `DELETE` the same URL is Pausar (`timers/runs`). Both
  answer `204`
- `POST /t/:slug/reset` - Reiniciar (`timers/resets`), also `204`
- `GET /w/:slug` - the watch page (`watches#show`)
- `POST /w/:slug/completion` - fires when a client's countdown hits zero
  (`watches/completions`)

Every slug is looked up through `Timer.controlled_by` or `Timer.watched_by`,
which name the only column each kind of link may answer to. The case of a
hand-typed link is forgiven by `normalizes` on the slug columns, so it holds
however a lookup is spelled.

### Sync

State syncs to all connected clients via Turbo Streams over ActionCable. Clients
tick locally between broadcasts, reconciling against the server deadline so the
model stays authoritative. The controls are plain `button_to` forms — Turbo
submits them and the `204` tells it not to navigate. The only fetches are
Proyectar's create, the duration PATCH and the completion POST.

### Conventions

- A running timer always has a `started_at`, because `remaining` subtracts
  elapsed time from it. A check constraint on the table refuses the combination,
  rather than the three transitions being the only thing keeping the pair
  together.
- `Timer.running_until` is the only place `started_at` is set in the past. A
  duration is whole seconds, so the ceiling it rounds up to is handed straight
  back by starting that fraction earlier. Without it the clock would reach zero
  a fraction after the hour it was aimed at.
- The hidden `deadline` field is the one sign the entry page is aimed at an
  hour, and touching the clock is what clears it. The pill beside it is a
  `<select>` the client stocks, because the hours are instants and the zone is
  the browser's. It holds only hours that can be aimed at, so an hour is never
  picked and then refused: the `422` and the client's own check are left with
  the pick that went stale while the page sat.
- `Timer#remaining` never writes. Expiry is folded back to idle by
  `Timer#complete`, which `controlled_by` and `watched_by` call at every
  lookup — a controller always holds a settled timer — and the transitions
  call themselves. It stops the clock on the zero it counted down to, not on
  the duration: a countdown ends at zero, and the watch page is left showing
  it. The two ways off that zero are Reiniciar, which puts the duration back,
  and Iniciar, which starts it over — `start` reads a spent `remaining_seconds`
  as "run the duration again", so nobody has to press Reiniciar first.
- Durations are clamped by `normalizes :duration`, so nothing downstream
  re-checks the range. Check constraints hold the floor (`duration >= 1`,
  `remaining_seconds >= 0`); the hour ceiling lives only in `MAX_DURATION`.
  The controllers read the parameter with `params.expect`, so the model only
  ever sees a scalar. Zero and junk fold to the default — deliberate at create,
  which only a hand-crafted POST can hand them — while `change_duration`
  refuses them first, so an edit answers 422 instead of quietly moving the
  clock.
- `Timer::DURATION_SEGMENT` is the one definition of what a duration URL looks
  like: the root shorthand is constrained on it and `unique_slug` refuses to
  mint a slug matching it, so `/t/12m34s` is never a real page. It spells its
  units as `[mM]` and `[sS]` rather than carrying an `/i`, which a route
  constraint drops.
- One name per concept, everywhere. The watch page is `watch` — the slug
  column, the path `/w`, the controller, the CSS class and the JSON key
  `create` hands Proyectar. The clock element is `.clock`, like
  `_clock.html.erb` and `#timer_clock` around it.
- `Timer::MAX_DURATION` is one hour. The entry page and the dashboard hand it
  to `duration_controller.js` as `data-duration-max-value`, so the model is the
  one definition of the ceiling.
- The clock partial is shared by the dashboard and the watch page, and one
  broadcast feeds both, so it can carry nothing control-only. Editing is layered
  on by an ancestor controller that only the dashboard renders.
- That editor takes the status off the clock's `duration` target, and all three
  of its `*TargetConnected` callbacks settle the offer, because a broadcast can
  connect the clock either side of the units inside it. No clock target at all is
  the entry page, where there is no record and the clock is always editable.
- Only a running clock is built out of animated cells. A paused clock keeps the
  plain text the server rendered; an idle unit's text is swapped for the
  `<input>` the duration controller builds, on the entry page and the dashboard
  alike, so the clock being edited is never the one made of `.numeral` spans.
- The countdown holds zero for a second before posting the completion. The
  server answers by broadcasting the settled clock, which replaces this one, so
  telling it the moment zero lands kills the roll into zero mid-flight and one
  snaps to it.
- The editable field's affordance is keyed off a class the duration controller
  adds after the first paint, so nothing may transition on the way in. The ring
  is declared unconditionally and never transitioned — an `outline` arriving
  with the class fades up from its initial `currentColor`, a white ring on
  load. The grey field is a state, not an entrance, so its hover transition
  waits on a second class, `painted`, which the controller adds two frames
  later: in one frame it lands in the same recalculation and the fade runs
  anyway.
- The page's entrance is written on `.dashboard-page`, `.editable-clock`,
  `.timer-container` and the corner buttons, none of which a broadcast replaces.
  On `#timer_clock` or `#timer_controls` it would play again on every start,
  pause and reset.
- Everything the pages load is same-origin, and the CSP in
  `config/initializers/content_security_policy.rb` says so. Nothing may be added
  from a CDN. The two inline pieces carry a nonce instead: the layout's theme
  script, which has to run before the first paint, and the `<style>` Turbo
  injects for its progress bar, which reads the nonce off `csp_meta_tag`.
- Proyectar, the theme toggle and the fullscreen button are one object in CSS,
  under `--- Corner buttons ---`. Each section below it holds only what makes
  that button different: its edge of the page, and the fullscreen one's opacity.
- The running clock's cells are `aria-hidden`, so `buildUnit` gives the unit
  `role="timer"` and an `aria-label`. The role is set there and not in the
  partial because that same span is what the duration controller swaps its
  `<input>` into, which carries its own `aria-label` instead.
- The tab icon is one SVG, rendered by `favicons#show` instead of sitting in
  `public/`, because its ring is `currentColor` and the color the root carries
  is the environment's: Iniciar's lime wherever `Rails.env.local?` holds, the
  accent zinc where it is deployed, so a tab says which timer it is on. One
  ring for both schemes, since each reads on either background; the dot is the
  ink and still swaps. The response carries no policy — its `<style>` is those
  colors and can hold no nonce, being cached — and the home-screen PNG has no
  variant, because nobody installs a dev server.

### Housekeeping

Nothing deletes a timer on its own except `SweepTimersJob`, which clears anything
whose `updated_at` is older than `Timer::RETENTION` (30 days). Transitions and
duration edits move that timestamp; rendering a page does not, so a timer someone
still uses keeps itself alive. Rows still marked `running` are swept too — expiry
is folded in lazily, so one started with nobody watching stays running forever.

The schedule only runs where a Solid Queue worker does. The container starts the
web server alone, so the Dockerfile sets `SOLID_QUEUE_IN_PUMA=true` for the Puma
plugin in `config/puma.rb` to pick it up.

### What CI covers

`config/ci.rb` is a Ruby gate: rubocop, three security audits, and `bin/rails
test`. Node is deliberately not a CI dependency, and the clock's JavaScript is
checked two other ways — `bin/rails test` runs the `test/javascript/*_test.mjs`
harnesses wherever node exists, and `.githooks/pre-commit` runs them and oxlint
before a commit can land. Where node is missing that one test skips, saying so.

Reading a green CI as "everything verified" is therefore wrong, and safe anyway:
every rule the JavaScript enforces is enforced again server-side — the hour
ceiling by `normalizes`, the zero by `change_duration` on an edit and by the
fold at create, the idle-only rule by the `409` in `timers#update` — and that
half is fully covered.

### Development Configuration

- Ruby 4.0.6 (see `.ruby-version`)
- The test environment uses `:memory_store`, not `:null_store`: the rate limit
  counts in the cache. `test_helper` clears it between tests, because the counter
  is keyed by address and every test comes from the same one
- JavaScript via importmap (no Node build step); `oxlint` for JS
- SQLite for development/test
- Spanish language labels ("minutos", "segundos")
