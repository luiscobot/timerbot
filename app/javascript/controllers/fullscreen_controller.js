import { Controller } from "@hotwired/stimulus";
import { bare } from "shortcut";

// The projection's one piece of chrome: surfaces on any sign of someone at the
// machine, withdraws once they stop. "f" toggles without going near it.
export default class extends Controller {
  // Long enough to cross a large screen; short enough that a knocked desk does
  // not leave chrome on the wall.
  static values = { idleAfter: { type: Number, default: 2500 } };

  connect() {
    // iOS Safari grants fullscreen to <video> only; a button that cannot do
    // its job is worse than none. Removing it takes its actions too.
    if (!document.fullscreenEnabled) {
      this.element.remove();
      return;
    }

    this.syncLabel();
    // Shown once on load. Broadcasts replace #timer_clock only, so this never
    // reruns mid-countdown.
    this.reveal();
  }

  disconnect() {
    clearTimeout(this.timeout);
  }

  toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      // The root, not the clock: only it carries the page background and dvh.
      document.documentElement.requestFullscreen();
    }
  }

  keydown(event) {
    // Any key is a sign of life.
    this.reveal();

    if (bare(event) && event.key.toLowerCase() === "f") this.toggle();
  }

  reveal() {
    this.element.classList.remove("idle");
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.hide(), this.idleAfterValue);
  }

  hide() {
    // A cursor parked on the button is someone about to press it. Leaving it
    // re-arms this through pointermove.
    if (this.element.matches(":hover, :focus-visible")) {
      this.timeout = setTimeout(() => this.hide(), this.idleAfterValue);
      return;
    }

    this.element.classList.add("idle");
  }

  // The glyph swaps in CSS; the name and tooltip cannot. Driven by the event,
  // so leaving with Escape still lands.
  syncLabel() {
    const label = document.fullscreenElement ? "Salir de pantalla completa" : "Pantalla completa";

    this.element.setAttribute("aria-label", label);
    this.element.title = `${label} (F)`;
  }
}
