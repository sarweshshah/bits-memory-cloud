import { COORD_DECIMALS } from "../constants.js";

const TOOLTIP_OFFSET = 14;
const VIEWPORT_PADDING = 8;

export class Tooltip {
  constructor(element) {
    this.element = element;
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

  #positionAt(screenX, screenY) {
    let left = screenX + TOOLTIP_OFFSET;
    let top = screenY + TOOLTIP_OFFSET;

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;

    const { width, height } = this.element.getBoundingClientRect();
    const maxLeft = window.innerWidth - width - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - height - VIEWPORT_PADDING;

    if (left > maxLeft) {
      left = screenX - width - TOOLTIP_OFFSET;
    }
    if (top > maxTop) {
      top = screenY - height - TOOLTIP_OFFSET;
    }

    left = Math.max(VIEWPORT_PADDING, Math.min(left, maxLeft));
    top = Math.max(VIEWPORT_PADDING, Math.min(top, maxTop));

    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  showAt(screenX, screenY, data, { dismissible = false, onDismiss } = {}) {
    this.element.hidden = false;
    this.element.classList.toggle("focused", dismissible);
    this.element.innerHTML = this.buildHtml(data, { dismissible });
    this.#positionAt(screenX, screenY);

    if (dismissible && onDismiss) {
      this.element
        .querySelector(".tooltip-dismiss")
        ?.addEventListener("click", onDismiss);
    }
  }

  updatePosition(screenX, screenY) {
    this.#positionAt(screenX, screenY);
  }

  hide() {
    this.element.hidden = true;
    this.element.classList.remove("focused");
  }

  get isVisible() {
    return !this.element.hidden;
  }
}
