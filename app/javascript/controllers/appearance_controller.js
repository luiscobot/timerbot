import { Controller } from "@hotwired/stimulus";
import { bare } from "shortcut";

// Shared with the layout's head script.
const KEY = "appearance";

// The theme lives on the document as data-theme, where the palette and the
// glyph both read it. This flips it, stores the flip, and keeps the label
// naming the next click.
export default class extends Controller {
  connect() {
    // By hand: an action cannot listen to a media query.
    this.system = window.matchMedia("(prefers-color-scheme: light)");
    this.follow = this.follow.bind(this);
    this.system.addEventListener("change", this.follow);

    // The markup ships the dark label; catch up to the head script.
    this.syncLabel();
  }

  disconnect() {
    this.system.removeEventListener("change", this.follow);
  }

  shortcut(event) {
    if (!bare(event) || event.key.toLowerCase() !== "t") return;

    this.toggle();
  }

  toggle() {
    // Stored so the projection window opens in the same theme.
    const next = this.theme === "dark" ? "light" : "dark";

    this.remember(next);
    this.apply(next);
  }

  // The OS only counts while nothing has been chosen here.
  follow(event) {
    if (this.stored) return;

    this.apply(event.matches ? "light" : "dark");
  }

  apply(theme) {
    document.documentElement.dataset.theme = theme;
    this.syncLabel();
  }

  // Anything but an explicit light is dark, matching :root's fallback.
  get theme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  get stored() {
    try {
      return localStorage.getItem(KEY);
    } catch {
      // Private mode can refuse storage; "nothing chosen" is right.
      return null;
    }
  }

  remember(theme) {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Same refusal; nothing to do.
    }
  }

  // Names the action, not the state: the glyph already shows where you are.
  syncLabel() {
    const label = this.theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";

    // Title only: a screen reader saying "(T)" is noise.
    this.element.setAttribute("aria-label", label);
    this.element.title = `${label} (T)`;
  }
}
