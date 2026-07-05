import * as THREE from "three";
import { COORD_DECIMALS, SNAP_MIN_DISTANCE } from "../constants.js";

const _offset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
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
    this.defaultCameraPos = null;
    this.defaultTarget = null;
    this.defaultRoll = 0;
    this.cameraTween = null;

    this.zoomDistanceController = null;
    this.rollController = null;

    controls.addEventListener("end", () => this.logSettings("Camera (orbit)"));
    controls.addEventListener("change", () => {
      this.syncZoomDistance();
      this.onRenderRequest();
    });
  }

  setGuiControllers({ zoomDistance, roll }) {
    this.zoomDistanceController = zoomDistance;
    this.rollController = roll;
  }

  getSettings() {
    _offset.copy(this.camera.position).sub(this.controls.target);
    const distance = _offset.length();
    const yaw = THREE.MathUtils.radToDeg(Math.atan2(_offset.x, _offset.z));

    return {
      position: {
        x: +this.camera.position.x.toFixed(COORD_DECIMALS),
        y: +this.camera.position.y.toFixed(COORD_DECIMALS),
        z: +this.camera.position.z.toFixed(COORD_DECIMALS),
      },
      target: {
        x: +this.controls.target.x.toFixed(COORD_DECIMALS),
        y: +this.controls.target.y.toFixed(COORD_DECIMALS),
        z: +this.controls.target.z.toFixed(COORD_DECIMALS),
      },
      distance: +distance.toFixed(2),
      zoomDistance: +this.params.zoomDistance.toFixed(2),
      roll: +this.params.roll.toFixed(2),
      yaw: +yaw.toFixed(2),
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
    _box.getCenter(_center);
    _box.getSize(_size);
    this.boundingRadius = _size.length() * 0.5;

    object.position.sub(_center);

    this.defaultCameraPos = settings.position.clone();
    this.defaultTarget = settings.target.clone();
    this.defaultRoll = settings.roll;

    this.applySettings(settings);
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
        this.controls.update();
        this.syncZoomDistance();
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
    const snapDistance = Math.max(
      this.controls.minDistance * 2.5,
      this.boundingRadius * 0.055,
      SNAP_MIN_DISTANCE
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

  setViewFrozen(frozen, autoRotate) {
    this.controls.enabled = !frozen;
    if (frozen) {
      this.controls.autoRotate = false;
    } else {
      this.controls.autoRotate = autoRotate;
    }
  }

  setGsap(gsap) {
    this._gsap = gsap;
  }
}
