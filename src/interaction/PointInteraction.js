/**
 * Pointer hover, click-to-focus, and go-to-point interaction.
 * Coordinates raycasting, selection visuals, camera animation, tooltips, and URL state.
 */
import * as THREE from "three";
import { INTERACTION } from "../constants.js";
import {
  setSelectedPoint,
  clearSelectedPoint,
  replaceSelectedPoint,
} from "../navigation/PointUrl.js";

export class PointInteraction {
  constructor({
    canvas,
    pointCloud,
    selection,
    camera,
    cameraController,
    tooltip,
    goToForm,
    params,
    onRenderRequest,
  }) {
    this.canvas = canvas;
    this.pointCloud = pointCloud;
    this.selection = selection;
    this.camera = camera;
    this.cameraController = cameraController;
    this.tooltip = tooltip;
    this.goToForm = goToForm;
    this.params = params;
    this.onRenderRequest = onRenderRequest;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(); // Normalized device coordinates
    this.hoveredIndex = -1;
    this.pointerDownPos = null; // Used to distinguish clicks from drags
    this.focusSession = null; // Active focus state with saved camera for dismiss
  }

  get isFocused() {
    return this.focusSession !== null;
  }

  setup() {
    this.canvas.addEventListener("pointermove", (e) => this.#onPointerMove(e));
    this.canvas.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
    this.canvas.addEventListener("pointerup", (e) => this.#onPointerUp(e));
    this.canvas.addEventListener("pointerleave", () => this.#hideHoverTooltip());
  }

  /**
   * Exit focus mode: restore camera, clear selection, update URL.
   * Skips URL push when triggered by browser back/forward.
   */
  dismissFocus({ fromHistory = false } = {}) {
    if (!this.focusSession) return;

    const saved = this.focusSession.savedCamera;
    this.focusSession = null;
    this.goToForm.clearInvalid();
    this.tooltip.hide();
    this.hoveredIndex = -1;
    this.selection.reset();

    if (!fromHistory) {
      clearSelectedPoint();
    }

    this.cameraController.animateTo(saved, () => {
      this.cameraController.setViewFrozen(false, this.params.autoRotate);
      this.cameraController.logSettings("Selection dismissed");
    });
  }

  /**
   * Navigate to a point by index (from form submit or URL deep link).
   * Validates range and syncs the go-to form input.
   */
  goToPoint(rawId, { fromHistory = false } = {}) {
    if (!this.pointCloud.ready) return;

    const count = this.pointCloud.pointCount;
    const index = Number.parseInt(String(rawId).trim(), 10);

    if (!Number.isFinite(index) || index < 0 || index >= count) {
      this.goToForm.markInvalid();
      if (fromHistory) {
        replaceSelectedPoint(null);
      }
      return;
    }

    if (fromHistory && this.focusSession?.index === index) {
      this.goToForm.setValue(index);
      return;
    }

    this.goToForm.clearInvalid();
    this.goToForm.setValue(index);
    this.#enterSelection(index, { fromHistory });
    this.cameraController.logSettings("Camera (go to point)");
  }

  /** Reposition the focused tooltip after the camera has settled. */
  updateFocusedTooltip() {
    if (!this.focusSession || !this.tooltip.isVisible) return;
    const { x, y } = this.pointCloud.projectToScreen(
      this.focusSession.index,
      this.camera,
      this.canvas
    );
    const anchorRadius = this.pointCloud.getHighlightScreenRadius(
      this.focusSession.index,
      this.camera,
      this.canvas,
      this.params.pointSize
    );
    this.tooltip.updatePosition(x, y, { anchorRadius });
  }

  /** Raycast hit radius scales with rendered point size. */
  #getRaycastThreshold() {
    return this.pointCloud.basePointSize * this.params.pointSize * 2;
  }

  /** Convert a pointer event to NDC (-1 to 1) for raycasting. */
  #updatePointerFromEvent(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  #raycast() {
    return this.pointCloud.raycast(
      this.raycaster,
      this.pointer,
      this.camera,
      this.#getRaycastThreshold()
    );
  }

  /** Show the dismissible tooltip anchored to the selected point on screen. */
  #showFocusedTooltip(index) {
    this.hoveredIndex = index;
    const screen = this.pointCloud.projectToScreen(
      index,
      this.camera,
      this.canvas
    );
    const anchorRadius = this.pointCloud.getHighlightScreenRadius(
      index,
      this.camera,
      this.canvas,
      this.params.pointSize
    );
    this.tooltip.showAt(
      screen.x,
      screen.y,
      this.pointCloud.getPointData(index),
      {
        dismissible: true,
        onDismiss: () => this.dismissFocus(),
        anchorRadius,
      }
    );
    this.onRenderRequest();
  }

  /**
   * Enter focus mode: save camera, highlight point, freeze orbit, animate in.
   * Updates URL unless navigating via history.
   */
  #enterSelection(index, { fromHistory = false } = {}) {
    if (!this.focusSession) {
      this.focusSession = {
        index,
        savedCamera: this.cameraController.captureState(),
      };
    } else {
      this.focusSession.index = index;
    }

    if (!fromHistory) {
      setSelectedPoint(index);
    }

    this.selection.select(index, this.params.pointSize);
    this.cameraController.setViewFrozen(true, this.params.autoRotate);
    this.canvas.style.cursor = "default";

    this.tooltip.hide();

    const worldPos = this.pointCloud.getWorldPosition(index);
    const snapState = this.cameraController.getSnapState(worldPos, {
      pointCloud: this.pointCloud,
      pointIndex: index,
      pointSizeMultiplier: this.params.pointSize,
    });
    this.cameraController.animateTo(snapState, () => {
      this.#showFocusedTooltip(index);
    });
  }

  #hideHoverTooltip() {
    if (this.focusSession) return;
    this.tooltip.hide();
    this.hoveredIndex = -1;
    this.canvas.style.cursor = "";
  }

  /** Hover tooltip — disabled while a point is focused. */
  #onPointerMove(event) {
    if (!this.pointCloud.ready || this.focusSession) return;

    this.#updatePointerFromEvent(event);
    const hits = this.#raycast();

    if (hits.length === 0) {
      if (this.hoveredIndex !== -1) this.#hideHoverTooltip();
      return;
    }

    const index = hits[0].index;
    if (index === this.hoveredIndex) {
      this.tooltip.updatePosition(event.clientX, event.clientY);
      return;
    }

    this.hoveredIndex = index;
    this.canvas.style.cursor = "pointer";
    this.tooltip.showAt(
      event.clientX,
      event.clientY,
      this.pointCloud.getPointData(index)
    );
    this.onRenderRequest();
  }

  #onPointerDown(event) {
    if (!this.pointCloud.ready) return;
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  }

  /**
   * Click handler: dismiss focus, or select a point if pointer didn't drag.
   * Drag threshold prevents accidental selection after orbit panning.
   */
  #onPointerUp(event) {
    if (!this.pointCloud.ready || !this.pointerDownPos) return;

    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;

    if (dx * dx + dy * dy > INTERACTION.clickThresholdPx * INTERACTION.clickThresholdPx) return;

    if (this.focusSession) {
      this.dismissFocus();
      return;
    }

    this.#updatePointerFromEvent(event);
    const hits = this.#raycast();

    if (hits.length > 0) {
      this.#enterSelection(hits[0].index);
    } else {
      this.selection.reset();
    }
  }
}
