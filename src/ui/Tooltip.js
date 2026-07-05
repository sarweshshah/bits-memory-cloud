import { COORD_DECIMALS } from "../constants.js";

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

  showAt(screenX, screenY, data, { dismissible = false, onDismiss } = {}) {
    this.element.hidden = false;
    this.element.classList.toggle("focused", dismissible);
    this.element.innerHTML = this.buildHtml(data, { dismissible });
    this.element.style.left = `${screenX + 14}px`;
    this.element.style.top = `${screenY + 14}px`;

    if (dismissible && onDismiss) {
      this.element
        .querySelector(".tooltip-dismiss")
        ?.addEventListener("click", onDismiss);
    }
  }

  updatePosition(screenX, screenY) {
    this.element.style.left = `${screenX + 14}px`;
    this.element.style.top = `${screenY + 14}px`;
  }

  hide() {
    this.element.hidden = true;
    this.element.classList.remove("focused");
  }

  get isVisible() {
    return !this.element.hidden;
  }
}
