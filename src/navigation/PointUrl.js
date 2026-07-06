/**
 * URL-based point selection via the `?point=<index>` query parameter.
 * Keeps browser history in sync with focused points for shareable deep links.
 */

const POINT_PARAM = "point";

/** Read the currently selected point index from the URL, or null if absent/invalid. */
export function getSelectedPoint() {
  const raw = new URLSearchParams(window.location.search).get(POINT_PARAM);
  if (raw === null) return null;

  const index = Number.parseInt(raw, 10);
  return Number.isFinite(index) ? index : null;
}

/** Push a new history entry with the given point index. No-op if already selected. */
export function setSelectedPoint(index) {
  if (getSelectedPoint() === index) return;

  const url = new URL(window.location.href);
  url.searchParams.set(POINT_PARAM, String(index));
  history.pushState(null, "", url);
}

/** Push a history entry that removes the point parameter. No-op if already clear. */
export function clearSelectedPoint() {
  if (getSelectedPoint() === null) return;

  const url = new URL(window.location.href);
  url.searchParams.delete(POINT_PARAM);
  history.pushState(null, "", url);
}

/** Replace the current history entry (used when correcting invalid deep links). */
export function replaceSelectedPoint(index) {
  const url = new URL(window.location.href);
  if (index === null) {
    url.searchParams.delete(POINT_PARAM);
  } else {
    url.searchParams.set(POINT_PARAM, String(index));
  }
  history.replaceState(null, "", url);
}
