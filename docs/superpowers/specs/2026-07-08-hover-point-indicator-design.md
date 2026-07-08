# Hover Point Indicator Design

Date: 2026-07-08

## Goal

Make pointer hover indicate the hovered point with the same visual as a selected point, except without the opacity pulse. The cloud remains undimmed on hover.

## Decision

**Overlay-only hover.** Reuse the existing selection highlight sprite (`SELECTION.highlightSizeMultiplier`) as a static overlay. Do not dim other points or brighten the hovered vertex on hover. Selection (click / go-to) keeps its full treatment: dim others, brighten target, large overlay, and blink pulse.

## Behavior

| State | Overlay | Dim / brighten colors | Pulse |
| --- | --- | --- | --- |
| Idle | Hidden | Original colors | — |
| Hover | Visible, opacity 1, same size as selection | Unchanged | No |
| Selected / focused | Visible, blinking | Non-selected dimmed; selected brightened + accent | Yes (unless reduced motion) |

Additional rules:

- Hover leave or raycast miss clears the hover overlay.
- Entering selection clears hover ownership; selection takes over the shared overlay and starts the blink.
- While a point is focused, hover highlight stays off (same as current hover tooltip mute).
- Point-size slider keeps the overlay size in sync for both hover-only and selected states.

## Approach

Extend `PointSelection` rather than adding a second highlight mesh.

### `PointSelection`

- Add `hover(index, pointSizeMultiplier)`:
  - Position/show the existing highlight overlay via `#updateHighlight`.
  - Do not mutate vertex colors.
  - Do not call `#startBlink`.
  - Track hover state (e.g. `hoveredIndex`) so size sync works when nothing is selected.
- Add `clearHover()`:
  - Clear hover state.
  - Hide the overlay only when `selectedIndex === null` (selection still owns it when focused).
- Keep `select` / `reset` behavior for colors and blink.
- Update `updateHighlightSize` so it also applies when hover-only is active.

### `PointInteraction`

- On new hovered index: `selection.hover(index, this.params.pointSize)`.
- On hover clear (`#hideHoverTooltip`, empty raycast): `selection.clearHover()`.
- Before `#enterSelection`: `selection.clearHover()`, then existing `selection.select(...)`.

### Constants

No new constants. Reuse `SELECTION.highlightSizeMultiplier` (and existing screen-radius helpers are unchanged; hover tooltip remains cursor-following).

## Testing

- Unit: hover shows overlay at correct size without color mutation; `clearHover` hides when not selected; hover then `select` still dims/brightens and starts blink; `reset` after that restores colors and hides overlay.
- Manual: hover → static large point; leave → clears; click → pulsed selection; dismiss → normal hover again.

## Out of scope

- Dimming or vertex brightening on hover
- Hover while focused
- Changes to shimmer pulse on the main cloud points
- Tooltip layout/behavior changes
