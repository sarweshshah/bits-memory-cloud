/**
 * Lightweight 2D axis orientation indicator synced to the active camera.
 * Uses SVG only — no WebGL viewport changes.
 */
import * as THREE from "three";

const AXES = [
  { label: "X", vector: new THREE.Vector3(1, 0, 0), color: "#ff4466" },
  { label: "Y", vector: new THREE.Vector3(0, 1, 0), color: "#88ff44" },
  { label: "Z", vector: new THREE.Vector3(0, 0, 1), color: "#4488ff" },
];

const CENTER = 24;
const LENGTH = 15;

const _dir = new THREE.Vector3();

export class AxisIndicator {
  constructor(element) {
    this.element = element;
    this.lines = [...element.querySelectorAll(".axis-indicator__line")];
    this.labels = [...element.querySelectorAll(".axis-indicator__label")];
  }

  update(camera) {
    for (let i = 0; i < AXES.length; i++) {
      const axis = AXES[i];
      _dir.copy(axis.vector).applyQuaternion(camera.quaternion);

      const x2 = CENTER + _dir.x * LENGTH;
      const y2 = CENTER - _dir.y * LENGTH;
      const dx = x2 - CENTER;
      const dy = y2 - CENTER;
      const len = Math.hypot(dx, dy);

      const line = this.lines[i];
      line.setAttribute("x2", String(x2));
      line.setAttribute("y2", String(y2));
      line.style.opacity = String(0.35 + _dir.z * 0.45);

      const label = this.labels[i];
      label.setAttribute("x", String(x2));
      label.setAttribute("y", String(y2 + 3));
      label.style.opacity = String(0.45 + _dir.z * 0.55);

      if (len < 2) {
        line.style.opacity = "0.15";
        label.style.opacity = "0.2";
      }
    }
  }
}
