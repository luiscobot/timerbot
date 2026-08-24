// Runs the real duration_controller against a stub DOM, imported from a data:
// URL so the file under test is the one that ships. That URL cannot resolve the
// importmap's bare names, so each import is swapped for something inline.
//
// Run through the suite with bin/rails test, or on its own:
//   node test/javascript/duration_test.mjs
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../app/javascript/controllers/duration_controller.js", import.meta.url),
  "utf8",
)
  .replace(/import \{ Controller \}.*\n/, "class Controller {}\n")
  .replace(/import \{ csrfToken \}.*\n/, "const csrfToken = () => \"stub\";\n");

// What the controller builds its editors from. Modelled with a value and a
// caret, because the browser behaviour leaned on — maxlength refusing what no
// longer fits, backspace taking the character before the caret — reads both.
globalThis.document = {
  createElement: () => {
    const listeners = {};

    return {
      type: "",
      value: "",
      maxLength: -1,
      inputMode: "",
      enterKeyHint: "",
      attributes: {},
      focused: 0,
      caret: 0,
      listeners,
      addEventListener(name, handler) { listeners[name] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      setSelectionRange(start) { this.caret = start; },
      focus() { this.focused++; listeners.focus?.(); },
      blur(relatedTarget = null) { listeners.blur?.({ relatedTarget }); },
    };
  },
};

// The controller waits two frames before letting the field transition. Held
// here so a test can run them by hand.
let frames = [];
globalThis.requestAnimationFrame = (fn) => frames.push(fn);

const flushFrames = () => {
  while (frames.length) {
    const due = frames;
    frames = [];
    due.forEach((fn) => fn());
  }
};

const sent = [];
globalThis.fetch = (url, options) => {
  sent.push({ url, body: JSON.parse(options.body) });
  return Promise.resolve();
};

// The clock under the test's control, like timer_test.mjs. Only now() is
// pinned: the aimed mode builds real Dates off it.
let now = 0;
Date.now = () => now;

// The tick the controller scheduled, and the delay it asked for: it aims each
// one at the next whole second rather than polling.
let tick = null;
let delay = null;
let cleared = 0;
globalThis.setTimeout = (fn, ms) => { tick = fn; delay = ms; return 1; };
globalThis.clearTimeout = () => { cleared += 1; };

// Wall time, so a picked hour reads the same wherever the machine sits.
const at = (text) => { now = Date.parse(text); };
const instant = (text) => new Date(Date.parse(text)).toISOString();

// Runs the tick that was due, leaving none behind unless it scheduled another.
function advance(ms) {
  now += ms;

  const due = tick;
  tick = null;
  due();
}

const { default: Duration } = await import(
  `data:text/javascript,${encodeURIComponent(source)}`
);

// A unit holds either its text or the editor swapped in for it, the way a real
// span holds either a text node or the input: setting textContent takes the
// child down.
const unit = (text, label) => {
  const classes = new Set();
  let child = null;

  return {
    get textContent() { return child ? "" : text; },
    set textContent(value) { text = value; child = null; },
    replaceChildren(node) { child = node; },
    querySelector: () => child,
    parentElement: { querySelector: () => ({ textContent: label }) },
    editable: () => classes.has("editable"),
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    },
  };
};

const editorOf = (target) => target.querySelector();

// The hidden field beside the pill, which holds the mode.
const field = () => ({
  value: "",
  focused: 0,
  focus() { this.focused++; },
  blur() {},
});

// The pill's list. value only takes what is on it, the way a real select falls
// back to its blank when told an option it does not have.
const list = () => {
  let options = [ { value: "", textContent: "--:--" } ];
  let value = "";

  return {
    focused: 0,
    opened: 0,
    focus() { this.focused++; },
    blur() {},
    showPicker() { this.opened++; },
    get options() { return options; },
    replaceChildren(...next) { options = next; },
    get value() { return value; },
    set value(next) { value = options.some((o) => o.value === next) ? next : ""; },
    get labels() { return options.map((o) => o.textContent); },
  };
};

// A dashboard clock, already offered to the controller the way a broadcast
// would deliver it.
function build(min, sec, status = "idle") {
  const controller = new Duration();

  controller.minutesTarget = unit(min, "minutos");
  controller.secondsTarget = unit(sec, "segundos");
  controller.hasUrlValue = true;
  controller.hasFieldTarget = false;
  controller.urlValue = "/t/abc";
  // The hour, as the page hands Timer::MAX_DURATION over.
  controller.maxValue = 3600;
  // The clock the units came in, which is what carries the status.
  controller.hasClockTarget = true;
  controller.clockTarget = { dataset: { timerStatusValue: status } };
  controller.hasMinutesTarget = true;
  controller.hasSecondsTarget = true;
  // Records every write, so the hide-and-show that restarts the CSS arrival is
  // observable.
  const writes = [];
  let hidden = true;

  // Built for entry() to switch on: the dashboard has no pill and no field.
  controller.hasTimeTarget = false;
  controller.hasDeadlineTarget = false;
  controller.timeTarget = list();
  controller.deadlineTarget = field();

  // Whatever the last clock left scheduled is not this one's.
  tick = null;
  cleared = 0;

  controller.messageValue = "al menos un segundo";
  controller.passedMessageValue = "esa hora ya pasó";
  controller.beyondMessageValue = "máximo una hora";
  controller.errorTarget = {
    writes,
    offsetHeight: 0,
    textContent: "",
    get hidden() { return hidden; },
    set hidden(value) { hidden = value; writes.push(value); },
  };

  controller.clockTargetConnected();
  controller.minutesTargetConnected();
  controller.secondsTargetConnected();
  return controller;
}

// The entry page has no record: the value goes to a hidden field, not the wire.
// No clock either, which is how the controller knows it is always editable.
function entry(min, sec) {
  const controller = build(min, sec);

  controller.hasClockTarget = false;
  controller.hasUrlValue = false;
  controller.hasFieldTarget = true;
  controller.fieldTarget = { value: "" };
  controller.hasTimeTarget = true;
  controller.hasDeadlineTarget = true;
  return controller;
}

const read = (target) => editorOf(target)?.value ?? target.textContent;
const clock = (c) => `${read(c.minutesTarget)}:${read(c.secondsTarget)}`;

const open = (c, target) => editorOf(target).focus();

function press(c, target, key, shiftKey = false) {
  editorOf(target).listeners.keydown({ key, shiftKey, preventDefault() {} });
}

// Types the way a browser would: the controller gets its say first; what it
// does not prevent lands at the caret, unless maxlength says the field is
// full.
function type(c, target, data) {
  const editor = editorOf(target);
  let prevented = false;

  editor.listeners.beforeinput({ data, preventDefault() { prevented = true; } });
  if (prevented) return;

  if (editor.value.length + data.length <= editor.maxLength) {
    editor.value += data;
    editor.caret = editor.value.length;
  }
}

// Backspace the way a browser sends it: keydown first, and what it does not
// prevent takes the character before the caret, which at the start is nothing.
function del(c, target) {
  const editor = editorOf(target);
  let prevented = false;

  editor.listeners.keydown({ key: "Backspace", preventDefault() { prevented = true; } });
  if (prevented) return;

  if (editor.caret > 0) {
    editor.value = editor.value.slice(0, -1);
    editor.caret = editor.value.length;
  }
}

const commit = (c, target, relatedTarget = null) => editorOf(target).blur(relatedTarget);

// Returns whether the submit was refused. `starts` says whether the form holds
// the start button, which is the only one that counts.
function submit(controller, starts = true) {
  let prevented = false;

  controller.submit({
    target: { querySelector: (selector) => (starts && selector === ".control.start" ? {} : null) },
    preventDefault() { prevented = true; },
  });
  return prevented;
}

// Proyectar's click, which asks the same question without a form behind it.
function project(controller) {
  let prevented = false;

  controller.check({ preventDefault() { prevented = true; } });
  return prevented;
}

// Picks an hour the way the pill does: opening the list restocks it, then the
// chosen option's instant lands in the select and change fires.
function aim(controller, stamp) {
  controller.restock();
  controller.timeTarget.value = instant(stamp);
  controller.aim();
}

let failures = 0;

function check(label, actual, expected) {
  const ok = actual === expected;

  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual}${ok ? "" : ` (want ${expected})`}`);
}

// --- offering the units -----------------------------------------------------
let c = build("05", "00");
check("idle offers the unit", c.minutesTarget.editable(), true);
check("and swaps its text for an editor", editorOf(c.minutesTarget)?.value, "05");
check("whose cap is the browser's to hold", editorOf(c.minutesTarget)?.maxLength, 2);
check("and asks a phone for digits", editorOf(c.minutesTarget)?.inputMode, "numeric");
check("and labels its Enter key", editorOf(c.minutesTarget)?.enterKeyHint, "done");
check("and names it for a screen reader", editorOf(c.minutesTarget)?.attributes["aria-label"], "minutos");

// The grey field must be there on the first paint, not fade in: the CSS keys
// its transition off a class that only arrives once the field has been painted.
frames = [];
c = build("05", "00");
check("the offer alone does not license the fade", c.minutesTarget.classList.contains("painted"), false);
flushFrames();
check("two frames later it does", c.minutesTarget.classList.contains("painted"), true);

c = build("05", "00", "running");
check("running does not", c.minutesTarget.editable(), false);
check("nor puts an editor in", editorOf(c.minutesTarget), null);

c = build("05", "00", "paused");
check("paused does not either", editorOf(c.minutesTarget), null);

// Stimulus connects a broadcast's elements one at a time. The clock landing
// last carries the status, so the offer is settled again when it arrives.
c = new Duration();
c.minutesTarget = unit("05", "minutos");
c.secondsTarget = unit("00", "segundos");
c.hasMinutesTarget = true;
c.hasSecondsTarget = true;
c.hasClockTarget = false;
c.minutesTargetConnected();
c.secondsTargetConnected();
c.hasClockTarget = true;
c.clockTarget = { dataset: { timerStatusValue: "running" } };
c.clockTargetConnected();
check("a clock landing after its units withdraws the offer", c.minutesTarget.editable(), false);
check("and folds the editor back into text", c.minutesTarget.textContent, "05");
check("in both units", c.secondsTarget.textContent, "00");

// A second connection must not rebuild the editor over an edit in progress.
c = build("05", "00");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "1");
c.clockTargetConnected();
check("a repeated offer leaves the edit alone", editorOf(c.minutesTarget).value, "1");

// --- arrows -----------------------------------------------------------------
c = build("05", "30");
press(c, c.minutesTarget, "ArrowUp");
check("05 up", read(c.minutesTarget), "06");
press(c, c.minutesTarget, "ArrowDown");
press(c, c.minutesTarget, "ArrowDown");
check("06 down twice", read(c.minutesTarget), "04");

c = build("59", "59");
press(c, c.secondsTarget, "ArrowUp");
check("the last second reaches the hour", clock(c), "60:00");
press(c, c.secondsTarget, "ArrowUp");
check("and stops there", clock(c), "60:00");
press(c, c.minutesTarget, "ArrowUp");
check("the minutes stop there too", clock(c), "60:00");

c = build("05", "00");
press(c, c.minutesTarget, "a");
check("other keys inert", read(c.minutesTarget), "05");

// --- shift nudge ------------------------------------------------------------
c = build("05", "30");
press(c, c.minutesTarget, "ArrowUp", true);
check("shift up is a decade", read(c.minutesTarget), "15");
press(c, c.secondsTarget, "ArrowDown", true);
check("shift down is a decade", read(c.secondsTarget), "20");

c = build("55", "55");
press(c, c.minutesTarget, "ArrowUp", true);
check("nudge clamps at the hour", clock(c), "60:00");

// --- carry ------------------------------------------------------------------
c = build("05", "59");
press(c, c.secondsTarget, "ArrowUp");
check("59 carries into the minute", clock(c), "06:00");
press(c, c.secondsTarget, "ArrowDown");
check("and borrows back", clock(c), "05:59");

c = build("05", "00");
press(c, c.secondsTarget, "ArrowDown");
check("zero seconds borrow a minute", clock(c), "04:59");

c = build("05", "55");
press(c, c.secondsTarget, "ArrowUp", true);
check("the nudge carries too", clock(c), "06:05");

c = build("00", "00");
press(c, c.secondsTarget, "ArrowDown");
check("the floor holds", clock(c), "00:00");

// --- typing against the hour ------------------------------------------------
c = build("05", "00");
editorOf(c.secondsTarget).value = "75";
commit(c, c.secondsTarget);
check("a typed 75 does not carry", clock(c), "05:59");

c = build("05", "30");
editorOf(c.minutesTarget).value = "99";
commit(c, c.minutesTarget);
check("99 typed in comes back at the hour", clock(c), "60:00");

c = build("00", "30");
editorOf(c.minutesTarget).value = "59";
commit(c, c.minutesTarget);
check("just under the hour is left alone", clock(c), "59:30");

// --- saving -----------------------------------------------------------------
sent.length = 0;
c = build("05", "00");
editorOf(c.minutesTarget).value = "07";
commit(c, c.minutesTarget);
check("commit posts once", sent.length, 1);
check("to the timer's url", sent[0]?.url, "/t/abc");
check("with the total in seconds", sent[0]?.body.duration, 420);

sent.length = 0;
c = build("05", "00");
press(c, c.secondsTarget, "ArrowUp");
check("an arrow alone posts nothing", sent.length, 0);
check("but the display moved", clock(c), "05:01");
commit(c, c.secondsTarget);
check("leaving posts the stepped value", sent[0]?.body.duration, 301);

// --- moving between the units -----------------------------------------------
// Posting here would broadcast a new clock, replacing the editor the click is on
// its way to, so it would never open.
sent.length = 0;
c = build("05", "00");
editorOf(c.minutesTarget).value = "07";
commit(c, c.minutesTarget, editorOf(c.secondsTarget));
check("leaving for the other unit posts nothing", sent.length, 0);
check("but the value is kept", clock(c), "07:00");

editorOf(c.secondsTarget).value = "30";
commit(c, c.secondsTarget, null);
check("leaving the clock posts once", sent.length, 1);
check("with both units in it", sent[0]?.body.duration, 450);

sent.length = 0;
c = build("05", "00");
editorOf(c.minutesTarget).value = "07";
commit(c, c.minutesTarget, { name: "somewhere else" });
check("leaving for anything else posts", sent.length, 1);

// --- enter and escape ---------------------------------------------------------
sent.length = 0;
c = build("05", "30");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "7");
press(c, c.minutesTarget, "Enter");
check("enter commits", clock(c), "07:30");
check("and posts", sent[0]?.body.duration, 450);

c = build("05", "30");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "9");
press(c, c.minutesTarget, "Escape");
check("escape restores what was there", clock(c), "05:30");

// --- refusing zero ----------------------------------------------------------
// The refusal belongs where the value is used, so a blur alone says nothing.
c = build("05", "30");
editorOf(c.minutesTarget).value = "00";
editorOf(c.secondsTarget).value = "00";
commit(c, c.minutesTarget, editorOf(c.secondsTarget));
check("a blur between the units says nothing", c.errorTarget.hidden, true);
check("and leaves the zero where it is", clock(c), "00:00");

// A zero is a draft on the dashboard too: kept until Iniciar turns it away or
// Reiniciar puts it back.
sent.length = 0;
c = build("05", "00");
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
check("zero posts nothing", sent.length, 0);
check("and the clock keeps it", clock(c), "00:00");
check("and nothing is said", c.errorTarget.hidden, true);

check("starting is refused", submit(c), true);
check("and that is when it is said", c.errorTarget.hidden, false);
check("and the minutes get the cursor", editorOf(c.minutesTarget).focused > 0, true);

// The slot is shared with the server, so a refusal writes its own text first.
c = build("05", "00");
c.errorTarget.textContent = "Espera un momento antes de crear otro temporizador.";
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
submit(c);
check("the refusal writes its own text", c.errorTarget.textContent, "al menos un segundo");

// Reiniciar carries no start button, so it goes through: the saved duration
// coming back is the way out of a zero.
c = build("05", "00");
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
check("reiniciar is left alone", submit(c, false), false);

// The zero a countdown ended on is not a draft: the server sent that clock, and
// Iniciar starts it over rather than turning it away.
c = build("00", "00");
c.clockTarget.dataset.timerRemainingMsValue = "0";
check("a spent clock starts", submit(c), false);
check("and nothing is said about it", c.errorTarget.hidden, true);

// A second refusal has to speak again, which means leaving and re-entering.
c = build("05", "00");
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
submit(c);
c.errorTarget.writes.length = 0;
submit(c);
check("a repeat refusal restarts the message", c.errorTarget.writes.join(","), "true,false");
check("and leaves it up", c.errorTarget.hidden, false);

// A real value clears it and posts.
sent.length = 0;
editorOf(c.minutesTarget).value = "02";
commit(c, c.minutesTarget);
check("a real value withdraws the message", c.errorTarget.hidden, true);
check("and is posted", sent[0]?.body.duration, 120);

// --- the entry page ---------------------------------------------------------
sent.length = 0;
c = entry("05", "00");
press(c, c.secondsTarget, "ArrowUp");
check("an arrow fills the hidden field", c.fieldTarget.value, 301);
commit(c, c.secondsTarget);
check("and committing posts nothing", sent.length, 0);
check("the field still holds the value", c.fieldTarget.value, 301);

c = entry("05", "00");
editorOf(c.minutesTarget).value = "07";
commit(c, c.minutesTarget);
check("a typed value reaches the field", c.fieldTarget.value, 420);

// Nothing is saved yet, so there is nothing to fall back to. Restoring a value
// here would let the click that caused the refusal start a timer at the old one.
c = entry("05", "00");
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
check("the zero stays on the entry page", clock(c), "00:00");
check("and reaches the field", c.fieldTarget.value, 0);
check("and the blur says nothing", c.errorTarget.hidden, true);

check("submit is refused", submit(c), true);
check("and the message is up", c.errorTarget.hidden, false);
check("and the minutes get the cursor back", editorOf(c.minutesTarget).focused > 0, true);

// A real value goes through untouched.
c = entry("05", "00");
check("a real clock submits", submit(c), false);

// --- starting an edit ---------------------------------------------------------
// Nothing is selected — a phone would paint a block over the digits — so the
// first digit replaces by hand and the first backspace takes one character
// off.
c = build("05", "30");
open(c, c.minutesTarget);
check("opening leaves the value on screen", read(c.minutesTarget), "05");
check("and parks the caret at the end", editorOf(c.minutesTarget).caret, 2);

// The first digit takes the place of the value, the second lands after it.
type(c, c.minutesTarget, "1");
check("the first digit replaces", read(c.minutesTarget), "1");
type(c, c.minutesTarget, "2");
check("the second appends", read(c.minutesTarget), "12");
type(c, c.minutesTarget, "3");
check("a third is refused", read(c.minutesTarget), "12");
commit(c, c.minutesTarget);
check("and it commits", clock(c), "12:30");

// Not a digit, not an edit: beforeinput sees pasting and dropping too, which
// keydown does not.
c = build("05", "30");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "x");
check("a letter is refused", read(c.minutesTarget), "05");

// After a backspace the edit is under way, so the next digit appends.
c = build("05", "30");
open(c, c.minutesTarget);
del(c, c.minutesTarget);
check("backspace takes a digit", read(c.minutesTarget), "0");
type(c, c.minutesTarget, "7");
check("and the next digit appends", read(c.minutesTarget), "07");
commit(c, c.minutesTarget);
check("which commits as typed", clock(c), "07:30");

// Wherever the caret sits: a click can land it at the start, where the browser
// sees nothing to its left to delete.
c = build("05", "30");
open(c, c.minutesTarget);
editorOf(c.minutesTarget).caret = 0;
del(c, c.minutesTarget);
check("backspace works with the caret at the start", read(c.minutesTarget), "0");

// A second deletion is the browser's to make: by then the caret is ours, at the
// end, so it is left alone.
c = build("05", "30");
open(c, c.minutesTarget);
del(c, c.minutesTarget);
del(c, c.minutesTarget);
check("a second backspace empties it", read(c.minutesTarget), "");
commit(c, c.minutesTarget);
check("and an empty unit falls back", clock(c), "05:30");

// A paste arrives as one event with all of its characters, before maxlength has
// anything to measure, so this branch does its own cutting.
c = build("05", "30");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "1234");
check("a paste is cut to two digits", read(c.minutesTarget), "12");

// Touching and leaving without typing changes nothing.
c = build("05", "30");
open(c, c.minutesTarget);
commit(c, c.minutesTarget);
check("touching and leaving is a no-op", clock(c), "05:30");

// The next unit opened starts fresh again.
c = build("05", "30");
open(c, c.minutesTarget);
type(c, c.minutesTarget, "9");
commit(c, c.minutesTarget, editorOf(c.secondsTarget));
open(c, c.secondsTarget);
type(c, c.secondsTarget, "4");
check("the second unit replaces too", read(c.secondsTarget), "4");

// An arrow rearms the value: what follows replaces it again.
c = build("05", "30");
open(c, c.minutesTarget);
press(c, c.minutesTarget, "ArrowUp");
check("the arrow moved it", read(c.minutesTarget), "06");
del(c, c.minutesTarget);
check("and backspace still takes one", read(c.minutesTarget), "0");
type(c, c.minutesTarget, "7");
check("and then it appends", read(c.minutesTarget), "07");

// --- the hours on offer -----------------------------------------------------
// The list is the whole guard: an hour that cannot be aimed at is never on it,
// so there is no pick to refuse.
at("2026-09-13T17:47:30");
c = entry("05", "00");
c.restock();
check("the list opens on the next quarter", c.timeTarget.labels[1], "6:00 p.m.");
check("and runs as far as the ceiling", c.timeTarget.labels.at(-1), "6:45 p.m.");
check("four of them, behind the blank", c.timeTarget.labels.length, 5);
check("which stays on top", c.timeTarget.labels[0], "--:--");

// On the mark, the mark itself is already gone.
at("2026-09-13T17:45:00");
c = entry("05", "00");
c.restock();
check("a quarter landing on this very minute is not offered", c.timeTarget.labels[1], "6:00 p.m.");
check("and there are still four", c.timeTarget.labels.length, 5);

at("2026-09-13T16:30:00");
c = entry("05", "00");
c.restock();
check("an hour past the ceiling is not on the list", c.timeTarget.labels.includes("6:00 p.m."), false);
check("the last one inside it is", c.timeTarget.labels.at(-1), "5:30 p.m.");

at("2026-09-13T17:50:00");
c = entry("05", "00");
c.restock();
check("and neither is one already gone", c.timeTarget.labels.includes("5:00 p.m."), false);

// Both twelves read as twelve, and neither takes a leading zero.
at("2026-09-13T00:02:00");
c = entry("05", "00");
c.restock();
check("midnight is twelve", c.timeTarget.labels[1], "12:15 a.m.");

at("2026-09-13T11:58:00");
c = entry("05", "00");
c.restock();
check("and noon is twelve too", c.timeTarget.labels[1], "12:00 p.m.");

// --- the hours all year -----------------------------------------------------
// Four behind the blank whatever the clock says, and each one still ahead and
// no further off than the ceiling. That is the invariant a zone broke: walking
// the marks in wall minutes came up empty for the quarter before a fall-back,
// and restock threw on the empty list where Stimulus swallowed it. The count
// alone would miss the other half of that break — the same walk offered four
// hours already gone for the hour a zone repeats — so the hours themselves are
// read. A year of ten-minute steps crosses whatever seams the machine's zone
// has — none, where it keeps one time all year.
c = entry("05", "00");

const sweepFrom = Date.parse("2026-01-01T00:00:00Z");
const sweepSteps = 365 * 24 * 6;
let seam = "none";

for (let i = 0; i < sweepSteps; i++) {
  const stamp = new Date(sweepFrom + i * 600_000).toISOString();
  at(stamp);

  let sound = false;

  try {
    c.restock();

    const hours = c.timeTarget.options.slice(1).map((o) => Date.parse(o.value));

    sound = c.timeTarget.options.length === 5 &&
      hours.every((hour) => hour > Date.now() && hour - Date.now() <= c.maxValue * 1000);
  } catch {
    // The throw the empty list caused, reported below as the stamp it fell on.
  }

  if (!sound && seam === "none") seam = stamp;
}

check("every ten minutes of a year stocks four hours", seam, "none");

// --- aiming at an hour ------------------------------------------------------
at("2026-09-13T12:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");
check("an hour ahead becomes what is left of it", clock(c), "30:00");
check("the field carries the instant", c.deadlineTarget.value, instant("2026-09-13T12:30:00"));
check("and the duration follows the digits", c.fieldTarget.value, 1800);

advance(1_000);
check("a second later the units have moved", clock(c), "29:59");

// The last stretch, and then zero, which stands: Iniciar is what comes off it.
advance(1_799_000);
check("the countdown lands on zero", clock(c), "00:00");
check("and stops there", tick, null);

// Aimed at the boundary, like the running clock's own tick.
at("2026-09-13T12:00:00.400");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");
check("the first tick waits out the part second", delay, 620);

// The list runs on past midnight, so this is twenty minutes off.
at("2026-09-13T23:50:00");
c = entry("05", "00");
c.restock();
check("the hours cross midnight", c.timeTarget.labels.includes("12:15 a.m."), true);
aim(c, "2026-09-14T00:15:00");
check("and one of them is twenty-five minutes off", clock(c), "25:00");
check("on tomorrow's instant", c.deadlineTarget.value, instant("2026-09-14T00:15:00"));

at("2026-09-13T17:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T18:00:00");
check("exactly an hour is taken", clock(c), "60:00");

// --- the list going stale ---------------------------------------------------
at("2026-09-13T12:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");

at("2026-09-13T12:02:00");
c.restock();
check("restocking moves the list on", c.timeTarget.labels[1], "12:15 p.m.");
check("and keeps a pick still on it", c.timeTarget.value, instant("2026-09-13T12:30:00"));
// Only the tick moves the digits, so opening the list disturbs nothing.
check("without touching the countdown", clock(c), "30:00");

at("2026-09-13T12:31:00");
c.restock();
check("a pick that has gone by falls off the list", c.timeTarget.value, "");
check("but the aim is what Iniciar answers to", submit(c), true);
check("so the hour still speaks", c.errorTarget.textContent, "esa hora ya pasó");

// --- opening the list -------------------------------------------------------
// The caption is part of the control, and the arrow lies over the select, so
// both have to reach it. Only the select opens itself.
at("2026-09-13T12:00:00");
c = entry("05", "00");
c.openList({ target: "the caption" });
check("the caption opens the list", c.timeTarget.opened, 1);
check("and stocks it on the way", c.timeTarget.labels.length, 5);

c.openList({ target: c.timeTarget });
check("the select is left to open itself", c.timeTarget.opened, 1);

// --- letting the hour go ----------------------------------------------------
// The blank is the way back to a duration from inside the pill, so it is a
// choice and not a prompt: disabled, an aimed clock could only be undone by
// reaching for the digits.
at("2026-09-13T12:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");
advance(1_000);
c.timeTarget.value = "";
c.aim();
check("the blank lets the hour go", c.deadlineTarget.value, "");
check("the digits stay, as a duration", clock(c), "29:59");
check("which the field carries", c.fieldTarget.value, 1799);
check("and nothing is left ticking", cleared > 0, true);

// --- touching the clock -----------------------------------------------------
at("2026-09-13T12:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");
open(c, c.minutesTarget);
check("touching the clock un-aims it", c.deadlineTarget.value, "");
check("and empties the pill", c.timeTarget.value, "");
check("the digits stay, as a duration", clock(c), "30:00");
check("which the field carries", c.fieldTarget.value, 1800);
check("and nothing is left ticking", cleared > 0, true);

// --- starting an aimed clock ------------------------------------------------
at("2026-09-13T12:00:00");
c = entry("05", "00");
aim(c, "2026-09-13T12:30:00");
check("an aimed clock starts", submit(c), false);

at("2026-09-13T12:31:00");
check("once its hour has gone by it does not", submit(c), true);
check("with the hour's own message", c.errorTarget.textContent, "esa hora ya pasó");
check("the pill gets the cursor", c.timeTarget.focused > 0, true);
check("and not the minutes, which would un-aim it", editorOf(c.minutesTarget).focused, 0);

// --- enter on the pill ------------------------------------------------------
// The pill binds no key of its own: Enter on a closed select submits the form,
// and Iniciar is its first submit button, so a pick made from the keyboard
// reaches the same guard as a click.
at("2026-09-13T17:47:30");
c = entry("05", "00");
c.timeTarget.focus();
aim(c, "2026-09-13T18:00:00");
check("enter over the pill is left to start the clock", submit(c), false);

at("2026-09-13T18:01:00");
check("and is refused once that hour has gone by", submit(c), true);
check("with the hour's own message", c.errorTarget.textContent, "esa hora ya pasó");

// --- proyectar --------------------------------------------------------------
c = entry("05", "00");
editorOf(c.minutesTarget).value = "00";
commit(c, c.minutesTarget);
check("proyectar is refused on a zero", project(c), true);
check("and says why", c.errorTarget.textContent, "al menos un segundo");
check("with the message up", c.errorTarget.hidden, false);

c = entry("05", "00");
check("a real clock is left to create", project(c), false);

// --- a deadline the server sent back ----------------------------------------
at("2026-09-13T12:00:00");
c = entry("05", "00");
c.deadlineTarget.value = instant("2026-09-13T12:30:00");
c.connect();
check("a deadline coming back is picked off the fresh list", c.timeTarget.value, instant("2026-09-13T12:30:00"));
check("and aims the clock at it", clock(c), "30:00");

// The hour the server refused cannot be on the list, and its message is
// already on the page: writing over it is what this guards.
at("2026-09-13T17:50:00");
c = entry("05", "00");
c.errorTarget.textContent = "Esa hora ya pasó.";
c.errorTarget.hidden = false;
c.deadlineTarget.value = instant("2026-09-13T17:00:00");
c.connect();
check("an hour the server refused is not on the list", c.timeTarget.value, "");
check("so the aim is dropped", c.deadlineTarget.value, "");
check("and the server's message is left standing", c.errorTarget.hidden, false);

// The dashboard runs this controller with no pill at all.
c = build("05", "00");
c.connect();
check("the dashboard has no list to stock", c.timeTarget.labels.length, 1);
check("and its zero still speaks for itself", c.refusal(), null);

console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
