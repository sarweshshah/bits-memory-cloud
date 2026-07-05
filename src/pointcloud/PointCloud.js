import * as THREE from "three";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";

const _pointWorld = new THREE.Vector3();
const _projected = new THREE.Vector3();

export class PointCloud {
  constructor(group) {
    this.group = group;
    this.mesh = null;
    this.originalColors = null;
    this.basePointSize = 0.12;
    this.ready = false;
  }

  get geometry() {
    return this.mesh?.geometry ?? null;
  }

  get pointCount() {
    return this.geometry?.attributes.position.count ?? 0;
  }

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

        this.mesh = new THREE.Points(geometry, material);
        this.mesh.frustumCulled = true;
        this.group.add(this.mesh);

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

  #ensureVertexColors(geometry) {
    if (!geometry.attributes.color) {
      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      colors.fill(0.85);
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      return;
    }

    const colors = geometry.attributes.color;
    if (colors.array[0] <= 1 && colors.array[1] <= 1 && colors.array[2] <= 1) {
      return;
    }

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

  getPointData(index) {
    const pos = this.geometry.attributes.position;
    return {
      id: index,
      x: pos.getX(index),
      y: pos.getY(index),
      z: pos.getZ(index),
    };
  }

  getWorldPosition(index) {
    const pos = this.geometry.attributes.position;
    _pointWorld.set(pos.getX(index), pos.getY(index), pos.getZ(index));
    return this.mesh.localToWorld(_pointWorld.clone());
  }

  projectToScreen(index, camera, canvas) {
    const world = this.getWorldPosition(index);
    _projected.copy(world).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (_projected.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-_projected.y * 0.5 + 0.5) * rect.height + rect.top,
    };
  }

  raycast(raycaster, pointer, camera, threshold) {
    if (!this.mesh) return [];
    raycaster.params.Points.threshold = threshold;
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObject(this.mesh);
  }
}
