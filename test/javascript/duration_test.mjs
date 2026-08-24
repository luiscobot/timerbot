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

const sent = [];
globalThis.fetch = (url, options) => {
  sent.push({ url, body: JSON.parse(options.body) });
  return Promise.resolve();
};

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

  controller.messageValue = "al menos un segundo";
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

console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
