// Runs the real timer_controller against stubs, imported off a data: URL like
// duration_test.mjs. Covers the render arithmetic and the deadline, not the
// animation.
//
// Run through the suite with bin/rails test, or on its own:
//   node test/javascript/timer_test.mjs
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../../app/javascript/controllers/timer_controller.js", import.meta.url),
  "utf8",
)
  .replace(/import \{ Controller \}.*\n/, "class Controller {}\n")
  .replace(/import \{ csrfToken \}.*\n/, "const csrfToken = () => \"stub\";\n");

// One shape serves units, cells and numerals.
const element = () => ({
  className: "",
  textContent: "",
  attributes: {},
  children: [],
  setAttribute(name, value) { this.attributes[name] = value; },
  append(...nodes) { this.children.push(...nodes); },
  replaceChildren(...nodes) { this.children = nodes; },
  remove() {},
  animate: () => ({ finished: Promise.resolve() }),
});

globalThis.document = { createElement: element };
globalThis.window = { matchMedia: () => ({ matches: true }) };

// The clock and the tick under the test's control. The controller aims each
// tick at the next whole second, so the delay it asks for is worth reading.
let now = 0;
globalThis.Date = { now: () => now };

let tick = null;
let delay = null;
let cleared = 0;
globalThis.setTimeout = (fn, ms) => { tick = fn; delay = ms; return 1; };
globalThis.clearTimeout = () => { cleared += 1; };

const sent = [];
globalThis.fetch = (url) => { sent.push(url); return Promise.resolve(); };

const { default: Timer } = await import(
  `data:text/javascript,${encodeURIComponent(source)}`
);

let failures = 0;

const check = (name, actual, expected) => {
  if (actual === expected) return;

  failures += 1;
  console.log(`FAIL ${name}: got ${actual}, wanted ${expected}`);
};

// A broadcast clock, as connect receives it.
function build(minutes, seconds, remainingMs, status = "running") {
  const controller = new Timer();

  controller.statusValue = status;
  controller.remainingMsValue = remainingMs;
  controller.completeUrlValue = "/w/def456/completion";
  controller.minutesTarget = Object.assign(element(), { textContent: minutes });
  controller.secondsTarget = Object.assign(element(), { textContent: seconds });

  now = 0;
  tick = null;
  delay = null;
  cleared = 0;
  sent.length = 0;

  controller.connect();
  return controller;
}

// The units are read the way assistive tech reads them.
const shown = (controller) =>
  [ controller.minutesTarget, controller.secondsTarget ]
    .map((unit) => unit.attributes["aria-label"])
    .join(":");

const numerals = (unit) => unit.children.map((cell) => cell.children.length).join();

{
  const controller = build("10", "00", 600_000, "idle");

  check("an idle clock is left alone", tick, null);
  check("no cells on an idle clock", controller.minutesTarget.children.length, 0);
}

{
  const controller = build("12", "35", 754_200);

  check("connect renders the broadcast remainder", shown(controller), "12:35");
  check("one cell per place", controller.minutesTarget.children.length, 2);
  check("the unit carries the value", controller.minutesTarget.attributes.role, "timer");

  controller.render(59_999);
  check("a partial second still counts", shown(controller), "01:00");

  controller.render(1);
  check("one millisecond is one second", shown(controller), "00:01");

  controller.render(0);
  check("zero renders zero", shown(controller), "00:00");
}

// A changed cell holds two numerals while they cross; an unchanged one keeps
// its one.
{
  const controller = build("12", "35", 754_200);

  controller.render(744_200);

  check("unchanged digits stand still", numerals(controller.minutesTarget), "1,1");
  check("only the changed digit moves", numerals(controller.secondsTarget), "2,1");
}

// The deadline drives the tick; past it the server is told, once.
{
  const controller = build("00", "05", 5_000);

  now = 3_000;
  tick();
  check("ticks against the deadline", shown(controller), "00:02");

  now = 5_000;
  tick();
  check("the countdown ends on zero", shown(controller), "00:00");
  check("with the server not told yet", sent.length, 0);
  check("and zero given a second of its own", delay, 1_000);

  tick();
  check("then zero notifies the server", sent.length, 1);
  check("at the completion url", sent[0], "/w/def456/completion");

  controller.disconnect();
  check("and nothing is left to cancel", cleared, 0);
}

// The roll belongs on the second, so each tick is aimed at the boundary rather
// than a fixed slice of it.
{
  build("00", "05", 5_400);
  check("the first tick waits out the part second", delay, 420);

  now = 400;
  tick();
  check("and every one after lands on the whole", delay, 1_020);
}

console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
