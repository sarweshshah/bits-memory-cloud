/**
 * Visual feedback for a selected point: dim all others, brighten the target,
 * and overlay a blinking highlight sprite on top.
 */
import * as THREE from "three";
import gsap from "gsap";
import { SELECTION } from "../constants.js";

export class PointSelection {
  constructor(pointCloud, group, { onRenderRequest, getReduceMotion }) {
    this.pointCloud = pointCloud;
    this.group = group;
    this.onRenderRequest = onRenderRequest;
    this.getReduceMotion = getReduceMotion;

    this.selectedIndex = null;
    this.highlight = null; // Separate Points mesh rendered on top
    this.blinkTween = null;
  }

  get isActive() {
    return this.selectedIndex !== null;
  }

  /** True while the blink opacity tween is running (keeps render loop active). */
  get hasBlink() {
    return this.blinkTween !== null;
  }

  /**
   * Highlight a point by index: dim non-selected vertices, brighten selected,
   * and show the overlay blink sprite.
   */
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
        colors.array[j] = r * SELECTION.dimFactor;
        colors.array[j + 1] = g * SELECTION.dimFactor;
        colors.array[j + 2] = b * SELECTION.dimFactor;
      }
    }

    colors.needsUpdate = true;
    this.#updateHighlight(index, pointSizeMultiplier);
    this.#startBlink();
    this.onRenderRequest();
  }

  /** Restore original vertex colors and hide the highlight overlay. */
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

  /** Keep highlight sprite size in sync when point size slider changes. */
  updateHighlightSize(pointSizeMultiplier) {
    if (!this.highlight || this.selectedIndex === null) return;
    this.highlight.material.size =
      this.pointCloud.basePointSize *
      pointSizeMultiplier *
      SELECTION.highlightSizeMultiplier;
  }

  /** Blend brightened original color with the warm accent tint. */
  #getSelectedColor(r, g, b) {
    const brightR = Math.min(1, r * SELECTION.brighten);
    const brightG = Math.min(1, g * SELECTION.brighten);
    const brightB = Math.min(1, b * SELECTION.brighten);
    const mix = SELECTION.mix;
    const inv = 1 - mix;

    return [
      brightR * inv + SELECTION.accent.r * mix,
      brightG * inv + SELECTION.accent.g * mix,
      brightB * inv + SELECTION.accent.b * mix,
    ];
  }

  /** Lazily create the single-point overlay mesh. */
  #ensureHighlight() {
    if (this.highlight) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3)
    );

    const highlightMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: this.pointCloud.basePointSize * SELECTION.highlightSizeMultiplier,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthTest: false,
      depthWrite: false,
    });

    this.highlight = new THREE.Points(geometry, highlightMaterial);
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
      SELECTION.highlightSizeMultiplier;
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

  /** Pulse the overlay opacity; skipped when prefers-reduced-motion is active. */
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
