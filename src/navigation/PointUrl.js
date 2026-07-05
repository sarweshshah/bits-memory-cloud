const POINT_PARAM = "point";

export function getSelectedPoint() {
  const raw = new URLSearchParams(window.location.search).get(POINT_PARAM);
  if (raw === null) return null;

  const index = Number.parseInt(raw, 10);
  return Number.isFinite(index) ? index : null;
}

export function setSelectedPoint(index) {
  if (getSelectedPoint() === index) return;

  const url = new URL(window.location.href);
  url.searchParams.set(POINT_PARAM, String(index));
  history.pushState(null, "", url);
}

export function clearSelectedPoint() {
  if (getSelectedPoint() === null) return;

  const url = new URL(window.location.href);
  url.searchParams.delete(POINT_PARAM);
  history.pushState(null, "", url);
}

export function replaceSelectedPoint(index) {
  const url = new URL(window.location.href);
  if (index === null) {
    url.searchParams.delete(POINT_PARAM);
  } else {
    url.searchParams.set(POINT_PARAM, String(index));
  }
  history.replaceState(null, "", url);
}
