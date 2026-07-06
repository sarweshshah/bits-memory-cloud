/**
 * Animated point info tooltip with hover and focused modes.
 * Handles viewport clamping, anchor-radius offsetting, and GSAP transitions.
 */
import gsap from "gsap";
import { DEFAULT_CAMERA } from "../constants.js";

const TOOLTIP_OFFSET = 14; // px gap from cursor in hover mode
const FOCUSED_TOOLTIP_GAP = 8; // px gap between tooltip edge and highlight ring
const VIEWPORT_PADDING = 8; // Minimum distance from viewport edges
const FOCUSED_PADDING_TOP = 21.6; // 1.35rem at 16px root — room for dismiss button
const HOVER_PADDING_TOP = 8; // 0.5rem

// Preferred side order for focused tooltip placement (index = preference weight)
const FOCUSED_PLACEMENTS = [
  "right",
  "left",
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];

export class Tooltip {
  constructor(element, { getReduceMotion } = {}) {
    this.element = element;
    this.getReduceMotion = getReduceMotion ?? (() => false);
    this.activeTween = null;
    this.isFocusedMode = false; // Dismissible tooltip anchored to a selected point
    this.cachedSize = null; // Avoid layout thrashing during position updates

    gsap.set(element, {
      autoAlpha: 0,
      scale: 0.97,
      transformOrigin: "top left",
    });

    // quickTo tweens for smooth follow during camera animation
    this.leftTo = gsap.quickTo(element, "left", {
      duration: 0.28,
      ease: "power3.out",
    });
    this.topTo = gsap.quickTo(element, "top", {
      duration: 0.28,
      ease: "power3.out",
    });
  }

  buildHtml(data, { dismissible = false } = {}) {
    return `
      ${dismissible ? '<button type="button" class="tooltip-dismiss" aria-label="Dismiss">×</button>' : ""}
      <div class="tooltip-id">#${data.id}</div>
      <div class="tooltip-coords">
        x: ${data.x.toFixed(DEFAULT_CAMERA.coordDecimals)} &nbsp; y: ${data.y.toFixed(DEFAULT_CAMERA.coordDecimals)} &nbsp; z: ${data.z.toFixed(DEFAULT_CAMERA.coordDecimals)}
      </div>
    `;
  }

  /**
   * Compute clamped left/top in viewport coordinates.
   * Hover mode follows the cursor; focused mode sits flush outside the highlight ring.
   */
  #computePosition(screenX, screenY, { focused = false, anchorRadius = 0 } = {}) {
    if (!focused) {
      return this.#computeHoverPosition(screenX, screenY);
    }
    return this.#computeFocusedPosition(screenX, screenY, anchorRadius);
  }

  #computeHoverPosition(screenX, screenY) {
    let left = screenX + TOOLTIP_OFFSET;
    let top = screenY + TOOLTIP_OFFSET;

    const size = this.cachedSize ?? this.element.getBoundingClientRect();
    const maxLeft = window.innerWidth - size.width - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - size.height - VIEWPORT_PADDING;

    if (left > maxLeft) {
      left = screenX - size.width - TOOLTIP_OFFSET;
    }
    if (top > maxTop) {
      top = screenY - size.height - TOOLTIP_OFFSET;
    }

    return {
      left: Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft)),
      top: Math.max(VIEWPORT_PADDING, Math.min(top, maxTop)),
    };
  }

  /** Place tooltip outside the highlight circle without overlapping it. */
  #computeFocusedPosition(screenX, screenY, anchorRadius) {
    const size = this.cachedSize ?? this.element.getBoundingClientRect();
    const { width: w, height: h } = size;
    const margin = anchorRadius + FOCUSED_TOOLTIP_GAP;
    const maxLeft = window.innerWidth - w - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - h - VIEWPORT_PADDING;

    const raw = {
      right: { left: screenX + margin, top: screenY - h / 2 },
      left: { left: screenX - margin - w, top: screenY - h / 2 },
      "bottom-right": { left: screenX + margin, top: screenY + margin },
      "bottom-left": { left: screenX - margin - w, top: screenY + margin },
      "top-right": { left: screenX + margin, top: screenY - margin - h },
      "top-left": { left: screenX - margin - w, top: screenY - margin - h },
    };

    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < FOCUSED_PLACEMENTS.length; i++) {
      const side = FOCUSED_PLACEMENTS[i];
      const { left, top } = raw[side];
      const clampedLeft = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));
      const clampedTop = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));
      const overflow =
        Math.abs(left - clampedLeft) + Math.abs(top - clampedTop);
      const overlaps = this.#focusedPlacementOverlaps(
        screenX,
        screenY,
        anchorRadius,
        clampedLeft,
        clampedTop,
        w,
        h
      );
      const preference = (FOCUSED_PLACEMENTS.length - i) * 100;
      const score = preference - overflow * 50 - (overlaps ? 10_000 : 0);

      if (score > bestScore) {
        bestScore = score;
        best = { left: clampedLeft, top: clampedTop };
      }
    }

    return best;
  }

  /** True when a tooltip box intersects the highlight circle. */
  #focusedPlacementOverlaps(cx, cy, radius, left, top, width, height) {
    const nearestX = Math.max(left, Math.min(cx, left + width));
    const nearestY = Math.max(top, Math.min(cy, top + height));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy < radius * radius;
  }

  #applyPosition(left, top, { smooth = false } = {}) {
    if (smooth && !this.getReduceMotion()) {
      this.leftTo(left);
      this.topTo(top);
      return;
    }

    gsap.killTweensOf(this.element, "left,top");
    gsap.set(this.element, { left, top });
  }

  #positionAt(screenX, screenY, { smooth = false, focused = false, anchorRadius = 0 } = {}) {
    const { left, top } = this.#computePosition(screenX, screenY, {
      focused,
      anchorRadius,
    });
    this.#applyPosition(left, top, { smooth });
  }

  #invalidateSize() {
    this.cachedSize = null;
  }

  #refreshSize() {
    this.cachedSize = this.element.getBoundingClientRect();
  }

  #killActiveTween() {
    this.activeTween?.kill();
    this.activeTween = null;
    gsap.killTweensOf(this.element, "left,top,paddingTop");
  }

  /** Fade/scale in when the tooltip first appears. */
  #animateIn({ focused = false } = {}) {
    if (this.getReduceMotion()) {
      gsap.set(this.element, {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        paddingTop: focused ? FOCUSED_PADDING_TOP : HOVER_PADDING_TOP,
      });
      return;
    }

    this.#killActiveTween();
    this.activeTween = gsap.fromTo(
      this.element,
      {
        autoAlpha: 0,
        scale: focused ? 0.97 : 0.94,
        y: focused ? 4 : 6,
        paddingTop: focused ? FOCUSED_PADDING_TOP : HOVER_PADDING_TOP,
      },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: focused ? 0.38 : 0.22,
        ease: focused ? "power2.inOut" : "power2.out",
        overwrite: true,
      }
    );
  }

  /** Transition from hover tooltip to focused (dismissible) mode. */
  #promoteToFocused() {
    if (this.getReduceMotion()) {
      gsap.set(this.element, {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        paddingTop: FOCUSED_PADDING_TOP,
      });
      return;
    }

    this.#killActiveTween();
    this.activeTween = gsap.fromTo(
      this.element,
      { scale: 0.985, paddingTop: HOVER_PADDING_TOP },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        paddingTop: FOCUSED_PADDING_TOP,
        duration: 0.34,
        ease: "power2.inOut",
        overwrite: true,
      }
    );
  }

  /** Subtle pulse when hovering a different point while tooltip is already visible. */
  #animateContentSwap() {
    if (this.getReduceMotion()) return;

    this.#killActiveTween();
    this.activeTween = gsap.fromTo(
      this.element,
      { autoAlpha: 0.55, scale: 0.98 },
      {
        autoAlpha: 1,
        scale: 1,
        duration: 0.14,
        ease: "power1.out",
        overwrite: true,
      }
    );
  }

  /**
   * Show or update the tooltip at screen coordinates.
   * Picks the appropriate entrance animation based on prior visibility/mode.
   */
  showAt(
    screenX,
    screenY,
    data,
    { dismissible = false, onDismiss, anchorRadius = 0 } = {}
  ) {
    const wasVisible = this.isVisible;
    const wasFocused = this.isFocusedMode;

    this.#killActiveTween();
    this.isFocusedMode = dismissible;
    this.element.hidden = false;
    this.element.classList.toggle("focused", dismissible);
    this.element.innerHTML = this.buildHtml(data, { dismissible });
    this.#invalidateSize();
    this.#refreshSize();
    this.#positionAt(screenX, screenY, { focused: dismissible, anchorRadius });

    if (dismissible && onDismiss) {
      this.element
        .querySelector(".tooltip-dismiss")
        ?.addEventListener("click", onDismiss);
    }

    if (!wasVisible) {
      this.#animateIn({ focused: dismissible });
    } else if (dismissible && !wasFocused) {
      this.#promoteToFocused();
      this.#positionAt(screenX, screenY, {
        smooth: true,
        focused: true,
        anchorRadius,
      });
    } else if (!dismissible && wasFocused) {
      gsap.set(this.element, { paddingTop: HOVER_PADDING_TOP });
      this.#animateIn();
    } else if (!dismissible) {
      this.#animateContentSwap();
    } else {
      gsap.set(this.element, { autoAlpha: 1, scale: 1, y: 0 });
      this.#positionAt(screenX, screenY, {
        smooth: true,
        focused: true,
        anchorRadius,
      });
    }
  }

  /** Follow pointer or anchor point; uses smooth quickTo in focused mode. */
  updatePosition(screenX, screenY, { anchorRadius = 0 } = {}) {
    this.#positionAt(screenX, screenY, {
      smooth: this.isFocusedMode,
      focused: this.isFocusedMode,
      anchorRadius,
    });
  }

  hide() {
    if (this.element.hidden) return;

    this.#killActiveTween();
    this.isFocusedMode = false;

    if (this.getReduceMotion()) {
      this.#completeHide();
      return;
    }

    this.activeTween = gsap.to(this.element, {
      autoAlpha: 0,
      scale: 0.96,
      y: 4,
      duration: 0.16,
      ease: "power2.in",
      onComplete: () => this.#completeHide(),
    });
  }

  #completeHide() {
    this.element.hidden = true;
    this.element.classList.remove("focused");
    this.#invalidateSize();
    gsap.set(this.element, {
      scale: 0.97,
      y: 0,
      paddingTop: HOVER_PADDING_TOP,
    });
  }

  get isVisible() {
    return !this.element.hidden;
  }
}
