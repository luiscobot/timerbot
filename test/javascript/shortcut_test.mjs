// Runs the real bare() against synthetic events. The answer is not the same for
// every key: a focused button keeps Space and gives up the letters.
//
// Run through the suite with bin/rails test, or on its own:
//   node test/javascript/shortcut_test.mjs
import { bare } from "../../app/javascript/shortcut.js";

let failures = 0;

const check = (name, actual, expected) => {
  if (actual === expected) return;

  failures += 1;
  console.log(`FAIL ${name}: got ${actual}, wanted ${expected}`);
};

const press = (key, target, event = {}) =>
  bare({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    target: { type: "", ...target },
    ...event,
  });

const body = { tagName: "BODY" };
const button = { tagName: "BUTTON", type: "submit" };
const submit = { tagName: "INPUT", type: "submit" };
// The clock's own editor is one of these too.
const text = { tagName: "INPUT", type: "text" };

check("a letter on the page is ours", press("r", body), true);
check("space on the page is ours", press(" ", body), true);

// The regression this file exists for. A clicked button keeps focus, so leaving
// the letters out here took R, P and T with it.
check("a letter with a button focused is still ours", press("r", button), true);
check("and so is the theme key", press("t", button), true);
check("space with a button focused is the button's", press(" ", button), false);

check("a letter with Iniciar focused is ours", press("p", submit), true);
check("space with Iniciar focused is Iniciar's", press(" ", submit), false);

check("a text field takes every key", press("r", text), false);
check("including space", press(" ", text), false);

check("a held key is not a shortcut", press("f", body, { repeat: true }), false);
check("cmd is somebody else's", press("r", body, { metaKey: true }), false);
check("ctrl is too", press("r", body, { ctrlKey: true }), false);
check("and alt", press("f", body, { altKey: true }), false);

console.log(failures ? `\n${failures} failing` : "\nall passing");
process.exit(failures ? 1 : 0);
