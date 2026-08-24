// The token Rails puts in the head, for posts with no form behind them.
export function csrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content;
}
