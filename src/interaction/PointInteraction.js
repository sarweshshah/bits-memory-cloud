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
    // Cached by App on resize — avoids getBoundingClientRect on hot paths
    this.viewportRect = { left: 0, top: 0, width: 1, height: 1 };
    this.pendingPointerEvent = null; // Latest pointermove queued for rAF
    this.hoverRafId = 0; // Non-zero while a hover raycast is scheduled
  }

  get isFocused() {
    return this.focusSession !== null;
  }

  /** Refresh the cached canvas CSS rect used for pointer NDC conversion. */
  setViewportRect(rect) {
    this.viewportRect = rect;
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
    this.selection.clearHover();
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
  }

  /** Reposition the focused tooltip when the view changes. */
  updateFocusedTooltip() {
    if (!this.focusSession || !this.tooltip.isVisible) return;
    const { x, y } = this.pointCloud.projectToScreen(
      this.focusSession.index,
      this.camera
    );
    const anchorRadius = this.pointCloud.getHighlightScreenRadius(
      this.focusSession.index,
      this.camera,
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
    const rect = this.viewportRect;
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
    const screen = this.pointCloud.projectToScreen(index, this.camera);
    const anchorRadius = this.pointCloud.getHighlightScreenRadius(
      index,
      this.camera,
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
   * Enter focus mode: save camera, highlight point, freeze orbit, show tooltip.
   * Updates URL unless navigating via history.
   */
  #enterSelection(index, { fromHistory = false } = {}) {
    this.#cancelHoverRaycast();
    this.selection.clearHover();

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
    this.#showFocusedTooltip(index);
  }

  #hideHoverTooltip() {
    if (this.focusSession) return;
    this.#cancelHoverRaycast();
    this.tooltip.hide();
    this.hoveredIndex = -1;
    this.selection.clearHover();
    this.canvas.style.cursor = "";
  }

  /** Drop any queued hover raycast (e.g. on pointer leave or focus enter). */
  #cancelHoverRaycast() {
    if (this.hoverRafId) {
      cancelAnimationFrame(this.hoverRafId);
      this.hoverRafId = 0;
    }
    this.pendingPointerEvent = null;
  }

  /**
   * Coalesce pointermove raycasts to one per animation frame.
   * Browsers fire many pointermoves between paints; scanning the full cloud
   * for each is wasteful — keep the latest event and process it once.
   */
  #onPointerMove(event) {
    if (!this.pointCloud.ready || this.focusSession) return;

    this.pendingPointerEvent = event;
    if (this.hoverRafId) return;

    this.hoverRafId = requestAnimationFrame(() => {
      this.hoverRafId = 0;
      const pending = this.pendingPointerEvent;
      this.pendingPointerEvent = null;
      if (pending) this.#processHover(pending);
    });
  }

  /** Hover tooltip — disabled while a point is focused. */
  #processHover(event) {
    if (!this.pointCloud.ready || this.focusSession) return;

    this.#updatePointerFromEvent(event);
    const hits = this.#raycast();

    if (hits.length === 0) {
      if (this.hoveredIndex !== -1) {
        this.tooltip.hide();
        this.hoveredIndex = -1;
        this.selection.clearHover();
        this.canvas.style.cursor = "";
      }
      return;
    }

    const index = hits[0].index;
    if (index === this.hoveredIndex) {
      this.tooltip.updatePosition(event.clientX, event.clientY);
      return;
    }

    this.hoveredIndex = index;
    this.canvas.style.cursor = "pointer";
    this.selection.hover(index, this.params.pointSize);
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
      this.hoveredIndex = -1;
      this.selection.clearHover();
      this.selection.reset();
      this.canvas.style.cursor = "";
      this.tooltip.hide();
    }
  }
}
