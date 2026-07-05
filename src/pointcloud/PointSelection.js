import * as THREE from "three";
import gsap from "gsap";
import {
  DIM_FACTOR,
  SELECT_ACCENT,
  SELECT_BRIGHTEN,
  SELECT_MIX,
  HIGHLIGHT_SIZE_MULTIPLIER,
} from "../constants.js";

export class PointSelection {
  constructor(pointCloud, group, { onRenderRequest, getReduceMotion }) {
    this.pointCloud = pointCloud;
    this.group = group;
    this.onRenderRequest = onRenderRequest;
    this.getReduceMotion = getReduceMotion;

    this.selectedIndex = null;
    this.highlight = null;
    this.blinkTween = null;
  }

  get isActive() {
    return this.selectedIndex !== null;
  }

  get hasBlink() {
    return this.blinkTween !== null;
  }

  select(index, pointSizeMultiplier) {
    const mesh = this.pointCloud.mesh;
    const originalColors = this.pointCloud.originalColors;
    if (!mesh || !originalColors) return;

    this.selectedIndex = index;
    const colors = mesh.geometry.attributes.color;
    const count = originalColors.length / 3;

    for (let i = 0; i < count; i++) {
      const j = i * 3;
      const r = originalColors[j];
      const g = originalColors[j + 1];
      const b = originalColors[j + 2];

      if (i === index) {
        const [sr, sg, sb] = this.#getSelectedColor(r, g, b);
        colors.array[j] = sr;
        colors.array[j + 1] = sg;
        colors.array[j + 2] = sb;
      } else {
        colors.array[j] = r * DIM_FACTOR;
        colors.array[j + 1] = g * DIM_FACTOR;
        colors.array[j + 2] = b * DIM_FACTOR;
      }
    }

    colors.needsUpdate = true;
    this.#updateHighlight(index, pointSizeMultiplier);
    this.#startBlink();
    this.onRenderRequest();
  }

  reset() {
    const mesh = this.pointCloud.mesh;
    const originalColors = this.pointCloud.originalColors;
    if (!mesh || !originalColors || this.selectedIndex === null) return;

    this.selectedIndex = null;
    mesh.geometry.attributes.color.array.set(originalColors);
    mesh.geometry.attributes.color.needsUpdate = true;
    this.#stopBlink();
    this.onRenderRequest();
  }

  updateHighlightSize(pointSizeMultiplier) {
    if (!this.highlight || this.selectedIndex === null) return;
    this.highlight.material.size =
      this.pointCloud.basePointSize *
      pointSizeMultiplier *
      HIGHLIGHT_SIZE_MULTIPLIER;
  }

  #getSelectedColor(r, g, b) {
    const brightR = Math.min(1, r * SELECT_BRIGHTEN);
    const brightG = Math.min(1, g * SELECT_BRIGHTEN);
    const brightB = Math.min(1, b * SELECT_BRIGHTEN);
    const mix = SELECT_MIX;
    const inv = 1 - mix;

    return [
      brightR * inv + SELECT_ACCENT.r * mix,
      brightG * inv + SELECT_ACCENT.g * mix,
      brightB * inv + SELECT_ACCENT.b * mix,
    ];
  }

  #ensureHighlight() {
    if (this.highlight) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3)
    );

    this.highlight = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: this.pointCloud.basePointSize * HIGHLIGHT_SIZE_MULTIPLIER,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      })
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 1;
    this.group.add(this.highlight);
  }

  #updateHighlight(index, pointSizeMultiplier) {
    this.#ensureHighlight();

    const pos = this.pointCloud.geometry.attributes.position;
    this.highlight.geometry.attributes.position.setXYZ(
      0,
      pos.getX(index),
      pos.getY(index),
      pos.getZ(index)
    );
    this.highlight.geometry.attributes.position.needsUpdate = true;
    this.highlight.material.size =
      this.pointCloud.basePointSize *
      pointSizeMultiplier *
      HIGHLIGHT_SIZE_MULTIPLIER;
    this.highlight.visible = true;
  }

  #stopBlink() {
    if (this.blinkTween) {
      this.blinkTween.kill();
      this.blinkTween = null;
    }
    if (this.highlight) {
      this.highlight.visible = false;
      this.highlight.material.opacity = 1;
    }
  }

  #startBlink() {
    if (!this.highlight) return;

    this.#stopBlink();
    this.highlight.visible = true;
    this.highlight.material.opacity = 1;

    if (this.getReduceMotion()) {
      this.onRenderRequest();
      return;
    }

    this.blinkTween = gsap.to(this.highlight.material, {
      opacity: 0.12,
      duration: 0.55,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
      onUpdate: () => this.onRenderRequest(),
    });
  }
}
