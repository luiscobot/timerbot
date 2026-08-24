import { Controller } from "@hotwired/stimulus";
import { csrfToken } from "csrf";

const MAX_SECONDS = 59;
const NUDGE = 10;

// Makes an idle clock editable, on the entry page and the dashboard. A unit's
// text is swapped for an <input> built here, so the browser carries the focus,
// the caret and — through maxlength — the two-digit cap. Leaving the unit
// saves: the dashboard posts, the entry page fills its hidden field.
export default class extends Controller {
  static targets = ["clock", "minutes", "seconds", "field", "error"];
  // Only the dashboard sets url. max is Timer::MAX_DURATION, so the model is
  // the one definition of the ceiling.
  static values = {
    url: String,
    max: Number,
    message: { type: String, default: "Ponle al menos un segundo." },
  };

  // Every broadcast replaces the clock, and can land it either side of the
  // units inside it, so all three connections settle the offer.
  clockTargetConnected() {
    this.offerUnits();
  }

  minutesTargetConnected() {
    this.offerUnits();
  }

  secondsTargetConnected() {
    this.offerUnits();
  }

  // Waits for the pair: they arrive in one partial.
  offerUnits() {
    if (!this.hasMinutesTarget || !this.hasSecondsTarget) return;

    this.units.forEach((unit) => this.offer(unit));
  }

  get units() {
    return [ this.minutesTarget, this.secondsTarget ];
  }

  // Here, not in the partial: the projection renders the same markup and gets
  // none of this. An editor already in place is left alone — it may hold an
  // edit.
  offer(unit) {
    const idle = this.idle;
    unit.classList.toggle("editable", idle);

    if (idle) {
      if (!this.editor(unit)) unit.replaceChildren(this.buildEditor(unit));
    } else if (this.editor(unit)) {
      // A clock connecting after its units already made them editable.
      unit.textContent = this.editor(unit).value;
    }
  }

  editor(unit) {
    return unit.querySelector("input");
  }

  buildEditor(unit) {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 2;
    input.value = unit.textContent.trim();
    // On a phone: digits, and an Enter key that says Done.
    input.inputMode = "numeric";
    input.enterKeyHint = "done";
    // The caption under the unit: an input has no content to fall back on.
    input.setAttribute("aria-label", unit.parentElement.querySelector(".label")?.textContent ?? "");

    input.addEventListener("focus", () => this.open(unit));
    input.addEventListener("blur", (event) => this.commit(unit, event.relatedTarget));
    input.addEventListener("keydown", (event) => this.key(unit, event));
    input.addEventListener("beforeinput", (event) => this.beforeInput(unit, event));

    return input;
  }

  // No clock target is the entry page: no record, always editable.
  get idle() {
    return !this.hasClockTarget || this.clockTarget.dataset.timerStatusValue === "idle";
  }

  // Caret to the end, unselected: the ring already marks the unit. fresh is
  // what makes the value replaceable — the first digit takes its place, the
  // first backspace takes one character off.
  open(unit) {
    const editor = this.editor(unit);

    // previous, fresh and restoring are one slot serving both units: only one
    // editor holds focus, and commit reads them before the next open.
    this.previous = editor.value;
    this.fresh = true;
    unit.classList.add("editing");

    editor.setSelectionRange(editor.value.length, editor.value.length);
  }

  key(unit, event) {
    const editor = this.editor(unit);

    if (event.key === "Enter") {
      // Commit only: not also the entry form's submit.
      event.preventDefault();
      editor.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      this.restoring = true;
      editor.blur();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      this.step(unit, (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? NUDGE : 1));
    } else if (this.fresh && (event.key === "Backspace" || event.key === "Delete")) {
      // One character off the end, wherever the caret sits: the value is
      // still whole.
      event.preventDefault();
      this.place(editor, editor.value.slice(0, -1));
      this.fresh = false;
    }
  }

  // Arrows move the whole clock: seconds carry into minutes and borrow back.
  step(unit, by) {
    this.write(this.total() + by * (unit === this.minutesTarget ? 60 : 1));
    // An arrow writes a whole value; what follows replaces it again.
    this.fresh = true;
  }

  write(total) {
    const bounded = clamp(total, this.maxValue);

    this.show(this.minutesTarget, pad(Math.floor(bounded / 60)));
    this.show(this.secondsTarget, pad(bounded % 60));

    if (this.hasFieldTarget) this.fieldTarget.value = bounded;
    // Any real value clears the message.
    if (bounded > 0) this.errorTarget.hidden = true;
  }

  // Refuses non-digits. beforeinput covers typing, pasting, dropping and IME;
  // the length is maxlength's to hold.
  beforeInput(unit, event) {
    if (event.data === null || event.data === undefined) {
      // A deletion with no keystroke, like Cut from a phone's menu. Left to
      // the browser; what comes next appends.
      this.fresh = false;
      return;
    }

    if (/\D/.test(event.data)) {
      event.preventDefault();
      return;
    }

    // The first digit replaces the value. Sliced: a paste arrives whole, and
    // maxlength only refuses what no longer fits.
    if (this.fresh) {
      event.preventDefault();
      this.place(this.editor(unit), event.data.slice(0, 2));
      this.fresh = false;
    }
  }

  commit(unit, leavingFor) {
    const editor = this.editor(unit);

    unit.classList.remove("editing");
    this.fresh = false;

    const text = this.restoring ? this.previous : editor.value;
    this.restoring = false;

    // Clamp the unit first, so a typed 75 stops at 59 instead of carrying,
    // then the whole clock, because 60 minutes plus seconds is over the hour.
    const max = unit === this.minutesTarget ? Math.floor(this.maxValue / 60) : MAX_SECONDS;
    editor.value = pad(clamp(parseDigits(text, this.previous), max));

    this.write(this.total());

    // Moving between the units is one edit: posting on the way out of the
    // first would broadcast a clock over the editor being focused. The editor
    // left last sends both.
    if (this.units.some((other) => this.editor(other) === leavingFor)) return;

    if (this.hasUrlValue) this.persist();
  }

  // Bound high to catch every form: the entry page's one, the dashboard's
  // Iniciar. Reiniciar is left alone: it is the way out of a clock at zero.
  submit(event) {
    if (!event.target.querySelector(".control.start")) return;
    if (this.total() > 0) return;

    event.preventDefault();
    this.announce();
    this.editor(this.minutesTarget)?.focus();
  }

  // Saving happens on commit: leaving the unit is what means done.
  persist() {
    // A zero stays a draft: Iniciar refuses it, Reiniciar puts the clock back.
    if (this.total() === 0) return;

    // On failure the screen stays a draft until the server broadcasts.
    fetch(this.urlValue, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken() },
      body: JSON.stringify({ duration: this.total() }),
    }).catch(() => {});
  }

  // Hidden and shown again, so a second click on a zero clock says it again:
  // the animation only runs when the element enters the flow.
  announce() {
    const error = this.errorTarget;

    // Written first: an alert announces what it holds as it appears.
    error.textContent = this.messageValue;
    error.hidden = true;
    // The read makes the removal take effect; without it the writes collapse.
    // oxlint-disable-next-line no-unused-expressions
    error.offsetHeight;
    error.hidden = false;
  }

  total() {
    return this.digits(this.minutesTarget) * 60 + this.digits(this.secondsTarget);
  }

  // Off the editor while there is one; off the text on a paused clock, which
  // the submit guard reads under Reanudar.
  digits(unit) {
    return parseDigits(this.editor(unit)?.value ?? unit.textContent, "0");
  }

  show(unit, text) {
    const editor = this.editor(unit);

    if (editor) {
      editor.value = text;
    } else {
      unit.textContent = text;
    }
  }

  // Caret parked after the value, where the next digit lands.
  place(editor, value) {
    editor.value = value;
    editor.setSelectionRange(value.length, value.length);
  }
}

function parseDigits(text, fallback) {
  const value = parseInt(String(text).replace(/\D/g, ""), 10);
  return Number.isFinite(value) ? value : parseInt(fallback, 10) || 0;
}

function clamp(value, max) {
  return Math.min(Math.max(value, 0), max);
}

function pad(value) {
  return String(value).padStart(2, "0");
}
