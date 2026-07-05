import * as THREE from "three";

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.needsRender = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);

    this.fog = new THREE.FogExp2(0x050508, 0.0018);

    this.pointCloudGroup = new THREE.Group();
    this.scene.add(this.pointCloudGroup);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  requestRender() {
    this.needsRender = true;
  }

  setFog(enabled) {
    this.scene.fog = enabled ? this.fog : null;
    this.requestRender();
  }

  resize(camera) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestRender();
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
    this.needsRender = false;
  }
}
