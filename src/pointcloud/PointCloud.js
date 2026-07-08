/**
 * Loads, renders, and queries a PLY point cloud.
 * Handles vertex color normalization, sizing, opacity, raycasting, and screen projection.
 */
import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { POINT_CLOUD, SELECTION } from "../constants.js";
import { getAnimatedPointSize } from "./PointAnimation.js";

// Module-level scratch vectors to avoid per-frame allocations
const _pointWorld = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _viewPos = new THREE.Vector3();
const _emptyRect = { left: 0, top: 0, width: 1, height: 1 };

export class PointCloud {
  constructor(group) {
    this.group = group;
    this.mesh = null;
    this.originalColors = null; // Snapshot of vertex colors for selection reset
    this.basePointSize = 0.12; // Recalculated after fit-to-object
    this.pointSizeMultiplier = 1;
    this.ready = false;
    // Cached by App on resize — avoids getBoundingClientRect on hot paths
    this.viewportRect = _emptyRect;
  }

  /** Refresh the cached canvas CSS rect used for screen projection. */
  setViewportRect(rect) {
    this.viewportRect = rect;
  }

  get geometry() {
    return this.mesh?.geometry ?? null;
  }

  get pointCount() {
    return this.geometry?.attributes.position.count ?? 0;
  }

  /** Fetch and build the THREE.Points mesh from a PLY URL. */
  load(url, { onProgress, onLoaded, onError }) {
    const loader = new PLYLoader();

    loader.load(
      url,
      (geometry) => {
        geometry.computeBoundingBox();
        this.#ensureVertexColors(geometry);

        const material = new THREE.PointsMaterial({
          size: 0.12,
          vertexColors: true,
          sizeAttenuation: true,
          transparent: true,
          opacity: 1,
          depthWrite: true,
        });
        material.color.setScalar(POINT_CLOUD.colorBrightness);

        this.mesh = new THREE.Points(geometry, material);
        this.mesh.frustumCulled = true;
        this.group.add(this.mesh);

        // Keep a copy so PointSelection can restore colors on dismiss
        this.originalColors = new Float32Array(geometry.attributes.color.array);
        this.ready = true;
        onLoaded?.(this);
      },
      (xhr) => {
        if (xhr.total) {
          onProgress?.(xhr.loaded / xhr.total);
        }
      },
      (err) => onError?.(err)
    );
  }

  /**
   * Ensure geometry has normalized (0–1) vertex colors.
   * Creates neutral gray colors if the PLY lacks a color attribute.
   */
  #ensureVertexColors(geometry) {
    if (!geometry.attributes.color) {
      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      colors.fill(0.85);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return;
    }

    const colors = geometry.attributes.color;
    // Already normalized if all channels are ≤ 1
    if (colors.array[0] <= 1 && colors.array[1] <= 1 && colors.array[2] <= 1) {
      return;
    }

    // Convert 0–255 byte colors to 0–1 floats
    const arr = colors.array;
    for (let i = 0; i < arr.length; i++) {
      arr[i] *= 1 / 255;
    }
    colors.needsUpdate = true;
  }

  applyPointSize(multiplier) {
    this.pointSizeMultiplier = multiplier;
    if (!this.mesh) return;
    this.mesh.material.size = this.basePointSize * multiplier;
  }

  applyOpacity(opacity) {
    if (!this.mesh) return;
    this.mesh.material.opacity = opacity;
  }

  updatePointAnimation(
    elapsedSeconds,
    { reduceMotion = false, disablePulse = false } = {}
  ) {
    if (!this.mesh) return false;

    this.mesh.material.size = getAnimatedPointSize(
      this.basePointSize,
      this.pointSizeMultiplier,
      elapsedSeconds,
      {
        amplitude: POINT_CLOUD.pulseAmplitude,
        frequencyHz: POINT_CLOUD.pulseFrequencyHz,
        enabled: !reduceMotion && !disablePulse,
      }
    );

    return !reduceMotion && !disablePulse;
  }

  /** Return point index and local-space coordinates. */
  getPointData(index) {
    const pos = this.geometry.attributes.position;
    return {
      id: index,
      x: pos.getX(index),
      y: pos.getY(index),
      z: pos.getZ(index),
    };
  }

  /**
   * Transform a point's local position to world space.
   * Returns a shared scratch vector — copy immediately if retaining the result.
   */
  getWorldPosition(index) {
    const pos = this.geometry.attributes.position;
    _pointWorld.set(pos.getX(index), pos.getY(index), pos.getZ(index));
    return this.mesh.localToWorld(_pointWorld);
  }

  /** Project a point index to CSS pixel coordinates relative to the viewport. */
  projectToScreen(index, camera) {
    return this.projectWorldToScreen(this.getWorldPosition(index), camera);
  }

  projectWorldToScreen(world, camera) {
    _projected.copy(world).project(camera);
    const rect = this.viewportRect;
    return {
      x: (_projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  /**
   * On-screen radius of the selection highlight (px), matching Three.js point sizing.
   * Includes a small buffer so the tooltip clears the soft sprite edge.
   */
  getHighlightScreenRadius(index, camera, pointSizeMultiplier) {
    const world = this.getWorldPosition(index);
    const materialSize =
      this.basePointSize *
      pointSizeMultiplier *
      SELECTION.highlightSizeMultiplier;

    _viewPos.copy(world).applyMatrix4(camera.matrixWorldInverse);
    const viewZ = Math.abs(_viewPos.z);
    if (viewZ < 1e-6) return materialSize;

    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const diameterPx =
      (materialSize * this.viewportRect.height) /
      (2 * Math.tan(vFov / 2) * viewZ);

    return diameterPx * 0.5 + SELECTION.highlightScreenPadding;
  }

  /** Raycast against the point cloud; threshold scales with point size. */
  raycast(raycaster, pointer, camera, threshold) {
    if (!this.mesh) return [];
    raycaster.params.Points.threshold = threshold;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(this.mesh);
  }
}
