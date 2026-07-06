/**
 * Camera orbit, roll, zoom, and animated transitions.
 * Bridges OrbitControls with lil-gui sliders and GSAP tweens for focus animations.
 */
import * as THREE from "three";
import { DEFAULT_CAMERA, SELECTION } from "../constants.js";

// Reusable scratch vectors (avoid GC pressure during orbit math)
const _offset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();
const _pointWorld = new THREE.Vector3();

export class CameraController {
  constructor(camera, controls, params, { getReduceMotion, onRenderRequest }) {
    this.camera = camera;
    this.controls = controls;
    this.params = params;
    this.getReduceMotion = getReduceMotion;
    this.onRenderRequest = onRenderRequest;

    this.boundingRadius = 1; // Set by fitToObject; drives zoom limits
    this.defaultCameraPos = new THREE.Vector3();
    this.defaultTarget = new THREE.Vector3();
    this.defaultRoll = 0;
    this.defaultYaw = 0;
    this.defaultPitch = 0;
    this.cameraTween = null; // Active GSAP tween, if any

    // lil-gui controller refs for bidirectional sync
    this.zoomDistanceController = null;
    this.rollController = null;
    this.yawController = null;
    this.pitchController = null;

    controls.addEventListener("end", () => this.logSettings("Camera (orbit)"));
    controls.addEventListener("change", () => {
      this.syncZoomDistance();
      this.syncYaw();
      this.syncPitch();
      this.onRenderRequest();
    });
  }

  /** Store GUI controller refs so orbit changes can update slider displays. */
  setGuiControllers({ zoomDistance, roll, yaw, pitch }) {
    this.zoomDistanceController = zoomDistance;
    this.rollController = roll;
    this.yawController = yaw;
    this.pitchController = pitch;
  }

  /** Derive spherical orbit angles from the current camera offset vector. */
  #readOrbitAngles() {
    _offset.copy(this.camera.position).sub(this.controls.target);
    const distance = _offset.length();
    if (distance === 0) return null;

    return {
      distance,
      yaw: THREE.MathUtils.radToDeg(Math.atan2(_offset.x, _offset.z)),
      pitch: THREE.MathUtils.radToDeg(
        Math.asin(THREE.MathUtils.clamp(_offset.y / distance, -1, 1))
      ),
    };
  }

  /** Position the camera at the given yaw/pitch/distance around the orbit target. */
  #applyOrbitAngles(yawDeg, pitchDeg, distance) {
    const yawRad = THREE.MathUtils.degToRad(yawDeg);
    const pitchRad = THREE.MathUtils.degToRad(pitchDeg);
    const horiz = distance * Math.cos(pitchRad);
    _offset.x = horiz * Math.sin(yawRad);
    _offset.y = distance * Math.sin(pitchRad);
    _offset.z = horiz * Math.cos(yawRad);
    this.camera.position.copy(this.controls.target).add(_offset);
    this.controls.update();
    this.applyRoll();
  }

  getYaw() {
    return this.#readOrbitAngles()?.yaw ?? 0;
  }

  getPitch() {
    return this.#readOrbitAngles()?.pitch ?? 0;
  }

  /** Snapshot of camera state for logging and deep-link debugging. */
  getSettings() {
    _offset.copy(this.camera.position).sub(this.controls.target);
    const distance = _offset.length();
    const yaw = this.getYaw();
    const pitch = this.getPitch();

    return {
      position: {
        x: +this.camera.position.x.toFixed(DEFAULT_CAMERA.coordDecimals),
        y: +this.camera.position.y.toFixed(DEFAULT_CAMERA.coordDecimals),
        z: +this.camera.position.z.toFixed(DEFAULT_CAMERA.coordDecimals),
      },
      target: {
        x: +this.controls.target.x.toFixed(DEFAULT_CAMERA.coordDecimals),
        y: +this.controls.target.y.toFixed(DEFAULT_CAMERA.coordDecimals),
        z: +this.controls.target.z.toFixed(DEFAULT_CAMERA.coordDecimals),
      },
      distance: +distance.toFixed(2),
      zoomDistance: +this.params.zoomDistance.toFixed(2),
      roll: +this.params.roll.toFixed(2),
      yaw: +yaw.toFixed(2),
      pitch: +pitch.toFixed(2),
      fov: this.camera.fov,
    };
  }

  logSettings(label = "Camera") {
    console.log(`[${label}]`, this.getSettings());
  }

  /**
   * Apply camera roll by rotating the up vector around the view direction.
   * Resets to world-up when roll is zero.
   */
  applyRoll() {
    if (this.params.roll === 0) {
      this.camera.up.set(0, 1, 0);
      return;
    }

    const rollRad = THREE.MathUtils.degToRad(this.params.roll);
    this.camera.getWorldDirection(_forward);

    _right.crossVectors(_forward, _up.set(0, 1, 0));
    if (_right.lengthSq() < 1e-10) {
      // Looking straight up/down — pick an arbitrary right vector
      _right.set(1, 0, 0);
    } else {
      _right.normalize();
    }

    _up.crossVectors(_right, _forward).normalize();
    _up.applyAxisAngle(_forward, rollRad);
    this.camera.up.copy(_up);
  }

  /** Apply a full camera settings object (position, target, roll, fov). */
  applySettings(settings) {
    this.camera.fov = settings.fov;
    this.camera.updateProjectionMatrix();

    this.controls.target.copy(settings.target);
    this.camera.position.copy(settings.position);
    this.camera.lookAt(this.controls.target);
    this.controls.update();

    this.params.zoomDistance = settings.zoomDistance;
    this.params.roll = settings.roll;

    this.defaultCameraPos.copy(settings.position);
    this.defaultTarget.copy(settings.target);
    this.defaultRoll = settings.roll;

    this.applyRoll();
    this.onRenderRequest();
  }

  /**
   * Frame the point cloud and store default pose for reset.
   * Returns bounding radius for helper sizing and point size scaling.
   */
  fitToObject(object, settings) {
    _box.setFromObject(object);
    _box.getSize(_size);
    this.boundingRadius = _size.length() * 0.5;

    this.defaultRoll = settings.roll;

    this.applySettings(settings);
    this.setDistance(settings.zoomDistance);
    if (settings.yaw != null) {
      this.setYaw(settings.yaw);
    }
    if (settings.pitch != null) {
      this.setPitch(settings.pitch);
    }
    this.defaultCameraPos.copy(this.camera.position);
    this.defaultTarget.copy(this.controls.target);
    this.defaultYaw = this.params.yaw;
    this.defaultPitch = this.params.pitch;
    this.syncYaw();
    this.syncPitch();
    this.updateZoomLimits();
    this.logSettings("Camera (initial)");

    return this.boundingRadius;
  }

  /** Restore camera to the pose captured during fitToObject. */
  reset() {
    this.params.roll = this.defaultRoll;
    this.rollController?.updateDisplay();
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.copy(this.defaultTarget);
    this.controls.update();
    this.applyRoll();
    this.syncZoomDistance();
    this.syncYaw();
    this.syncPitch();
    this.logSettings("Camera (reset)");
    this.onRenderRequest();
  }

  getDistance() {
    return this.camera.position.distanceTo(this.controls.target);
  }

  /** Set orbit distance while preserving current direction; clamps to min/max. */
  setDistance(distance) {
    const clamped = THREE.MathUtils.clamp(
      distance,
      this.controls.minDistance,
      this.controls.maxDistance
    );
    _offset.copy(this.camera.position).sub(this.controls.target);
    if (_offset.lengthSq() === 0) {
      _offset.set(0, 0, 1);
    }
    _offset.setLength(clamped);
    this.camera.position.copy(this.controls.target).add(_offset);
    this.controls.update();
    this.applyRoll();
    this.params.zoomDistance = clamped;
    this.logSettings("Camera (distance)");
    this.onRenderRequest();
  }

  /** Update a GUI param and refresh its display without triggering onChange. */
  #syncGuiParam(key, value, controller) {
    if (this.params[key] === value) return;
    this.params[key] = value;
    controller?.updateDisplay();
  }

  syncZoomDistance() {
    this.#syncGuiParam(
      "zoomDistance",
      Math.round(this.getDistance()),
      this.zoomDistanceController
    );
  }

  syncYaw() {
    this.#syncGuiParam(
      "yaw",
      +this.getYaw().toFixed(1),
      this.yawController
    );
  }

  syncPitch() {
    this.#syncGuiParam(
      "pitch",
      +this.getPitch().toFixed(1),
      this.pitchController
    );
  }

  setYaw(yawDeg) {
    const orbit = this.#readOrbitAngles();
    if (!orbit) return;

    this.#applyOrbitAngles(yawDeg, orbit.pitch, orbit.distance);
    this.params.yaw = yawDeg;
    this.logSettings("Camera (yaw)");
    this.onRenderRequest();
  }

  setPitch(pitchDeg) {
    const orbit = this.#readOrbitAngles();
    if (!orbit) return;

    this.#applyOrbitAngles(orbit.yaw, pitchDeg, orbit.distance);
    this.params.pitch = pitchDeg;
    this.logSettings("Camera (pitch)");
    this.onRenderRequest();
  }

  /** Scale min/max zoom based on the point cloud bounding radius. */
  updateZoomLimits() {
    this.controls.minDistance = Math.max(1, this.boundingRadius * 0.02);
    this.controls.maxDistance = Math.max(50, this.boundingRadius * 4);
    this.zoomDistanceController
      ?.min(this.controls.minDistance)
      .max(this.controls.maxDistance);
    this.syncZoomDistance();
  }

  /** Capture current camera state for focus-dismiss restore. */
  captureState() {
    return {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      roll: this.params.roll,
      zoomDistance: this.params.zoomDistance,
      fov: this.camera.fov,
    };
  }

  killTween() {
    if (this.cameraTween) {
      this.cameraTween.kill();
      this.cameraTween = null;
    }
  }

  /** Smoothly tween camera to a target state via GSAP. */
  animateTo(state, onComplete, onUpdate) {
    const gsap = this._gsap;
    this.killTween();

    const duration = this.getReduceMotion() ? 0 : 0.85;
    const tweenState = {
      px: this.camera.position.x,
      py: this.camera.position.y,
      pz: this.camera.position.z,
      tx: this.controls.target.x,
      ty: this.controls.target.y,
      tz: this.controls.target.z,
      roll: this.params.roll,
    };

    this.cameraTween = gsap.to(tweenState, {
      px: state.position.x,
      py: state.position.y,
      pz: state.position.z,
      tx: state.target.x,
      ty: state.target.y,
      tz: state.target.z,
      roll: state.roll,
      duration,
      ease: "power2.inOut",
      onUpdate: () => {
        this.camera.position.set(tweenState.px, tweenState.py, tweenState.pz);
        this.controls.target.set(tweenState.tx, tweenState.ty, tweenState.tz);
        this.params.roll = tweenState.roll;
        this.rollController?.updateDisplay();
        this.applyRoll();
        this.syncZoomDistance();
        this.syncYaw();
        this.syncPitch();
        onUpdate?.();
        this.onRenderRequest();
      },
      onComplete: () => {
        this.cameraTween = null;
        onComplete?.();
      },
    });
  }

  /**
   * Compute a camera pose that frames a world-space point at focus distance.
   * When pointCloud context is provided, picks the least-adjusted unobstructed view.
   */
  getSnapState(
    worldPosition,
    { pointCloud, pointIndex, pointSizeMultiplier } = {}
  ) {
    _pointWorld.copy(worldPosition);
    const snapDistance = THREE.MathUtils.clamp(
      SELECTION.focusDistance,
      this.controls.minDistance,
      this.controls.maxDistance
    );

    _offset.copy(this.camera.position).sub(this.controls.target);
    if (_offset.lengthSq() < 1e-6) {
      _offset.set(0.35, 0.25, 1);
    }
    _offset.setLength(snapDistance);

    const candidates = this.#buildViewCandidates(_offset);
    const canCheckOcclusion =
      pointCloud && pointIndex != null && pointSizeMultiplier != null;

    for (const offset of candidates) {
      _forward.copy(_pointWorld).add(offset);
      if (
        canCheckOcclusion &&
        pointCloud.isOccludedFrom(
          pointIndex,
          _forward,
          _pointWorld,
          pointSizeMultiplier
        )
      ) {
        continue;
      }

      return {
        position: _pointWorld.clone().add(offset),
        target: _pointWorld.clone(),
        roll: this.params.roll,
        zoomDistance: snapDistance,
        fov: this.camera.fov,
      };
    }

    return {
      position: _pointWorld.clone().add(candidates[0]),
      target: _pointWorld.clone(),
      roll: this.params.roll,
      zoomDistance: snapDistance,
      fov: this.camera.fov,
    };
  }

  /** Candidate camera offsets ordered from current view to larger rotations. */
  #buildViewCandidates(baseOffset) {
    const distance = baseOffset.length();
    const candidates = [baseOffset.clone()];

    _up.set(0, 1, 0);
    _right.crossVectors(baseOffset, _up);
    if (_right.lengthSq() < 1e-10) {
      _right.set(1, 0, 0);
    } else {
      _right.normalize();
    }

    const yawSteps = [15, -15, 30, -30, 45, -45, 60, -60, 90, -90];
    for (const deg of yawSteps) {
      candidates.push(
        baseOffset
          .clone()
          .applyAxisAngle(_up, THREE.MathUtils.degToRad(deg))
          .setLength(distance)
      );
    }

    const pitchSteps = [20, -20, 35, -35, 50, -50];
    for (const deg of pitchSteps) {
      candidates.push(
        baseOffset
          .clone()
          .applyAxisAngle(_right, THREE.MathUtils.degToRad(deg))
          .setLength(distance)
      );
    }

    return candidates;
  }

  /** Zero out pending OrbitControls deltas (prevents drift after unfreezing). */
  #clearControlDeltas() {
    this.controls._sphericalDelta?.set(0, 0, 0);
    this.controls._panOffset?.set(0, 0, 0);
  }

  get isAnimating() {
    return this.cameraTween !== null;
  }

  /** Disable orbit controls during focus; re-enable with auto-rotate on dismiss. */
  setViewFrozen(frozen, autoRotate) {
    this.controls.enabled = !frozen;
    if (frozen) {
      this.controls.autoRotate = false;
      this.#clearControlDeltas();
    } else {
      this.#clearControlDeltas();
      this.controls.autoRotate = autoRotate;
    }
  }

  setGsap(gsap) {
    this._gsap = gsap;
  }
}
