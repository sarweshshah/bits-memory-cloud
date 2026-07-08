/**
 * Three.js scene, renderer, and on-demand render loop state.
 * Uses demand-driven rendering — only draws when something changes.
 */
import * as THREE from "three";
import {
  DEFAULT_SCENE,
  getCapturePixelRatio,
  getDisplayPixelRatio,
} from "../constants.js";

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.needsRender = true; // Flag consumed by App's animation loop
    this.captureMode = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x050508);

    // Fog is toggled on/off via setFog; pre-created for reuse
    this.fog = new THREE.FogExp2(0x050508, 0.0018);

    // All point cloud geometry lives in this group for easy bounding-box queries
    this.pointCloudGroup = new THREE.Group();
    this.scene.add(this.pointCloudGroup);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.#applyDisplayPixelRatio();
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = DEFAULT_SCENE.toneMappingExposure;
  }

  /** Mark the next animation frame as needing a draw call. */
  requestRender() {
    this.needsRender = true;
  }

  /** Switch to full retina backing resolution for export. */
  enterCaptureMode(camera) {
    if (this.captureMode) return;
    this.captureMode = true;
    this.renderer.setPixelRatio(getCapturePixelRatio());
    this.resize(camera);
  }

  /** Restore interactive viewport resolution after export. */
  exitCaptureMode(camera) {
    if (!this.captureMode) return;
    this.captureMode = false;
    this.#applyDisplayPixelRatio();
    this.resize(camera);
  }

  setFog(enabled) {
    this.scene.fog = enabled ? this.fog : null;
    this.requestRender();
  }

  setBackground(hex) {
    this.scene.background.setHex(hex);
    this.fog.color.setHex(hex);
    this.requestRender();
  }

  /** Update camera aspect and renderer size on window resize. */
  resize(camera) {
    if (!this.captureMode) {
      this.#applyDisplayPixelRatio();
    }

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.requestRender();
  }

  render(camera) {
    this.renderer.render(this.scene, camera);
    this.needsRender = false;
  }

  #applyDisplayPixelRatio() {
    this.renderer.setPixelRatio(getDisplayPixelRatio());
  }
}
