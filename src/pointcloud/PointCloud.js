/**
 * Loads, renders, and queries a PLY point cloud.
 * Handles vertex color normalization, sizing, opacity, raycasting, and screen projection.
 */
import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import { POINT_CLOUD, SELECTION } from "../constants.js";

// Module-level scratch vectors to avoid per-frame allocations
const _pointWorld = new THREE.Vector3();
const _projected = new THREE.Vector3();
const _viewPos = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _toPoint = new THREE.Vector3();
const _closest = new THREE.Vector3();

export class PointCloud {
  constructor(group) {
    this.group = group;
    this.mesh = null;
    this.originalColors = null; // Snapshot of vertex colors for selection reset
    this.basePointSize = 0.12; // Recalculated after fit-to-object
    this.ready = false;
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
    if (!this.mesh) return;
    const size = this.basePointSize * multiplier;
    this.mesh.material.size = size;
  }

  applyOpacity(opacity) {
    if (!this.mesh) return;
    this.mesh.material.opacity = opacity;
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

  /** Transform a point's local position to world space. */
  getWorldPosition(index) {
    const pos = this.geometry.attributes.position;
    _pointWorld.set(pos.getX(index), pos.getY(index), pos.getZ(index));
    return this.mesh.localToWorld(_pointWorld.clone());
  }

  /** Project a point index to CSS pixel coordinates relative to the viewport. */
  projectToScreen(index, camera, canvas) {
    return this.projectWorldToScreen(this.getWorldPosition(index), camera, canvas);
  }

  projectWorldToScreen(world, camera, canvas) {
    _projected.copy(world).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (_projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  /**
   * On-screen radius of the selection highlight (px), matching Three.js point sizing.
   * Includes a small buffer so the tooltip clears the soft sprite edge.
   */
  getHighlightScreenRadius(index, camera, canvas, pointSizeMultiplier) {
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
      (materialSize * canvas.clientHeight) / (2 * Math.tan(vFov / 2) * viewZ);

    return diameterPx * 0.5 + SELECTION.highlightScreenPadding;
  }

  /** Raycast against the point cloud; threshold scales with point size. */
  raycast(raycaster, pointer, camera, threshold) {
    if (!this.mesh) return [];
    raycaster.params.Points.threshold = threshold;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(this.mesh);
  }

  /**
   * True when another point sits between the eye and the selected point
   * close enough to block the view along the sight line.
   */
  isOccludedFrom(index, eye, target, pointSizeMultiplier) {
    const positions = this.geometry?.attributes.position;
    if (!positions || !this.mesh) return false;

    const pos = positions;
    const sx = pos.getX(index);
    const sy = pos.getY(index);
    const sz = pos.getZ(index);
    const searchRadiusSq =
      SELECTION.occlusionSearchRadius * SELECTION.occlusionSearchRadius;
    const occluderRadius =
      this.basePointSize *
      pointSizeMultiplier *
      SELECTION.occlusionPointRadiusScale;

    _rayDir.copy(target).sub(eye);
    const rayLength = _rayDir.length();
    if (rayLength < 1e-6) return false;
    _rayDir.divideScalar(rayLength);

    const matrixWorld = this.mesh.matrixWorld;
    const count = pos.count;

    for (let i = 0; i < count; i++) {
      if (i === index) continue;

      const dx = pos.getX(i) - sx;
      const dy = pos.getY(i) - sy;
      const dz = pos.getZ(i) - sz;
      if (dx * dx + dy * dy + dz * dz > searchRadiusSq) continue;

      _pointWorld.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(matrixWorld);
      _toPoint.copy(_pointWorld).sub(eye);
      const along = _toPoint.dot(_rayDir);
      if (along <= occluderRadius || along >= rayLength - occluderRadius) continue;

      _closest.copy(eye).addScaledVector(_rayDir, along);
      if (_closest.distanceTo(_pointWorld) < occluderRadius) return true;
    }

    return false;
  }
}
