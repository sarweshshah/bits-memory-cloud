import * as THREE from "three";
import { CLICK_THRESHOLD_PX } from "../constants.js";
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
    this.pointer = new THREE.Vector2();
    this.hoveredIndex = -1;
    this.pointerDownPos = null;
    this.focusSession = null;
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
    this.#enterSelection(index, { animate: true, fromHistory });
    this.cameraController.logSettings("Camera (go to point)");
  }

  updateFocusedTooltip() {
    if (!this.focusSession) return;
    const { x, y } = this.pointCloud.projectToScreen(
      this.focusSession.index,
      this.camera,
      this.canvas
    );
    this.tooltip.updatePosition(x, y);
  }

  #getRaycastThreshold() {
    return this.pointCloud.basePointSize * this.params.pointSize * 2;
  }

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

  #showFocusedTooltip(index) {
    this.hoveredIndex = index;
    const screen = this.pointCloud.projectToScreen(
      index,
      this.camera,
      this.canvas
    );
    this.tooltip.showAt(
      screen.x,
      screen.y,
      this.pointCloud.getPointData(index),
      { dismissible: true, onDismiss: () => this.dismissFocus() }
    );
    this.onRenderRequest();
  }

  #enterSelection(index, { animate = false, fromHistory = false } = {}) {
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

    this.#showFocusedTooltip(index);

    if (animate) {
      const worldPos = this.pointCloud.getWorldPosition(index);
      const snapState = this.cameraController.getSnapState(worldPos);
      this.cameraController.animateTo(
        snapState,
        () => this.onRenderRequest(),
        () => this.updateFocusedTooltip()
      );
    } else {
      this.onRenderRequest();
    }
  }

  #hideHoverTooltip() {
    if (this.focusSession) return;
    this.tooltip.hide();
    this.hoveredIndex = -1;
    this.canvas.style.cursor = "";
  }

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

  #onPointerUp(event) {
    if (!this.pointCloud.ready || !this.pointerDownPos) return;

    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    this.pointerDownPos = null;

    if (dx * dx + dy * dy > CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) return;

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
