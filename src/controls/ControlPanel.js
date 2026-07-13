/**
 * lil-gui debug panel for live-tweaking point cloud and camera settings.
 * Wires GUI controls to callbacks provided by App.
 */
import GUI from "three/addons/libs/lil-gui.module.min.js";
import { DEFAULT_CAMERA, RECORDING } from "../constants.js";
import { RecordingControls } from "../ui/RecordingControls.js";

export class ControlPanel {
  constructor(params, callbacks) {
    this.params = params; // Shared reactive state object (mutated by GUI and App)
    this.callbacks = callbacks;
    this.gui = null;
    // Cached controller refs so CameraController can sync orbit values back to GUI
    this.zoomDistanceController = null;
    this.rollController = null;
    this.yawController = null;
    this.pitchController = null;
    this.recordingControls = null;
    this.recordingState = "idle";
    this.recordingSupported = false;
    this.snapshotEnabled = false;
    this.pointCountController = null;
    this.viewSizeController = null;
    this.recordingStatusController = null;
    this.hoverEnabledController = null;
    this.showTooltipCoordsController = null;
    this.tooltipOptionsUnlocked = true; // False while a tooltip is visible
  }

  /** Build the GUI tree and return camera controller refs for bidirectional sync. */
  setup() {
    this.gui = new GUI({ title: "Controls", width: 280 });

    // --- Point cloud appearance ---
    this.gui
      .add(this.params, "pointSize", 0.1, 4, 0.05)
      .name("Point size")
      .onChange(() => this.callbacks.onPointSizeChange());

    this.gui
      .add(this.params, "opacity", 0.1, 1, 0.01)
      .name("Opacity")
      .onChange(() => this.callbacks.onOpacityChange());

    this.gui
      .add(this.params, "autoRotate")
      .name("Auto rotate")
      .onChange((v) => this.callbacks.onAutoRotateChange(v));

    this.gui
      .add(this.params, "fog")
      .name("Fog")
      .onChange((v) => this.callbacks.onFogChange(v));

    this.gui
      .add(this.params, "showAmberParticles")
      .name("Amber particles")
      .onChange(() => this.callbacks.onAmberParticlesChange());

    // --- Scene helpers (axes, grid, bounding box) ---
    const helpersFolder = this.gui.addFolder("Helpers");
    helpersFolder
      .add(this.params, "showAxes")
      .name("Axes")
      .onChange(() => this.callbacks.onHelpersChange());
    helpersFolder
      .add(this.params, "showGrid")
      .name("Grid")
      .onChange(() => this.callbacks.onHelpersChange());
    helpersFolder
      .add(this.params, "showBbox")
      .name("Bounding box")
      .onChange(() => this.callbacks.onHelpersChange());

    // --- Tooltip content options (disabled while a tooltip is open) ---
    const tooltipFolder = this.gui.addFolder("Tooltip");
    this.hoverEnabledController = tooltipFolder
      .add(this.params, "hoverEnabled")
      .name("Hover")
      .onChange((v) => {
        this.#syncCoordinatesController();
        this.callbacks.onHoverEnabledChange(v);
      });
    this.showTooltipCoordsController = tooltipFolder
      .add(this.params, "showTooltipCoords")
      .name("Show Coordinates")
      .onChange(() => this.callbacks.onShowTooltipCoordsChange());
    this.#syncCoordinatesController();

    // --- Camera orbit controls ---
    const cameraFolder = this.gui.addFolder("Camera");
    this.zoomDistanceController = cameraFolder
      .add(this.params, "zoomDistance", 5, 600, 1)
      .name("Distance")
      .onChange((v) => this.callbacks.onZoomDistanceChange(v));

    this.rollController = cameraFolder
      .add(this.params, "roll", -180, 180, 0.1)
      .name("Roll")
      .onChange(() => this.callbacks.onRollChange());

    this.yawController = cameraFolder
      .add(this.params, "yaw", -180, 180, 0.1)
      .name("Yaw")
      .onChange((v) => this.callbacks.onYawChange(v));

    this.pitchController = cameraFolder
      .add(this.params, "pitch", DEFAULT_CAMERA.minPitch, DEFAULT_CAMERA.maxPitch, 0.1)
      .name("Pitch")
      .onChange((v) => this.callbacks.onPitchChange(v));

    cameraFolder.add({ reset: () => this.callbacks.onCameraReset() }, "reset").name("Reset view");

    // --- Canvas video export ---
    const recordingFolder = this.gui.addFolder("Recording");
    this.recordingFpsController = recordingFolder
      .add(this.params, "recordingFps", RECORDING.fpsSteps)
      .name("Frame rate");
    this.recordingStatusController = recordingFolder
      .add(this.params, "recordingStatus")
      .name("Status")
      .disable();
    this.#mountRecordingControls(recordingFolder);
    recordingFolder.close();

    // Read-only display of loaded point count and viewport size
    this.pointCountController = this.gui
      .add(this.params, "pointCount")
      .name("Points")
      .disable();
    this.viewSizeController = this.gui
      .add(this.params, "viewSize")
      .name("View size")
      .disable();
    this.gui.close();

    return {
      zoomDistance: this.zoomDistanceController,
      roll: this.rollController,
      yaw: this.yawController,
      pitch: this.pitchController,
    };
  }

  #mountRecordingControls(folder) {
    const row = document.createElement("div");
    row.className = "controller custom";
    folder.domElement.querySelector(".children")?.appendChild(row);

    this.recordingControls = new RecordingControls({
      container: row,
      onSnapshot: () => this.callbacks.onSnapshot(),
      onRecord: () => this.callbacks.onStartRecording(),
      onPause: () => this.callbacks.onPauseRecording(),
      onStop: () => this.callbacks.onStopRecording(),
    });
  }

  /** Refresh the formatted point count label in the GUI. */
  updatePointCount(count) {
    this.params.pointCount = count.toLocaleString();
    this.pointCountController?.updateDisplay();
  }

  /** Refresh the viewport size label (W x H) in the GUI. */
  updateViewSize(width, height) {
    this.params.viewSize = `${width} x ${height}`;
    this.viewSizeController?.updateDisplay();
  }

  /** Lock tooltip options while a hover/focused tooltip is visible. */
  setTooltipOptionsEnabled(enabled) {
    this.tooltipOptionsUnlocked = enabled;
    this.hoverEnabledController?.disable(!enabled);
    this.#syncCoordinatesController();
  }

  /** Coordinates is only editable when Hover is on and no tooltip is locking the folder. */
  #syncCoordinatesController() {
    const coordsEnabled =
      this.tooltipOptionsUnlocked && this.params.hoverEnabled;
    this.showTooltipCoordsController?.disable(!coordsEnabled);
  }

  /** Sync recording controls with current capture state. */
  updateRecordingState({ state, supported }) {
    this.recordingState = state;
    this.recordingSupported = supported;

    if (!supported) {
      this.params.recordingStatus = "Unsupported";
    } else if (state === "idle" && this.params.recordingStatus === "Recording…") {
      this.params.recordingStatus = "Idle";
    } else if (state === "recording") {
      this.params.recordingStatus = "Recording…";
    } else if (state === "paused") {
      this.params.recordingStatus = "Paused";
    }

    this.recordingFpsController?.disable(state !== "idle");
    this.recordingControls?.setState({
      state,
      supported,
      snapshotEnabled: this.snapshotEnabled,
    });
    this.recordingStatusController?.updateDisplay();
  }

  /** Enable snapshot once the scene is ready to render. */
  setSnapshotEnabled(enabled) {
    this.snapshotEnabled = enabled;
    this.recordingControls?.setState({
      state: this.recordingState,
      supported: this.recordingSupported,
      snapshotEnabled: enabled,
    });
  }

  /** Update the read-only recording status label. */
  setRecordingStatus(status) {
    this.params.recordingStatus = status;
    const saving = status === "Saving…";
    const uiState =
      saving || status === "Saved" || status === "Error"
        ? "idle"
        : this.recordingState;
    this.recordingControls?.setState({
      state: uiState,
      supported: this.recordingSupported,
      snapshotEnabled: this.snapshotEnabled,
      saving,
    });
    this.recordingStatusController?.updateDisplay();
  }
}
