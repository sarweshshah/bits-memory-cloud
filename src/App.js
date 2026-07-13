/**
 * Root application orchestrator.
 * Wires together scene, camera, point cloud, interaction, UI, and the render loop.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import gsap from "gsap";

import {
  POINT_CLOUD,
  CONTROLS,
  DEFAULT_CAMERA,
  RECORDING,
  AMBER_PARTICLES,
} from "./constants.js";
import { LoadingOverlay } from "./ui/LoadingOverlay.js";
import { Tooltip } from "./ui/Tooltip.js";
import { GoToForm } from "./ui/GoToForm.js";
import { AxisIndicator } from "./ui/AxisIndicator.js";
import { SceneManager } from "./scene/SceneManager.js";
import { CameraController } from "./scene/CameraController.js";
import { HelpersManager } from "./scene/HelpersManager.js";
import { PointCloud } from "./pointcloud/PointCloud.js";
import { PointSelection } from "./pointcloud/PointSelection.js";
import { AmberParticles } from "./pointcloud/AmberParticles.js";
import { PointInteraction } from "./interaction/PointInteraction.js";
import { ControlPanel } from "./controls/ControlPanel.js";
import { VideoRecorder } from "./recording/VideoRecorder.js";
import { CanvasSnapshot } from "./recording/CanvasSnapshot.js";
import { getSelectedPoint } from "./navigation/PointUrl.js";

gsap.defaults({ duration: 0.6, ease: "power2.out" });

export class App {
  #recordingDamping;
  #lastFrameTime;

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

  /** Grab DOM refs and construct UI overlay components. */
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
      getShowCoordinates: () => this.params?.showTooltipCoords ?? true,
      onVisibilityChange: (visible) => {
        this.controlPanel?.setTooltipOptionsEnabled(!visible);
      },
    });
    this.goToForm = new GoToForm({
      form: document.getElementById("goto-form"),
      input: document.getElementById("goto-id"),
      button: document.querySelector("#goto-form button"),
    });
    this.axisIndicator = new AxisIndicator(
      document.getElementById("axis-indicator"),
    );
    this.overlay.initAnimations();
  }

  /** Shared reactive state consumed by lil-gui and subsystems. */
  #initParams() {
    this.params = {
      pointSize: 1,
      opacity: 1,
      autoRotate: true,
      fog: false,
      showAmberParticles: true,
      showAxes: false,
      showGrid: false,
      showBbox: false,
      hoverEnabled: true,
      showTooltipCoords: true,
      pointCount: "—",
      zoomDistance: DEFAULT_CAMERA.zoomDistance,
      roll: DEFAULT_CAMERA.roll,
      yaw: DEFAULT_CAMERA.yaw,
      pitch: DEFAULT_CAMERA.pitch,
      recordingFps: RECORDING.defaultFps,
      recordingStatus: "Idle",
    };
    this.tooltip.setShowCoordinates(this.params.showTooltipCoords);
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
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = CONTROLS.autoRotateSpeed;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 600;

    this.cameraController = new CameraController(
      this.camera,
      this.controls,
      this.params,
      {
        getReduceMotion: () => this.overlay.reduceMotion,
        onRenderRequest: () => this.sceneManager.requestRender(),
      },
    );
    this.cameraController.setGsap(gsap);
  }

  #initPointCloud() {
    this.pointCloud = new PointCloud(this.sceneManager.pointCloudGroup);
    this.amberParticles = new AmberParticles(this.sceneManager.pointCloudGroup);
    this.selection = new PointSelection(
      this.pointCloud,
      this.sceneManager.pointCloudGroup,
      {
        onRenderRequest: () => this.sceneManager.requestRender(),
        getReduceMotion: () => this.overlay.reduceMotion,
      },
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

  /** Build lil-gui panel and connect callbacks to subsystems. */
  #initControls() {
    this.controlPanel = new ControlPanel(this.params, {
      onPointSizeChange: () => this.#applyPointSize(),
      onOpacityChange: () => this.#applyOpacity(),
      onAutoRotateChange: (v) => {
        this.controls.autoRotate = v;
        this.sceneManager.requestRender();
      },
      onFogChange: (v) => this.sceneManager.setFog(v),
      onAmberParticlesChange: () => this.#applyAmberParticles(),
      onHelpersChange: () => this.#updateHelpers(),
      onHoverEnabledChange: (v) => {
        if (!v) this.interaction.dismissFocus();
      },
      onShowTooltipCoordsChange: () => {
        this.tooltip.setShowCoordinates(this.params.showTooltipCoords);
      },
      onZoomDistanceChange: (v) => this.cameraController.setDistance(v),
      onYawChange: (v) => this.cameraController.setYaw(v),
      onPitchChange: (v) => this.cameraController.setPitch(v),
      onRollChange: () => {
        this.cameraController.applyRoll();
        this.cameraController.logSettings("Camera (roll)");
        this.sceneManager.requestRender();
      },
      onCameraReset: () => this.cameraController.reset(),
      onSnapshot: () => this.#takeSnapshot(),
      onStartRecording: () => this.#startRecording(),
      onPauseRecording: () => this.#pauseRecording(),
      onStopRecording: () => this.#stopRecording(),
    });

    const guiControllers = this.controlPanel.setup();
    this.cameraController.setGuiControllers(guiControllers);

    this.videoRecorder = new VideoRecorder({
      canvas: this.canvas,
      onStatusChange: (status) => this.controlPanel.setRecordingStatus(status),
      onSessionEnd: () => this.#finishRecordingSession(),
    });
    this.canvasSnapshot = new CanvasSnapshot({ canvas: this.canvas });
    this.controlPanel.updateRecordingState({
      state: "idle",
      supported: this.videoRecorder.supported,
    });
  }

  async #startRecording() {
    this.sceneManager.enterCaptureMode(this.camera);
    this.#recordingDamping = this.controls.enableDamping;
    this.controls.enableDamping = false;

    await this.videoRecorder.start(this.params.recordingFps);
    if (!this.videoRecorder.isActive) {
      this.controls.enableDamping = this.#recordingDamping;
      this.sceneManager.exitCaptureMode(this.camera);
    }
    this.controlPanel.updateRecordingState({
      state: this.videoRecorder.state,
      supported: this.videoRecorder.supported,
    });
    this.sceneManager.requestRender();
  }

  #pauseRecording() {
    if (this.videoRecorder.state === "paused") {
      this.videoRecorder.resume();
    } else {
      this.videoRecorder.pause();
    }
    this.controlPanel.updateRecordingState({
      state: this.videoRecorder.state,
      supported: this.videoRecorder.supported,
    });
    this.sceneManager.requestRender();
  }

  async #stopRecording() {
    await this.videoRecorder.stop();
  }

  #finishRecordingSession() {
    this.sceneManager.exitCaptureMode(this.camera);
    if (this.#recordingDamping !== undefined) {
      this.controls.enableDamping = this.#recordingDamping;
    }
    this.controlPanel.updateRecordingState({
      state: "idle",
      supported: this.videoRecorder.supported,
    });
    this.sceneManager.requestRender();
  }

  #takeSnapshot() {
    if (!this.pointCloud.ready) return;

    const alreadyCapturing = this.videoRecorder?.isActive;
    if (!alreadyCapturing) {
      this.sceneManager.enterCaptureMode(this.camera);
    }

    if (this.params.roll !== 0) {
      this.cameraController.applyRoll();
    }
    if (this.interaction.isFocused && this.tooltip.isVisible) {
      this.interaction.updateFocusedTooltip();
    }

    this.sceneManager.render(this.camera);
    this.canvasSnapshot.capture();

    if (!alreadyCapturing) {
      this.sceneManager.exitCaptureMode(this.camera);
    }
  }

  #bindEvents() {
    window.addEventListener("resize", () => this.#onResize());
    window.addEventListener("popstate", () => this.#onPopState());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.interaction.dismissFocus();
    });
  }

  /** Handle browser back/forward for ?point= deep links. */
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

  #applyAmberParticles() {
    this.#syncAmberParticlesEnabled();
    this.sceneManager.requestRender();
  }

  #syncAmberParticlesEnabled() {
    const visible =
      this.params.showAmberParticles && !this.overlay.reduceMotion;
    this.amberParticles?.setEnabled(visible);
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
    const rect = this.canvas.getBoundingClientRect();
    this.pointCloud.setViewportRect(rect);
    this.interaction.setViewportRect(rect);
  }

  /** Load PLY, fit camera, enable UI, and restore deep-linked point if present. */
  async #loadPointCloud() {
    try {
      const head = await fetch(POINT_CLOUD.url, { method: "HEAD" });
      if (!head.ok) {
        throw new Error(
          head.status === 404
            ? "Point cloud file missing. Run npm run generate."
            : `Point cloud unavailable (${head.status}).`,
        );
      }
    } catch (err) {
      console.error(err);
      this.overlay.setStatus(
        err.message?.includes("generate")
          ? err.message
          : "Failed to load point cloud.",
      );
      return;
    }

    this.pointCloud.load(POINT_CLOUD.url, {
      onProgress: (pct) => {
        this.overlay.setProgress(pct);
        this.overlay.setStatus(`Loading… ${(pct * 100).toFixed(0)}%`);
      },
      onLoaded: () => {
        try {
          this.cameraController.fitToObject(
            this.sceneManager.pointCloudGroup,
            DEFAULT_CAMERA,
          );
          this.#updateHelpers();

          // Scale base point size relative to cloud extent
          this.pointCloud.basePointSize =
            this.cameraController.boundingRadius * 0.0018;
          this.#applyPointSize();

          // Amber ember overlay — drifts through the volume; model colors unchanged
          const box = new THREE.Box3().setFromObject(
            this.sceneManager.pointCloudGroup,
          );
          this.amberParticles.build(box);
          this.amberParticles.setPointSize(
            this.cameraController.boundingRadius * AMBER_PARTICLES.sizeFactor,
          );
          this.#applyAmberParticles();

          this.controlPanel.updatePointCount(this.pointCloud.pointCount);
          this.controlPanel.setSnapshotEnabled(true);
          this.goToForm.enable(this.pointCloud.pointCount);
          this.overlay.hide();
          this.sceneManager.requestRender();

          // Deep link: ?point=N
          const index = getSelectedPoint();
          if (index !== null) {
            this.interaction.goToPoint(index, { fromHistory: true });
          }
        } catch (err) {
          console.error(err);
          this.overlay.setStatus("Failed to initialize viewer.");
        }
      },
      onError: (err) => {
        console.error(err);
        this.overlay.setStatus("Failed to load point cloud.");
      },
    });
  }

  /**
   * Demand-driven render loop.
   * Only draws when controls move, camera animates, selection blinks, focus is
   * active, or amber particles are drifting.
   */
  #animate() {
    requestAnimationFrame(() => this.#animate());

    const now = performance.now();
    const isCapturing = this.videoRecorder?.isCapturing;
    const recordFrame = isCapturing && this.videoRecorder.needsFrame(now);

    const dt = this.#lastFrameTime
      ? Math.min(0.05, (now - this.#lastFrameTime) * 0.001)
      : 0.016;
    this.#lastFrameTime = now;

    if (this.amberParticles) {
      this.#syncAmberParticlesEnabled();
      if (this.amberParticles.isActive) {
        this.amberParticles.update(dt);
      }
    }

    const controlsActive =
      this.controls.enabled &&
      !this.cameraController.isAnimating &&
      this.controls.update();
    if (this.params.roll !== 0) {
      this.cameraController.applyRoll();
    }

    const shouldRender =
      recordFrame ||
      this.sceneManager.needsRender ||
      controlsActive ||
      this.cameraController.isAnimating ||
      this.interaction.isFocused ||
      this.selection.hasBlink ||
      this.amberParticles?.isActive ||
      this.videoRecorder?.state === "paused";

    if (shouldRender) {
      if (this.interaction.isFocused && this.tooltip.isVisible) {
        this.interaction.updateFocusedTooltip();
      }
      this.sceneManager.render(this.camera);
      this.axisIndicator.update(this.camera);
      if (recordFrame) {
        this.videoRecorder.captureFrame();
      }
    }
  }
}
