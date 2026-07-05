import * as THREE from "three";

const _box = new THREE.Box3();

export class HelpersManager {
  constructor(scene) {
    this.scene = scene;
    this.axes = null;
    this.grid = null;
    this.bbox = null;
  }

  update({ showAxes, showGrid, showBbox, boundingRadius, pointCloudGroup }) {
    const size = boundingRadius * 2;

    if (this.axes) {
      this.scene.remove(this.axes);
      this.axes.dispose();
      this.axes = null;
    }
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.dispose();
      this.grid = null;
    }
    if (this.bbox) {
      this.scene.remove(this.bbox);
      this.bbox = null;
    }

    if (showAxes) {
      this.axes = new THREE.AxesHelper(size * 0.5);
      this.scene.add(this.axes);
    }

    if (showGrid) {
      this.grid = new THREE.GridHelper(size, 20, 0x444466, 0x222233);
      this.scene.add(this.grid);
    }

    if (showBbox && pointCloudGroup) {
      this.bbox = new THREE.Box3Helper(
        _box.setFromObject(pointCloudGroup),
        0xa78bfa
      );
      this.scene.add(this.bbox);
    }
  }
}
