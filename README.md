# Timerbot

A countdown timer you can share. Set a duration, send someone the link, and you
are both looking at the same clock — start it on your laptop and it starts on
their screen too.

Every timer is a server-side record with two independently generated slugs:

- `/t/:slug` — the dashboard. Whoever has this link can start, pause, reset and
  edit the duration.
- `/p/:slug` — the projection. Watch only, and built to be put on a screen a
  room is looking at. It never receives the control slug, over HTTP or over the
  websocket, so the dashboard link cannot be guessed from it.

State changes broadcast to every connected client over Turbo Streams, and each
client ticks locally against a server-provided deadline, so the model stays
authoritative without a request per second.

The entry page is an editable clock with no record behind it. Creating is folded
into the first action that needs one — Iniciar or Proyectar — so there is no step
whose only job is to create. `/5m`, `/45s` and `/5m30s` open that page preset, in
either case.

Interface copy is Spanish.

## Running it

```sh
bin/setup          # dependencies, database, git hooks
bin/rails server   # http://localhost:3000
```

## Checks

```sh
bin/rails test     # the suite, JavaScript included where node is available
bin/rubocop        # Ruby style (rails-omakase)
bin/ci             # everything CI runs: rubocop, three security audits, tests
```

`bin/ci` deliberately does not depend on node. The clock's JavaScript is covered
two other ways: `bin/rails test` shells out to `test/javascript/*_test.mjs`
wherever node exists, and `.githooks/pre-commit` runs those plus oxlint before a
commit lands. Where node is missing, that one test skips and says so — so a green
CI is not a claim that the JavaScript was checked. It is safe anyway: every rule
the JavaScript enforces is enforced again server-side.

## Housekeeping

`SweepTimersJob` deletes anything untouched for `Timer::RETENTION` (30 days),
daily. Transitions and duration edits move `updated_at`; rendering a page does
not, so a timer someone still uses keeps itself alive. It runs only where a Solid
Queue worker does — the container starts the web server alone, so the Dockerfile
sets `SOLID_QUEUE_IN_PUMA=true`.

## Stack

Rails 8, SQLite, Hotwire (Turbo + Stimulus) over importmap with no build step,
Solid Queue/Cache/Cable. Deployed as a container; see `Dockerfile`.
