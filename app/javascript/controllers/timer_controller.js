import { Controller } from "@hotwired/stimulus";
import { csrfToken } from "csrf";

// Motion's spring, sampled off its AnimateNumber example: never overshoots,
// which no bezier holds and an underdamped spring would bounce. Retimed from
// the 759ms it was sampled at: linear() is normalised, so the shape survives
// the change. At 759 the numeral was still 9px off centre half a second in,
// and on a one-second tick the seconds place never came to rest.
const DURATION = 300;

// Under reduce the numerals cross without travelling, so the swap still reads
// as one digit replacing another.
const REDUCED_DURATION = 150;
const SPRING =
  "linear(0.0085, 0.0464, 0.0957, 0.1531, 0.2175, 0.2828, 0.3464, 0.4126, 0.4668, 0.5253, " +
  "0.5743, 0.6224, 0.6645, 0.7034, 0.7391, 0.7708, 0.7983, 0.8236, 0.8448, 0.8657, 0.8828, " +
  "0.8979, 0.9116, 0.9235, 0.9338, 0.9432, 0.9505, 0.9573, 0.9634, 0.9685, 0.9729, 0.9768, " +
  "0.9802, 0.9830, 0.9856, 0.9877, 0.9896, 0.9912, 0.9926, 0.9938, 1.0000)";

// Zero is a second of the countdown like any other, so it stands one before
// the server hears about it. Told the instant it lands, the reset broadcast
// replaces the clock while zero is still rolling in, and one turns straight
// back into the duration.
const ZERO_HOLD = 1000;

// Drives the countdown. The server is the source of truth: every state change
// broadcasts a fresh clock, which reconnects this controller. Between
// broadcasts we tick locally against the deadline.
export default class extends Controller {
  static targets = ["minutes", "seconds"];
  static values = { status: String, remainingMs: Number, completeUrl: String };

  connect() {
    // Only a running clock is built from cells: idle and paused ones get
    // overwritten by the duration controller.
    if (this.statusValue !== "running") return;

    this.minutes = buildUnit(this.minutesTarget);
    this.seconds = buildUnit(this.secondsTarget);
    this.render(this.remainingMsValue);

    this.deadline = Date.now() + this.remainingMsValue;
    this.schedule();
  }

  disconnect() {
    this.clearTick();
  }

  // Aimed at the next whole second of the countdown, not a fixed interval: the
  // roll belongs on the boundary, and a 200ms poll landed it up to 200ms late.
  // A shade past, so the ceiling below has already come down.
  schedule() {
    const remaining = Math.max(0, this.deadline - Date.now());

    this.timeout = setTimeout(() => this.tick(), (remaining % 1000 || 1000) + 20);
  }

  tick() {
    const remaining = Math.max(0, this.deadline - Date.now());
    this.render(remaining);

    if (remaining <= 0) {
      this.holdZero();
      return;
    }

    this.schedule();
  }

  // The countdown ends on a zero anyone can read. Only once it has stood there
  // is the server told, which resets the timer and replaces this clock. Kept
  // on the same handle as the tick, so disconnecting cancels it.
  holdZero() {
    this.timeout = setTimeout(() => {
      this.timeout = null;
      this.notifyComplete();
    }, ZERO_HOLD);
  }

  render(remainingMs) {
    const total = Math.ceil(remainingMs / 1000);

    this.minutes.show(Math.floor(total / 60));
    this.seconds.show(total % 60);
  }

  clearTick() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  // The server broadcasts the reset to everyone. Idempotent there, so racing
  // clients are fine; one that fails to send leaves it to the next.
  notifyComplete() {
    fetch(this.completeUrlValue, {
      method: "POST",
      headers: { "X-CSRF-Token": csrfToken() },
    }).catch(() => {});
  }
}

// Replaces the unit's text with one animated cell per place. Built here, not
// in the partial: broadcasts re-render the partial with no request behind them.
function buildUnit(unit) {
  const text = unit.textContent.trim();
  unit.replaceChildren();

  const places = [...text].map((character) => {
    const cell = document.createElement("span");
    cell.className = "digit";
    cell.setAttribute("aria-hidden", "true");
    unit.append(cell);
    return digitCell(cell, Number(character));
  });

  // The cells are aria-hidden, so the unit carries the value, and a bare span
  // (role="generic") is not allowed a name. Not in the partial: the same span
  // is what the duration controller makes editable.
  unit.setAttribute("role", "timer");

  // The value the unit last showed, so a tick that changes nothing writes
  // nothing.
  let shown = null;

  return {
    show(value) {
      const digits = String(value).padStart(places.length, "0");
      if (digits === shown) return;

      shown = digits;
      unit.setAttribute("aria-label", digits);
      places.forEach((place, i) => place.set(Number(digits[i])));
    },
  };
}

// One place of the number. Only digits that changed move.
function digitCell(cell, initial) {
  let showing = numeral(initial);
  cell.append(showing);

  return {
    set(digit) {
      if (Number(showing.textContent) === digit) return;

      const leaving = showing;
      const entering = numeral(digit);
      cell.append(entering);
      showing = entering;

      // Both travel down, so the change reads as counting down. Percentages,
      // not pixels: 100% is one cell whatever --clock-field resolves to.
      animate(leaving, { transform: ["translateY(0)", "translateY(100%)"], opacity: [1, 0] })
        .finished.then(() => leaving.remove())
        .catch(() => leaving.remove());

      animate(entering, { transform: ["translateY(-100%)", "translateY(0)"], opacity: [0, 1] });
    },
  };
}

function numeral(digit) {
  const span = document.createElement("span");
  span.className = "numeral";
  span.textContent = digit;
  return span;
}

function animate(element, keyframes) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return element.animate(
    // Only the travel goes: the crossfade is what says the digit changed.
    reduced ? { opacity: keyframes.opacity } : keyframes,
    {
      duration: reduced ? REDUCED_DURATION : DURATION,
      easing: reduced ? "ease-out" : SPRING,
      fill: "forwards",
    },
  );
}
