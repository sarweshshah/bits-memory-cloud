# Go Button Quiet Glass Style

**Date:** 2026-07-08  
**Status:** Approved for planning  
**Scope:** Visual restyle of the `#goto-form` submit button only

## Goal

Replace the current blue→violet gradient Go button with a quiet frosted-glass treatment that matches the HUD language of the go-to control, while keeping hover/focus feedback minimal and monochrome.

## Decisions

| Choice | Decision |
|--------|----------|
| Idle look | Quiet glass (frosted white fill + soft white border) |
| Hover | Soft neutral brighten only — no colored tint, no border change |
| Focus | Separate visible neutral focus ring (for keyboard users) |
| Implementation | CSS-only change to `#goto-form button` in `src/style.css` |
| Label / behavior | Unchanged |

## Visual spec

### Idle (enabled)

- Background: `rgba(255, 255, 255, 0.12)`
- Border: `1px solid rgba(255, 255, 255, 0.28)`
- Text: light (existing `#f8f7ff` / near-white is fine)
- No gradient

### Hover (`:hover:not(:disabled)`)

- Background: `rgba(255, 255, 255, 0.18)` (soft brighten from 12% → 18%)
- Border: unchanged from idle
- Keep the existing light lift (`translateY(-1px)`); replace the colored hover shadow with a muted neutral shadow (or none)

### Focus (`:focus-visible`)

- Distinct from hover and from the input’s purple focus ring
- Use a soft white/neutral `outline` or `box-shadow` ring, ~2px, offset enough to clear the pill edge
- Do not use the purple focus color from `#goto-form input:focus`

### Disabled

- Preserve current reduced opacity and `cursor: not-allowed`
- No hover brighten when disabled

## Out of scope

- Button label (“Go”) or icon treatment
- Form layout, input field styling, or shell chrome
- Submit / enable / invalid behavior in `GoToForm.js`
- Extracting a shared HUD button component
- CSS custom properties / design tokens (deferred unless needed later)

## Approach

**CSS-only restyle** of existing `#goto-form button` rules. No HTML or JavaScript changes.

Rejected alternatives:

- **CSS variables on `#goto-form`** — useful for later iteration, unnecessary for a single button token set
- **Shared `.hud-btn` class** — better long-term consistency with recording controls, but out of scope for this visual tweak

## Verification

- Visually compare idle / hover / focus-visible / disabled against the quiet-glass mockups
- Confirm input focus still uses the existing purple border (unchanged)
- Confirm form submit behavior is unchanged
