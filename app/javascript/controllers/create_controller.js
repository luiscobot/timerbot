import { Controller } from "@hotwired/stimulus";
import { csrfToken } from "csrf";

// Proyectar points two tabs — this one to the dashboard, a new one to the
// projection — which a redirect cannot do. Iniciar stays a plain submit.
export default class extends Controller {
  static targets = ["duration"];

  async project(event) {
    // Leave a zero to the submit: the duration controller turns it away and
    // says why.
    if (!(Number(this.durationTarget.value) > 0)) return;

    // Opened inside the click: after the fetch the browser counts it as a
    // popup. Blank until the response says where to point it.
    const tab = window.open("", "_blank");

    // Blocked anyway; post the form normally.
    if (!tab) return;

    event.preventDefault();

    try {
      const response = await fetch(this.element.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": csrfToken(),
        },
        body: JSON.stringify({ duration: this.durationTarget.value }),
      });

      // Rate limited, most likely. Post the form so the server answers with
      // the entry page and its message.
      if (!response.ok) {
        tab.close();
        this.element.requestSubmit();
        return;
      }

      const { dashboard, projection } = await response.json();

      tab.location = projection;
      window.location = dashboard;
    } catch {
      // Network trouble; same fallback. If the create landed, the resubmit
      // mints one orphan for the sweep.
      tab.close();
      this.element.requestSubmit();
    }
  }
}
