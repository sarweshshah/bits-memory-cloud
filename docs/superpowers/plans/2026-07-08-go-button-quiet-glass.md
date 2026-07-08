# Quiet-Glass Go Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the `#goto-form` Go button to quiet frosted glass with soft neutral hover and a separate neutral focus ring.

**Architecture:** CSS-only change in `src/style.css`. No HTML or JavaScript changes. Spec: `docs/superpowers/specs/2026-07-08-go-button-quiet-glass-design.md`.

**Tech Stack:** Existing vanilla CSS in the Vite app.

---

### File map

| File | Role |
|------|------|
| `src/style.css` | Only file modified — `#goto-form button` idle / hover / focus-visible rules |

### Task 1: Restyle Go button CSS

**Files:**
- Modify: `src/style.css` (`#goto-form button` block and hover rule; add `:focus-visible`)

- [x] **Step 1: Replace idle button styles**

Replace the current `#goto-form button` rule so it uses quiet glass instead of the gradient:

```css
#goto-form button {
  min-width: 2rem;
  padding: 0.38rem 0.6rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #f8f7ff;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, opacity 0.15s ease;
}
```

- [ ] **Step 2: Update hover and add focus-visible**

Replace the hover rule and add focus-visible immediately after it:

```css
#goto-form button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.18);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.22);
}

#goto-form button:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.55);
  outline-offset: 2px;
}
```

Leave `#goto-form button:disabled, #goto-form input:disabled` unchanged.

- [ ] **Step 3: Visual verification**

Run: `npm run dev` (or use the already-running Vite server) and open the app.

Check:
- Idle button is frosted glass (no blue/violet gradient)
- Hover brightens fill only (~18% white); border stays the same
- Tab to the button shows a neutral white focus ring (not purple)
- Input focus still uses purple border
- Disabled state still dims both input and button

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "$(cat <<'EOF'
Restyle Go button to quiet frosted glass.

EOF
)"
```
