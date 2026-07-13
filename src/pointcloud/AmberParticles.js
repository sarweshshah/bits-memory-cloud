/**
 * Ambient amber ember particles that drift through the point cloud volume.
 * Driven by a light breeze field — does not modify the loaded model.
 */
import * as THREE from "three";
import { AMBER_PARTICLES } from "../constants.js";

let _softSprite = null;

/** Soft circular sprite so points read as embers, not squares. */
function getSoftSprite() {
  if (_softSprite) return _softSprite;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  _softSprite = new THREE.CanvasTexture(canvas);
  _softSprite.colorSpace = THREE.SRGBColorSpace;
  return _softSprite;
}

export class AmberParticles {
  constructor(group) {
    this.group = group;
    this.mesh = null;
    this.velocities = null;
    this.masses = null;
    this.phases = null;
    this.bounds = null;
    this.enabled = true;
    this.time = 0;
    this.windHeading = Math.random() * Math.PI * 2;
  }

  get isActive() {
    return this.enabled && this.mesh !== null;
  }

  /**
   * Spawn particles inside the fitted cloud bounds.
   * @param {THREE.Box3} box World-space (or group-local) bounding box
   */
  build(box) {
    this.dispose();

    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    // Slightly expand so embers drift around the silhouette, not only inside
    const pad =
      Math.max(size.x, size.y, size.z) * AMBER_PARTICLES.boundsPadding;
    const half = size.clone().multiplyScalar(0.5).addScalar(pad);
    // Y: ground at center − half, sky extends to center + 2·half
    const yMin = center.y - half.y;
    const yMax = center.y + 2 * half.y;
    this.bounds = { center: center.clone(), half, yMin, yMax };

    const count = AMBER_PARTICLES.count;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.masses = new Float32Array(count);
    this.phases = new Float32Array(count);

    const amber = AMBER_PARTICLES.color;
    const variance = AMBER_PARTICLES.colorVariance;
    const breeze = AMBER_PARTICLES.breeze;
    const ySpan = yMax - yMin;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const x = center.x + (Math.random() * 2 - 1) * half.x;
      // Prefer mid-to-upper volume so embers float through open air
      const yNorm = Math.pow(Math.random(), 1 - AMBER_PARTICLES.heightBias);
      const y = yMin + yNorm * ySpan;
      const z = center.z + (Math.random() * 2 - 1) * half.z;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      this.velocities[i3] = 0;
      this.velocities[i3 + 1] = 0;
      this.velocities[i3 + 2] = 0;

      this.phases[i] = Math.random() * Math.PI * 2;
      this.masses[i] =
        breeze.massMin + Math.random() * (breeze.massMax - breeze.massMin);

      // Warm amber with slight per-particle tint — not applied to the model
      const warm = (Math.random() * 2 - 1) * variance;
      colors[i3] = Math.min(1, amber.r + warm * 0.05);
      colors[i3 + 1] = Math.min(1, Math.max(0, amber.g + warm * 0.08));
      colors[i3 + 2] = Math.min(1, Math.max(0, amber.b + warm * 0.04));
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: AMBER_PARTICLES.size,
      map: getSoftSprite(),
      vertexColors: true,
      sizeAttenuation: true,
      transparent: true,
      opacity: AMBER_PARTICLES.opacity,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Points(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (this.mesh) this.mesh.visible = enabled;
  }

  /** Scale point size after camera fit so embers read at any cloud scale. */
  setPointSize(size) {
    if (this.mesh) this.mesh.material.size = size;
  }

  /**
   * Integrate light-breeze physics for amber particles only.
   * Shared wind wanders and gusts; each ember responds by mass with local flutter.
   */
  update(dt) {
    if (!this.isActive || !this.bounds) return;

    this.time += dt;
    const pos = this.mesh.geometry.attributes.position;
    const arr = pos.array;
    const vel = this.velocities;
    const { center, half, yMin, yMax } = this.bounds;
    const breeze = AMBER_PARTICLES.breeze;
    const extent = Math.max(half.x, half.z);
    const ySpan = yMax - yMin;

    // --- Shared light breeze: slow heading drift + soft gust envelope ---
    const t = this.time;
    this.windHeading +=
      breeze.turnSpeed *
      dt *
      (0.55 + 0.45 * Math.sin(t * 0.17) + 0.25 * Math.sin(t * 0.41 + 1.7));

    const gust =
      0.5 +
      0.5 *
        Math.sin(t * breeze.gustFrequency * Math.PI * 2) *
        Math.sin(t * breeze.gustFrequency * 0.37 + 0.9);
    const strength =
      extent * (breeze.baseStrength + breeze.gustStrength * gust);

    const windX = Math.cos(this.windHeading) * strength;
    const windZ = Math.sin(this.windHeading) * strength;
    // Gentle lift when gusts swell, slight settle in lulls
    const windY =
      ySpan * breeze.buoyancy + strength * breeze.verticalMix * (gust - 0.35);

    const flutterAmp = extent * breeze.flutter;
    const drag = breeze.drag;

    for (let i = 0; i < this.phases.length; i++) {
      const i3 = i * 3;
      const phase = this.phases[i];
      const invMass = 1 / this.masses[i];

      // Local air noise — differs by particle and drifts with time
      const flutterT = t * (0.7 + phase * 0.15) + phase;
      const fx = Math.sin(flutterT * 1.3 + arr[i3] * 0.02) * flutterAmp;
      const fy =
        Math.cos(flutterT * 1.1 + arr[i3 + 2] * 0.02) * flutterAmp * 0.55;
      const fz =
        Math.sin(flutterT * 0.9 + arr[i3 + 1] * 0.03 + phase) * flutterAmp;

      // Accelerate toward wind + flutter; drag damps relative motion
      const ax = (windX + fx - vel[i3]) * drag * invMass;
      const ay = (windY + fy - vel[i3 + 1]) * drag * invMass;
      const az = (windZ + fz - vel[i3 + 2]) * drag * invMass;

      vel[i3] += ax * dt;
      vel[i3 + 1] += ay * dt;
      vel[i3 + 2] += az * dt;

      let x = arr[i3] + vel[i3] * dt;
      let y = arr[i3 + 1] + vel[i3 + 1] * dt;
      let z = arr[i3 + 2] + vel[i3 + 2] * dt;

      x = wrapAxis(x, center.x, half.x);
      y = wrapRange(y, yMin, yMax);
      z = wrapAxis(z, center.z, half.z);

      arr[i3] = x;
      arr[i3 + 1] = y;
      arr[i3 + 2] = z;
    }

    pos.needsUpdate = true;
  }

  dispose() {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
    this.velocities = null;
    this.masses = null;
    this.phases = null;
    this.bounds = null;
  }
}

function wrapAxis(value, center, half) {
  return wrapRange(value, center - half, center + half);
}

function wrapRange(value, min, max) {
  const span = max - min;
  if (span <= 0) return value;
  let v = value;
  while (v < min) v += span;
  while (v > max) v -= span;
  return v;
}
