import { Controller } from "@hotwired/stimulus";
import { bare } from "shortcut";

// Each key clicks its button, so a key cannot drift from what its control
// does.
//
// P needs the click: a keydown is a user gesture, and element.click() spends
// it in the same task, so the projection tab is not blocked as a popup.
const KEYS = {
  " ": ".control.start, .control.pause",
  r: ".control.reset",
  p: ".control.projection",
};

export default class extends Controller {
  handle(event) {
    if (!bare(event)) return;

    const selector = KEYS[event.key.toLowerCase()];
    if (!selector) return;

    const control = this.element.querySelector(selector);
    if (!control) return;

    // Otherwise Space also scrolls the page.
    event.preventDefault();
    control.click();
  }
}
