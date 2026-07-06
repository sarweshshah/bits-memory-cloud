import * as THREE from "three";
import { DEFAULT_CAMERA, SELECTION } from "../constants.js";

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

    this.boundingRadius = 1;
    this.defaultCameraPos = new THREE.Vector3();
    this.defaultTarget = new THREE.Vector3();
    this.defaultRoll = 0;
    this.defaultYaw = 0;
    this.defaultPitch = 0;
    this.cameraTween = null;

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

  setGuiControllers({ zoomDistance, roll, yaw, pitch }) {
    this.zoomDistanceController = zoomDistance;
    this.rollController = roll;
    this.yawController = yaw;
    this.pitchController = pitch;
  }

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

  applyRoll() {
    if (this.params.roll === 0) {
      this.camera.up.set(0, 1, 0);
      return;
    }

    const rollRad = THREE.MathUtils.degToRad(this.params.roll);
    this.camera.getWorldDirection(_forward);

    _right.crossVectors(_forward, _up.set(0, 1, 0));
    if (_right.lengthSq() < 1e-10) {
      _right.set(1, 0, 0);
    } else {
      _right.normalize();
    }

    _up.crossVectors(_right, _forward).normalize();
    _up.applyAxisAngle(_forward, rollRad);
    this.camera.up.copy(_up);
  }

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

  syncZoomDistance() {
    this.params.zoomDistance = this.getDistance();
    this.zoomDistanceController?.updateDisplay();
  }

  syncYaw() {
    this.params.yaw = this.getYaw();
    this.yawController?.updateDisplay();
  }

  syncPitch() {
    this.params.pitch = this.getPitch();
    this.pitchController?.updateDisplay();
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

  updateZoomLimits() {
    this.controls.minDistance = Math.max(1, this.boundingRadius * 0.02);
    this.controls.maxDistance = Math.max(50, this.boundingRadius * 4);
    this.zoomDistanceController
      ?.min(this.controls.minDistance)
      .max(this.controls.maxDistance);
    this.syncZoomDistance();
  }

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

  getSnapState(worldPosition) {
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
    _offset.normalize().multiplyScalar(snapDistance);

    return {
      position: _pointWorld.clone().add(_offset),
      target: _pointWorld.clone(),
      roll: this.params.roll,
      zoomDistance: snapDistance,
      fov: this.camera.fov,
    };
  }

  #clearControlDeltas() {
    this.controls._sphericalDelta?.set(0, 0, 0);
    this.controls._panOffset?.set(0, 0, 0);
  }

  get isAnimating() {
    return this.cameraTween !== null;
  }

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
