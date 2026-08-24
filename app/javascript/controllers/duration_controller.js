import { Controller } from "@hotwired/stimulus";
import { csrfToken } from "csrf";

const MAX_SECONDS = 59;
const NUDGE = 10;
// Minutes between the hours the pill offers. A meeting starts on a quarter.
const STEP = 15;

// Makes an idle clock editable, on the entry page and the dashboard. A unit's
// text is swapped for an <input> built here, so the browser carries the focus,
// the caret and — through maxlength — the two-digit cap. Leaving the unit
// saves: the dashboard posts, the entry page fills its hidden field.
//
// The entry page's pill adds a second mode: an hour picked aims the clock at
// it, and the units count down to it. The hidden deadline field is that mode;
// the dashboard has neither.
export default class extends Controller {
  static targets = ["clock", "minutes", "seconds", "field", "error", "time", "deadline"];
  // Only the dashboard sets url. max is Timer::MAX_DURATION and the two hour
  // messages live beside it, so the model is the one definition of all three.
  static values = {
    url: String,
    max: Number,
    message: { type: String, default: "Ponle al menos un segundo." },
    passedMessage: String,
    beyondMessage: String,
  };

  // The hours on offer are the client's to work out: the zone is here, and
  // they go stale while the page sits. A deadline field arriving with a value —
  // a 422 re-render, a Turbo restore — is picked again off the fresh list.
  connect() {
    if (!this.hasTimeTarget) return;

    this.restock();

    if (!this.aimed) return;

    this.timeTarget.value = this.deadlineTarget.value;

    // An hour the server refused is not on the fresh list, so the select falls
    // back to blank. Its message is already up, and unaim would write over it.
    if (this.timeTarget.value) this.aim();
    else this.deadlineTarget.value = "";
  }

  disconnect() {
    this.clearTick();
  }

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

    const units = this.units;
    units.forEach((unit) => this.offer(unit));

    // The grey field is a state, not an entrance: .editable lands after the
    // first paint, so the CSS withholds its transition until the field has been
    // painted in it. Two frames, because in one the pair would land in the same
    // recalculation and the fade would run after all. These units rather than
    // the targets: a broadcast brings a fresh clock, unpainted again.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => units.forEach((unit) => unit.classList.add("painted"))),
    );
  }

  get units() {
    return [ this.minutesTarget, this.secondsTarget ];
  }

  // Here, not in the partial: the watch page renders the same markup and gets
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

  // The zero a countdown ended on, which the server sent us, as against one
  // someone typed: only the typed one is refused, because Iniciar starts a
  // spent clock over. The entry page has no clock, so its zero is always typed.
  get spent() {
    return this.hasClockTarget && this.clockTarget.dataset.timerRemainingMsValue === "0";
  }

  // Caret to the end, unselected: the ring already marks the unit. fresh is
  // what makes the value replaceable — the first digit takes its place, the
  // first backspace takes one character off.
  open(unit) {
    // Touching the clock makes it a duration again, at the digits it shows.
    if (this.aimed) this.unaim();

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
    this.showTotal(total);

    // Any real value clears the message. The clamp has no floor above zero,
    // so what was asked for says this as well as what was written.
    if (total > 0) this.errorTarget.hidden = true;
  }

  // The clock and the field under it, with the message left alone: the aimed
  // tick comes through here every second, and a refusal has to outlast it.
  showTotal(total) {
    const bounded = clamp(total, this.maxValue);

    this.show(this.minutesTarget, pad(Math.floor(bounded / 60)));
    this.show(this.secondsTarget, pad(bounded % 60));

    if (this.hasFieldTarget) this.fieldTarget.value = bounded;
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

  // An hour picked aims the clock at it. Each option carries its instant, and
  // the list only ever holds hours that can be aimed at, so there is nothing
  // to refuse here — refusal only has the stale pick left to catch.
  aim() {
    if (!this.timeTarget.value) {
      this.unaim();
      return;
    }

    this.deadlineTarget.value = this.timeTarget.value;
    this.errorTarget.hidden = true;
    this.clearTick();
    this.tick();
  }

  // The whole pill is one control, so its caption opens the list as well. A
  // click on the select itself is already the browser's to answer; asking
  // again would shut what it just opened.
  openList(event) {
    if (event.target === this.timeTarget) return;

    this.restock();
    this.timeTarget.showPicker?.();
  }

  // The marks inside the ceiling, rebuilt before the list opens so a page left
  // sitting never offers an hour that has gone by. The blank the server
  // rendered stays at the top; a pick still on the list survives the swap.
  restock() {
    const marks = upcoming(Date.now(), this.maxValue * 1000);
    const first = marks[0].toISOString();

    if (this.stocked === first) return;
    this.stocked = first;

    const picked = this.timeTarget.value;
    const [ blank ] = this.timeTarget.options;

    this.timeTarget.replaceChildren(blank, ...marks.map(hourOption));
    this.timeTarget.value = picked;
  }

  // Back to a plain duration, at the digits the units were showing.
  unaim() {
    this.clearTick();
    this.deadlineTarget.value = "";
    this.timeTarget.value = "";
    this.write(this.total());
  }

  // Aimed at the next whole second like the running clock's tick, not a poll.
  // Zero is left standing: what comes off it is Iniciar.
  tick() {
    const remaining = Math.max(0, this.aimedAt - Date.now());

    this.showTotal(Math.ceil(remaining / 1000));

    if (remaining <= 0) {
      this.timeout = null;
      return;
    }

    this.timeout = setTimeout(() => this.tick(), (remaining % 1000 || 1000) + 20);
  }

  clearTick() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  // The hidden field is the mode; the list beside it is picked off it.
  get aimed() {
    return this.hasDeadlineTarget && this.deadlineTarget.value !== "";
  }

  get aimedAt() {
    return Date.parse(this.deadlineTarget.value);
  }

  // Bound high to catch every form: the entry page's one, the dashboard's
  // Iniciar. Reiniciar is left alone: it is the way out of a clock at zero.
  submit(event) {
    if (!event.target.querySelector(".control.start")) return;

    this.check(event);
  }

  // Proyectar's click cancels the submit before it happens, so it asks here
  // instead. create#project runs after this on the same click, and stands down
  // when it was prevented.
  check(event) {
    const message = this.refusal();
    if (!message) return;

    event.preventDefault();
    this.announce(message);

    // Aimed, the hour is what wants correcting — and the cursor in a unit
    // would un-aim the clock.
    if (this.aimed) this.timeTarget.focus();
    else this.editor(this.minutesTarget)?.focus();
  }

  // What a start owes the screen, or nothing when it may go.
  refusal() {
    if (this.aimed) {
      const remaining = this.aimedAt - Date.now();

      if (remaining <= 0) return this.passedMessageValue;
      if (remaining > this.maxValue * 1000) return this.beyondMessageValue;
      return null;
    }

    if (this.total() > 0 || this.spent) return null;

    return this.messageValue;
  }

  // Saving happens on commit: leaving the unit is what means done.
  persist() {
    // A typed zero stays a draft: Iniciar refuses it, Reiniciar puts the clock
    // back.
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
  announce(message) {
    const error = this.errorTarget;

    // Written first: an alert announces what it holds as it appears.
    error.textContent = message;
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

// Every mark after now and no further off than span. The ceiling is a whole
// number of STEPs, so that is span/STEP of them: four quarters inside the hour,
// however the clock sits against them.
//
// Counted in milliseconds and never in wall minutes. No zone's offset is a
// fraction of a STEP, so the quarters are the same instants everywhere, and a
// walk that reads no local time cannot be carried off by an hour a zone repeats
// or skips. Walking in wall minutes left the pill empty for the quarter before
// a fall-back, and offered four hours already gone for the hour after it.
function upcoming(now, span) {
  const step = STEP * 60_000;
  const marks = [];

  // From the mark at or before now, one step on, so a mark landing on this very
  // minute is not offered.
  for (let at = Math.floor(now / step) * step + step; at - now <= span; at += step) {
    marks.push(new Date(at));
  }

  return marks;
}

function hourOption(at) {
  const option = document.createElement("option");

  option.value = at.toISOString();
  option.textContent = wallLabel(at);

  return option;
}

// "6:15 p.m.", the way the hour is said here.
function wallLabel(at) {
  const hours = at.getHours();

  return `${hours % 12 || 12}:${pad(at.getMinutes())} ${hours < 12 ? "a.m." : "p.m."}`;
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
