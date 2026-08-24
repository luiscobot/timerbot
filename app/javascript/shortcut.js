// The one definition of when a bare keypress counts as a shortcut, shared by
// every controller that binds one.
const CONTROLS = [ "BUTTON", "INPUT", "SELECT", "TEXTAREA" ];
const TYPING = [ "INPUT", "SELECT", "TEXTAREA" ];

export function bare(event) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (event.repeat) return false;

  const target = event.target;

  // Space activates whatever control has focus.
  if (event.key === " ") return !CONTROLS.includes(target.tagName);

  // A letter is ours unless the focus takes typing; a submit does not.
  return !TYPING.includes(target.tagName) || target.type === "submit";
}
