import gsap from "gsap";
import { COORD_DECIMALS } from "../constants.js";

const TOOLTIP_OFFSET = 14;
const VIEWPORT_PADDING = 8;
const FOCUSED_PADDING_TOP = 21.6; // 1.35rem at 16px root
const HOVER_PADDING_TOP = 8; // 0.5rem

export class Tooltip {
  constructor(element, { getReduceMotion } = {}) {
    this.element = element;
    this.getReduceMotion = getReduceMotion ?? (() => false);
    this.activeTween = null;
    this.isFocusedMode = false;
    this.cachedSize = null;

    gsap.set(element, {
      autoAlpha: 0,
      scale: 0.97,
      transformOrigin: "top left",
    });

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
        x: ${data.x.toFixed(COORD_DECIMALS)} &nbsp; y: ${data.y.toFixed(COORD_DECIMALS)} &nbsp; z: ${data.z.toFixed(COORD_DECIMALS)}
      </div>
    `;
  }

  #computePosition(screenX, screenY) {
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

  #applyPosition(left, top, { smooth = false } = {}) {
    if (smooth && !this.getReduceMotion()) {
      this.leftTo(left);
      this.topTo(top);
      return;
    }

    gsap.killTweensOf(this.element, "left,top");
    gsap.set(this.element, { left, top });
  }

  #positionAt(screenX, screenY, { smooth = false } = {}) {
    const { left, top } = this.#computePosition(screenX, screenY);
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

  showAt(screenX, screenY, data, { dismissible = false, onDismiss } = {}) {
    const wasVisible = this.isVisible;
    const wasFocused = this.isFocusedMode;

    this.#killActiveTween();
    this.isFocusedMode = dismissible;
    this.element.hidden = false;
    this.element.classList.toggle("focused", dismissible);
    this.element.innerHTML = this.buildHtml(data, { dismissible });
    this.#invalidateSize();
    this.#refreshSize();
    this.#positionAt(screenX, screenY);

    if (dismissible && onDismiss) {
      this.element
        .querySelector(".tooltip-dismiss")
        ?.addEventListener("click", onDismiss);
    }

    if (!wasVisible) {
      this.#animateIn({ focused: dismissible });
    } else if (dismissible && !wasFocused) {
      this.#promoteToFocused();
      this.#positionAt(screenX, screenY, { smooth: true });
    } else if (!dismissible && wasFocused) {
      gsap.set(this.element, { paddingTop: HOVER_PADDING_TOP });
      this.#animateIn();
    } else if (!dismissible) {
      this.#animateContentSwap();
    } else {
      gsap.set(this.element, { autoAlpha: 1, scale: 1, y: 0 });
      this.#positionAt(screenX, screenY, { smooth: true });
    }
  }

  updatePosition(screenX, screenY) {
    this.#positionAt(screenX, screenY, { smooth: this.isFocusedMode });
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
