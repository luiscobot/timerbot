import { Controller } from "@hotwired/stimulus";
import { csrfToken } from "csrf";

// Proyectar points two tabs — this one to the dashboard, a new one to the
// watch page — which a redirect cannot do. Iniciar stays a plain submit.
export default class extends Controller {
  async project(event) {
    // duration#check ran first on this click and owns the refusal.
    if (event.defaultPrevented) return;

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
        // What the form would have posted: the duration, and the deadline
        // when an hour has been picked.
        body: JSON.stringify(Object.fromEntries(new FormData(this.element))),
      });

      // Rate limited, most likely. Post the form so the server answers with
      // the entry page and its message.
      if (!response.ok) {
        tab.close();
        this.element.requestSubmit();
        return;
      }

      const { dashboard, watch } = await response.json();

      tab.location = watch;
      window.location = dashboard;
    } catch {
      // Network trouble; same fallback. If the create landed, the resubmit
      // mints one orphan for the sweep.
      tab.close();
      this.element.requestSubmit();
    }
  }
}
