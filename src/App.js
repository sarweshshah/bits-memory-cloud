import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import gsap from "gsap";

import {
  PLY_URL,
  AUTO_ROTATE_SPEED,
  DEFAULT_CAMERA,
} from "./constants.js";
import { LoadingOverlay } from "./ui/LoadingOverlay.js";
import { Tooltip } from "./ui/Tooltip.js";
import { GoToForm } from "./ui/GoToForm.js";
import { SceneManager } from "./scene/SceneManager.js";
import { CameraController } from "./scene/CameraController.js";
import { HelpersManager } from "./scene/HelpersManager.js";
import { PointCloud } from "./pointcloud/PointCloud.js";
import { PointSelection } from "./pointcloud/PointSelection.js";
import { PointInteraction } from "./interaction/PointInteraction.js";
import { ControlPanel } from "./controls/ControlPanel.js";
import { getSelectedPoint } from "./navigation/PointUrl.js";

gsap.defaults({ duration: 0.6, ease: "power2.out" });

export class App {
  constructor() {
    this.#initDom();
    this.#initParams();
    this.#initScene();
    this.#initCamera();
    this.#initPointCloud();
    this.#initInteraction();
    this.#initControls();
    this.#bindEvents();
    this.#start();
  }

  #initDom() {
    this.canvas = document.getElementById("canvas");
    this.overlay = new LoadingOverlay({
      overlay: document.getElementById("overlay"),
      statusEl: document.getElementById("status"),
      progressFill: document.getElementById("progress-fill"),
      overlayTitle: document.querySelector("#overlay h1"),
      progressBar: document.getElementById("progress-bar"),
    });
    this.tooltip = new Tooltip(document.getElementById("point-tooltip"), {
      getReduceMotion: () => this.overlay.reduceMotion,
    });
    this.goToForm = new GoToForm({
      form: document.getElementById("goto-form"),
      input: document.getElementById("goto-id"),
      button: document.querySelector("#goto-form button"),
    });
    this.overlay.initAnimations();
  }

  #initParams() {
    this.params = {
      pointSize: 1,
      opacity: 1,
      autoRotate: false,
      fog: false,
      showAxes: false,
      showGrid: false,
      showBbox: false,
      pointCount: "—",
      zoomDistance: DEFAULT_CAMERA.zoomDistance,
      roll: DEFAULT_CAMERA.roll,
      yaw: 0,
      pitch: 0,
    };
  }

  #initScene() {
    this.sceneManager = new SceneManager(this.canvas);
    this.helpers = new HelpersManager(this.sceneManager.scene);
  }

  #initCamera() {
    this.camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA.fov, 1, 0.1, 2000);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 600;

    this.cameraController = new CameraController(
      this.camera,
      this.controls,
      this.params,
      {
        getReduceMotion: () => this.overlay.reduceMotion,
        onRenderRequest: () => this.sceneManager.requestRender(),
      }
    );
    this.cameraController.setGsap(gsap);
  }

  #initPointCloud() {
    this.pointCloud = new PointCloud(this.sceneManager.pointCloudGroup);
    this.selection = new PointSelection(
      this.pointCloud,
      this.sceneManager.pointCloudGroup,
      {
        onRenderRequest: () => this.sceneManager.requestRender(),
        getReduceMotion: () => this.overlay.reduceMotion,
      }
    );
  }

  #initInteraction() {
    this.interaction = new PointInteraction({
      canvas: this.canvas,
      pointCloud: this.pointCloud,
      selection: this.selection,
      camera: this.camera,
      cameraController: this.cameraController,
      tooltip: this.tooltip,
      goToForm: this.goToForm,
      params: this.params,
      onRenderRequest: () => this.sceneManager.requestRender(),
    });
    this.interaction.setup();
    this.goToForm.setup((id) => this.interaction.goToPoint(id));
  }

  #initControls() {
    this.controlPanel = new ControlPanel(this.params, {
      onPointSizeChange: () => this.#applyPointSize(),
      onOpacityChange: () => this.#applyOpacity(),
      onAutoRotateChange: (v) => {
        this.controls.autoRotate = v;
        this.sceneManager.requestRender();
      },
      onFogChange: (v) => this.sceneManager.setFog(v),
      onHelpersChange: () => this.#updateHelpers(),
      onZoomDistanceChange: (v) => this.cameraController.setDistance(v),
      onYawChange: (v) => this.cameraController.setYaw(v),
      onPitchChange: (v) => this.cameraController.setPitch(v),
      onRollChange: () => {
        this.cameraController.applyRoll();
        this.cameraController.logSettings("Camera (roll)");
        this.sceneManager.requestRender();
      },
      onCameraReset: () => this.cameraController.reset(),
    });

    const guiControllers = this.controlPanel.setup();
    this.cameraController.setGuiControllers(guiControllers);
  }

  #bindEvents() {
    window.addEventListener("resize", () => this.#onResize());
    window.addEventListener("popstate", () => this.#onPopState());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.interaction.dismissFocus();
    });
  }

  #onPopState() {
    if (!this.pointCloud.ready) return;

    const index = getSelectedPoint();
    if (index === null) {
      if (this.interaction.isFocused) {
        this.interaction.dismissFocus({ fromHistory: true });
      }
      return;
    }

    this.interaction.goToPoint(index, { fromHistory: true });
  }

  #start() {
    this.#onResize();
    this.#loadPointCloud();
    this.#animate();
  }

  #applyPointSize() {
    this.pointCloud.applyPointSize(this.params.pointSize);
    this.selection.updateHighlightSize(this.params.pointSize);
    this.sceneManager.requestRender();
  }

  #applyOpacity() {
    this.pointCloud.applyOpacity(this.params.opacity);
    this.sceneManager.requestRender();
  }

  #updateHelpers() {
    this.helpers.update({
      showAxes: this.params.showAxes,
      showGrid: this.params.showGrid,
      showBbox: this.params.showBbox,
      boundingRadius: this.cameraController.boundingRadius,
      pointCloudGroup: this.sceneManager.pointCloudGroup,
    });
    this.sceneManager.requestRender();
  }

  #onResize() {
    this.sceneManager.resize(this.camera);
  }

  #loadPointCloud() {
    this.pointCloud.load(PLY_URL, {
      onProgress: (pct) => {
        this.overlay.setProgress(pct);
        this.overlay.setStatus(`Loading… ${(pct * 100).toFixed(0)}%`);
      },
      onLoaded: () => {
        this.cameraController.fitToObject(
          this.sceneManager.pointCloudGroup,
          DEFAULT_CAMERA
        );
        this.#updateHelpers();

        this.pointCloud.basePointSize =
          this.cameraController.boundingRadius * 0.0018;
        this.#applyPointSize();

        this.controlPanel.updatePointCount(this.pointCloud.pointCount);
        this.goToForm.enable(this.pointCloud.pointCount);
        this.overlay.hide();
        this.sceneManager.requestRender();

        const index = getSelectedPoint();
        if (index !== null) {
          this.interaction.goToPoint(index, { fromHistory: true });
        }
      },
      onError: (err) => {
        console.error(err);
        this.overlay.setStatus("Failed to load point cloud.");
      },
    });
  }

  #animate() {
    requestAnimationFrame(() => this.#animate());

    const controlsActive = this.controls.update();
    if (this.params.roll !== 0) {
      this.cameraController.applyRoll();
    }

    const shouldRender =
      this.sceneManager.needsRender ||
      controlsActive ||
      this.interaction.isFocused ||
      this.selection.hasBlink;

    if (shouldRender) {
      if (this.interaction.isFocused && this.tooltip.isVisible) {
        this.interaction.updateFocusedTooltip();
      }
      this.sceneManager.render(this.camera);
    }
  }
}
