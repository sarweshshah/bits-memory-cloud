import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";
import gsap from "gsap";

const PLY_URL = "/cloud_web.ply";
const AUTO_ROTATE_SPEED = 0.35;

const DEFAULT_CAMERA = {
  fov: 50,
  position: new THREE.Vector3(-132.866, 45.298, 172.081),
  target: new THREE.Vector3(-26.208, -3.883, -15.818),
  zoomDistance: 220,
  roll: 0,
};

const _offset = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();
const _size = new THREE.Vector3();
const _box = new THREE.Box3();

const canvas = document.getElementById("canvas");
const overlay = document.getElementById("overlay");
const statusEl = document.getElementById("status");
const progressFill = document.getElementById("progress-fill");
const overlayTitle = overlay.querySelector("h1");
const progressBar = document.getElementById("progress-bar");
const tooltip = document.getElementById("point-tooltip");
const gotoForm = document.getElementById("goto-form");
const gotoInput = document.getElementById("goto-id");
const gotoButton = gotoForm.querySelector("button");

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const CLICK_THRESHOLD_PX = 5;
const DIM_FACTOR = 0.3;
const SELECT_ACCENT = { r: 1, g: 0.97, b: 0.82 };
const SELECT_BRIGHTEN = 1.4;
const SELECT_MIX = 0.5;
const HIGHLIGHT_SIZE_MULTIPLIER = 5;
const SNAP_MIN_DISTANCE = 130;
const COORD_DECIMALS = 1;

gsap.defaults({ duration: 0.6, ease: "power2.out" });

const motionMedia = gsap.matchMedia();
let reduceMotion = false;

motionMedia.add(
  { reduceMotion: "(prefers-reduced-motion: reduce)" },
  (context) => {
    reduceMotion = context.conditions.reduceMotion;

    gsap.set(progressFill, { scaleX: 0, transformOrigin: "left center" });

    if (reduceMotion) {
      gsap.set([overlayTitle, statusEl, progressBar], { autoAlpha: 1, y: 0 });
      return;
    }

    gsap.from(overlayTitle, { autoAlpha: 0, y: 14, duration: 0.7, delay: 0.1 });
    gsap.from(statusEl, { autoAlpha: 0, y: 10, duration: 0.55, delay: 0.22 });
    gsap.from(progressBar, {
      autoAlpha: 0,
      scaleX: 0.4,
      duration: 0.5,
      delay: 0.34,
      transformOrigin: "center center",
    });
  }
);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);

const fog = new THREE.FogExp2(0x050508, 0.0018);

const camera = new THREE.PerspectiveCamera(DEFAULT_CAMERA.fov, 1, 0.1, 2000);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotate = false;
controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
controls.minDistance = 5;
controls.maxDistance = 600;
controls.addEventListener("end", () => logCameraSettings("Camera (orbit)"));
controls.addEventListener("change", syncZoomDistance);

const pointCloudGroup = new THREE.Group();
scene.add(pointCloudGroup);

const helpers = {
  axes: null,
  grid: null,
  bbox: null,
};

const params = {
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
};

const _pointWorld = new THREE.Vector3();
const _projected = new THREE.Vector3();

let pointCloud = null;
let selectionHighlight = null;
let selectionBlinkTween = null;
let originalColors = null;
let selectedIndex = null;
let hoveredIndex = -1;
let pointCloudReady = false;
let pointerDownPos = null;
let focusSession = null;
let cameraTween = null;
let boundingRadius = 1;
let basePointSize = 0.12;
let defaultCameraPos = DEFAULT_CAMERA.position.clone();
let defaultTarget = DEFAULT_CAMERA.target.clone();
let defaultRoll = DEFAULT_CAMERA.roll;
let gui = null;
let zoomDistanceController = null;
let rollController = null;
let needsRender = true;

function requestRender() {
  needsRender = true;
}

function applyPointSize() {
  if (!pointCloud) return;
  const size = basePointSize * params.pointSize;
  pointCloud.material.size = size;
  if (selectionHighlight) {
    selectionHighlight.material.size = size * HIGHLIGHT_SIZE_MULTIPLIER;
  }
  requestRender();
}

function applyOpacity() {
  if (!pointCloud) return;
  pointCloud.material.opacity = params.opacity;
  requestRender();
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setProgress(pct) {
  gsap.to(progressFill, {
    scaleX: Math.min(1, pct),
    duration: reduceMotion ? 0 : 0.25,
    ease: "power1.out",
    overwrite: true,
  });
}

function hideOverlay() {
  gsap.to(overlay, {
    autoAlpha: 0,
    duration: reduceMotion ? 0 : 0.85,
    ease: "power2.inOut",
    onComplete: () => {
      overlay.style.visibility = "hidden";
    },
  });
}

function getCameraSettings() {
  _offset.copy(camera.position).sub(controls.target);
  const distance = _offset.length();
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(_offset.x, _offset.z));

  return {
    position: {
      x: +camera.position.x.toFixed(COORD_DECIMALS),
      y: +camera.position.y.toFixed(COORD_DECIMALS),
      z: +camera.position.z.toFixed(COORD_DECIMALS),
    },
    target: {
      x: +controls.target.x.toFixed(COORD_DECIMALS),
      y: +controls.target.y.toFixed(COORD_DECIMALS),
      z: +controls.target.z.toFixed(COORD_DECIMALS),
    },
    distance: +distance.toFixed(2),
    zoomDistance: +params.zoomDistance.toFixed(2),
    roll: +params.roll.toFixed(2),
    yaw: +yaw.toFixed(2),
    fov: camera.fov,
  };
}

function logCameraSettings(label = "Camera") {
  console.log(`[${label}]`, getCameraSettings());
}

function applyRoll() {
  if (params.roll === 0) {
    camera.up.set(0, 1, 0);
    return;
  }

  const rollRad = THREE.MathUtils.degToRad(params.roll);
  camera.getWorldDirection(_forward);

  _right.crossVectors(_forward, _up.set(0, 1, 0));
  if (_right.lengthSq() < 1e-10) {
    _right.set(1, 0, 0);
  } else {
    _right.normalize();
  }

  _up.crossVectors(_right, _forward).normalize();
  _up.applyAxisAngle(_forward, rollRad);
  camera.up.copy(_up);
}

function applyCameraSettings(settings) {
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();

  controls.target.copy(settings.target);
  camera.position.copy(settings.position);
  camera.lookAt(controls.target);
  controls.update();

  params.zoomDistance = settings.zoomDistance;
  params.roll = settings.roll;

  defaultCameraPos.copy(settings.position);
  defaultTarget.copy(settings.target);
  defaultRoll = settings.roll;

  applyRoll();
  requestRender();
}

function fitCameraToObject(object) {
  _box.setFromObject(object);
  _box.getCenter(_center);
  _box.getSize(_size);
  boundingRadius = _size.length() * 0.5;

  object.position.sub(_center);

  applyCameraSettings(DEFAULT_CAMERA);

  updateZoomLimits();
  updateHelpers();
  logCameraSettings("Camera (initial)");
}

function updateHelpers() {
  const size = boundingRadius * 2;

  if (helpers.axes) {
    scene.remove(helpers.axes);
    helpers.axes.dispose();
    helpers.axes = null;
  }
  if (helpers.grid) {
    scene.remove(helpers.grid);
    helpers.grid.dispose();
    helpers.grid = null;
  }
  if (helpers.bbox) {
    scene.remove(helpers.bbox);
    helpers.bbox = null;
  }

  if (params.showAxes) {
    helpers.axes = new THREE.AxesHelper(size * 0.5);
    scene.add(helpers.axes);
  }

  if (params.showGrid) {
    helpers.grid = new THREE.GridHelper(size, 20, 0x444466, 0x222233);
    scene.add(helpers.grid);
  }

  if (params.showBbox && pointCloud) {
    helpers.bbox = new THREE.Box3Helper(
      _box.setFromObject(pointCloudGroup),
      0xa78bfa
    );
    scene.add(helpers.bbox);
  }

  requestRender();
}

function resetCamera() {
  params.roll = defaultRoll;
  rollController?.updateDisplay();
  camera.up.set(0, 1, 0);
  camera.position.copy(defaultCameraPos);
  controls.target.copy(defaultTarget);
  controls.update();
  applyRoll();
  syncZoomDistance();
  logCameraSettings("Camera (reset)");
  requestRender();
}

function getCameraDistance() {
  return camera.position.distanceTo(controls.target);
}

function setCameraDistance(distance) {
  const clamped = THREE.MathUtils.clamp(
    distance,
    controls.minDistance,
    controls.maxDistance
  );
  _offset.copy(camera.position).sub(controls.target);
  if (_offset.lengthSq() === 0) {
    _offset.set(0, 0, 1);
  }
  _offset.setLength(clamped);
  camera.position.copy(controls.target).add(_offset);
  controls.update();
  applyRoll();
  params.zoomDistance = clamped;
  logCameraSettings("Camera (distance)");
  requestRender();
}

function syncZoomDistance() {
  params.zoomDistance = getCameraDistance();
  zoomDistanceController?.updateDisplay();
}

function updateZoomLimits() {
  controls.minDistance = Math.max(1, boundingRadius * 0.02);
  controls.maxDistance = Math.max(50, boundingRadius * 4);
  zoomDistanceController
    ?.min(controls.minDistance)
    .max(controls.maxDistance);
  syncZoomDistance();
}

function getRaycastThreshold() {
  return basePointSize * params.pointSize * 2;
}

function updatePointerFromEvent(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function getPointData(index) {
  const pos = pointCloud.geometry.attributes.position;
  return {
    id: index,
    x: pos.getX(index),
    y: pos.getY(index),
    z: pos.getZ(index),
  };
}

function getPointWorldPosition(index) {
  const pos = pointCloud.geometry.attributes.position;
  _pointWorld.set(pos.getX(index), pos.getY(index), pos.getZ(index));
  return pointCloud.localToWorld(_pointWorld);
}

function projectPointToScreen(index) {
  getPointWorldPosition(index);
  _projected.copy(_pointWorld).project(camera);
  const rect = canvas.getBoundingClientRect();
  return {
    x: (_projected.x * 0.5 + 0.5) * rect.width + rect.left,
    y: (-_projected.y * 0.5 + 0.5) * rect.height + rect.top,
  };
}

function buildTooltipHtml(data, { dismissible = false } = {}) {
  return `
    ${dismissible ? '<button type="button" class="tooltip-dismiss" aria-label="Dismiss">×</button>' : ""}
    <div class="tooltip-id">#${data.id}</div>
    <div class="tooltip-coords">
      x: ${data.x.toFixed(COORD_DECIMALS)} &nbsp; y: ${data.y.toFixed(COORD_DECIMALS)} &nbsp; z: ${data.z.toFixed(COORD_DECIMALS)}
    </div>
  `;
}

function showTooltipAt(screenX, screenY, data, { dismissible = false } = {}) {
  tooltip.hidden = false;
  tooltip.classList.toggle("focused", dismissible);
  tooltip.innerHTML = buildTooltipHtml(data, { dismissible });
  tooltip.style.left = `${screenX + 14}px`;
  tooltip.style.top = `${screenY + 14}px`;

  if (dismissible) {
    tooltip.querySelector(".tooltip-dismiss")?.addEventListener("click", dismissFocus);
  }
}

function showTooltip(event, data) {
  showTooltipAt(event.clientX, event.clientY, data);
}

function updateFocusedTooltipPosition() {
  if (!focusSession) return;
  const { x, y } = projectPointToScreen(focusSession.index);
  tooltip.style.left = `${x + 14}px`;
  tooltip.style.top = `${y + 14}px`;
}

function hideTooltip() {
  if (focusSession) return;
  tooltip.hidden = true;
  tooltip.classList.remove("focused");
  hoveredIndex = -1;
  canvas.style.cursor = "";
}

function captureCameraState() {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    roll: params.roll,
    zoomDistance: params.zoomDistance,
    fov: camera.fov,
  };
}

function killCameraTween() {
  if (cameraTween) {
    cameraTween.kill();
    cameraTween = null;
  }
}

function animateCameraTo(state, onComplete) {
  killCameraTween();

  const duration = reduceMotion ? 0 : 0.85;
  const tweenState = {
    px: camera.position.x,
    py: camera.position.y,
    pz: camera.position.z,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z,
    roll: params.roll,
  };

  cameraTween = gsap.to(tweenState, {
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
      camera.position.set(tweenState.px, tweenState.py, tweenState.pz);
      controls.target.set(tweenState.tx, tweenState.ty, tweenState.tz);
      params.roll = tweenState.roll;
      rollController?.updateDisplay();
      applyRoll();
      controls.update();
      syncZoomDistance();
      updateFocusedTooltipPosition();
      requestRender();
    },
    onComplete: () => {
      cameraTween = null;
      onComplete?.();
    },
  });
}

function getSnapCameraState(index) {
  getPointWorldPosition(index);
  const snapDistance = Math.max(
    controls.minDistance * 2.5,
    boundingRadius * 0.055,
    SNAP_MIN_DISTANCE
  );

  _offset.copy(camera.position).sub(controls.target);
  if (_offset.lengthSq() < 1e-6) {
    _offset.set(0.35, 0.25, 1);
  }
  _offset.normalize().multiplyScalar(snapDistance);

  return {
    position: _pointWorld.clone().add(_offset),
    target: _pointWorld.clone(),
    roll: params.roll,
    zoomDistance: snapDistance,
    fov: camera.fov,
  };
}

function showFocusedTooltip(index) {
  hoveredIndex = index;
  const screen = projectPointToScreen(index);
  showTooltipAt(screen.x, screen.y, getPointData(index), { dismissible: true });
  requestRender();
}

function setViewFrozen(frozen) {
  controls.enabled = !frozen;
  canvas.style.cursor = frozen ? "default" : "";
  if (frozen) {
    controls.autoRotate = false;
  } else {
    controls.autoRotate = params.autoRotate;
  }
}

function enterSelection(index, { animate = false } = {}) {
  if (!focusSession) {
    focusSession = { index, savedCamera: captureCameraState() };
  } else {
    focusSession.index = index;
  }

  applyPointSelection(index);
  setViewFrozen(true);

  const finish = () => {
    showFocusedTooltip(index);
    requestRender();
  };

  if (animate) {
    animateCameraTo(getSnapCameraState(index), finish);
  } else {
    finish();
  }
}

function dismissFocus() {
  if (!focusSession) return;

  const saved = focusSession.savedCamera;
  focusSession = null;
  gotoInput.classList.remove("invalid");
  tooltip.hidden = true;
  tooltip.classList.remove("focused");
  hoveredIndex = -1;
  resetPointSelection();

  animateCameraTo(saved, () => {
    setViewFrozen(false);
    logCameraSettings("Selection dismissed");
  });
}

function goToPoint(rawId) {
  if (!pointCloudReady) return;

  const count = pointCloud.geometry.attributes.position.count;
  const index = Number.parseInt(String(rawId).trim(), 10);

  if (!Number.isFinite(index) || index < 0 || index >= count) {
    gotoInput.classList.add("invalid");
    return;
  }

  gotoInput.classList.remove("invalid");
  gotoInput.value = String(index);
  enterSelection(index, { animate: true });
  logCameraSettings("Camera (go to point)");
}

function setupGoToForm() {
  gotoForm.addEventListener("submit", (event) => {
    event.preventDefault();
    goToPoint(gotoInput.value);
  });

  gotoInput.addEventListener("input", () => {
    gotoInput.classList.remove("invalid");
  });
}

function enableGoToForm(maxIndex) {
  gotoInput.disabled = false;
  gotoButton.disabled = false;
  gotoInput.max = maxIndex - 1;
}

function raycastPoints() {
  if (!pointCloud) return [];
  raycaster.params.Points.threshold = getRaycastThreshold();
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(pointCloud);
}

function getSelectedColor(r, g, b) {
  const brightR = Math.min(1, r * SELECT_BRIGHTEN);
  const brightG = Math.min(1, g * SELECT_BRIGHTEN);
  const brightB = Math.min(1, b * SELECT_BRIGHTEN);
  const mix = SELECT_MIX;
  const inv = 1 - mix;

  return [
    brightR * inv + SELECT_ACCENT.r * mix,
    brightG * inv + SELECT_ACCENT.g * mix,
    brightB * inv + SELECT_ACCENT.b * mix,
  ];
}

function stopSelectionBlink() {
  if (selectionBlinkTween) {
    selectionBlinkTween.kill();
    selectionBlinkTween = null;
  }
  if (selectionHighlight) {
    selectionHighlight.visible = false;
    selectionHighlight.material.opacity = 1;
  }
}

function ensureSelectionHighlight() {
  if (selectionHighlight) return;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0], 3)
  );

  selectionHighlight = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffffff,
      size: basePointSize * params.pointSize * HIGHLIGHT_SIZE_MULTIPLIER,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    })
  );
  selectionHighlight.visible = false;
  selectionHighlight.renderOrder = 1;
  pointCloudGroup.add(selectionHighlight);
}

function updateSelectionHighlight(index) {
  ensureSelectionHighlight();

  const pos = pointCloud.geometry.attributes.position;
  selectionHighlight.geometry.attributes.position.setXYZ(
    0,
    pos.getX(index),
    pos.getY(index),
    pos.getZ(index)
  );
  selectionHighlight.geometry.attributes.position.needsUpdate = true;
  selectionHighlight.material.size =
    basePointSize * params.pointSize * HIGHLIGHT_SIZE_MULTIPLIER;
  selectionHighlight.visible = true;
}

function startSelectionBlink() {
  if (!selectionHighlight) return;

  stopSelectionBlink();
  selectionHighlight.visible = true;
  selectionHighlight.material.opacity = 1;

  if (reduceMotion) {
    requestRender();
    return;
  }

  selectionBlinkTween = gsap.to(selectionHighlight.material, {
    opacity: 0.12,
    duration: 0.55,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
    onUpdate: requestRender,
  });
}

function applyPointSelection(index) {
  if (!pointCloud || !originalColors) return;

  selectedIndex = index;
  const colors = pointCloud.geometry.attributes.color;
  const count = originalColors.length / 3;

  for (let i = 0; i < count; i++) {
    const j = i * 3;
    const r = originalColors[j];
    const g = originalColors[j + 1];
    const b = originalColors[j + 2];

    if (i === index) {
      const [sr, sg, sb] = getSelectedColor(r, g, b);
      colors.array[j] = sr;
      colors.array[j + 1] = sg;
      colors.array[j + 2] = sb;
    } else {
      colors.array[j] = r * DIM_FACTOR;
      colors.array[j + 1] = g * DIM_FACTOR;
      colors.array[j + 2] = b * DIM_FACTOR;
    }
  }

  colors.needsUpdate = true;
  updateSelectionHighlight(index);
  startSelectionBlink();
  requestRender();
}

function resetPointSelection() {
  if (!pointCloud || !originalColors || selectedIndex === null) return;

  selectedIndex = null;
  pointCloud.geometry.attributes.color.array.set(originalColors);
  pointCloud.geometry.attributes.color.needsUpdate = true;
  stopSelectionBlink();
  requestRender();
}

function onPointerMove(event) {
  if (!pointCloudReady || focusSession) return;

  updatePointerFromEvent(event);
  const hits = raycastPoints();

  if (hits.length === 0) {
    if (hoveredIndex !== -1) hideTooltip();
    return;
  }

  const index = hits[0].index;
  if (index === hoveredIndex) {
    tooltip.style.left = `${event.clientX + 14}px`;
    tooltip.style.top = `${event.clientY + 14}px`;
    return;
  }

  hoveredIndex = index;
  canvas.style.cursor = "pointer";
  showTooltip(event, getPointData(index));
  requestRender();
}

function onPointerDown(event) {
  if (!pointCloudReady) return;
  pointerDownPos = { x: event.clientX, y: event.clientY };
}

function onPointerUp(event) {
  if (!pointCloudReady || !pointerDownPos) return;

  const dx = event.clientX - pointerDownPos.x;
  const dy = event.clientY - pointerDownPos.y;
  pointerDownPos = null;

  if (dx * dx + dy * dy > CLICK_THRESHOLD_PX * CLICK_THRESHOLD_PX) return;

  if (focusSession) {
    dismissFocus();
    return;
  }

  updatePointerFromEvent(event);
  const hits = raycastPoints();

  if (hits.length > 0) {
    enterSelection(hits[0].index);
  } else {
    resetPointSelection();
  }
}

function setupPointInteraction() {
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointerleave", hideTooltip);
}

function normalizeVertexColors(colors) {
  if (colors.array[0] <= 1 && colors.array[1] <= 1 && colors.array[2] <= 1) {
    return;
  }
  const arr = colors.array;
  for (let i = 0; i < arr.length; i++) {
    arr[i] *= 1 / 255;
  }
  colors.needsUpdate = true;
}

function setupGUI() {
  gui = new GUI({ title: "Controls", width: 280 });

  gui.add(params, "pointSize", 0.1, 4, 0.05)
    .name("Point size")
    .onChange(applyPointSize);

  gui.add(params, "opacity", 0.1, 1, 0.01)
    .name("Opacity")
    .onChange(applyOpacity);

  gui.add(params, "autoRotate")
    .name("Auto rotate")
    .onChange((v) => {
      controls.autoRotate = v;
      requestRender();
    });

  gui.add(params, "fog")
    .name("Fog")
    .onChange((v) => {
      scene.fog = v ? fog : null;
      requestRender();
    });

  const helpersFolder = gui.addFolder("Helpers");
  helpersFolder.add(params, "showAxes").name("Axes").onChange(updateHelpers);
  helpersFolder.add(params, "showGrid").name("Grid").onChange(updateHelpers);
  helpersFolder.add(params, "showBbox").name("Bounding box").onChange(updateHelpers);
  helpersFolder.close();

  const cameraFolder = gui.addFolder("Camera");
  zoomDistanceController = cameraFolder
    .add(params, "zoomDistance", 5, 600, 1)
    .name("Distance")
    .onChange(setCameraDistance);
  zoomDistanceController.listen();

  rollController = cameraFolder
    .add(params, "roll", -180, 180, 0.1)
    .name("Roll")
    .onChange(() => {
      applyRoll();
      logCameraSettings("Camera (roll)");
      requestRender();
    });

  cameraFolder.add({ reset: resetCamera }, "reset").name("Reset view");
  cameraFolder.close();

  gui.add(params, "pointCount").name("Points").disable();
  gui.close();
}

function loadPointCloud() {
  const loader = new PLYLoader();

  loader.load(
    PLY_URL,
    (geometry) => {
      geometry.computeBoundingBox();

      if (!geometry.attributes.color) {
        const count = geometry.attributes.position.count;
        const colors = new Float32Array(count * 3);
        colors.fill(0.85);
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      } else {
        normalizeVertexColors(geometry.attributes.color);
      }

      const material = new THREE.PointsMaterial({
        size: 0.12,
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: params.opacity,
        depthWrite: true,
      });

      pointCloud = new THREE.Points(geometry, material);
      pointCloud.frustumCulled = true;
      pointCloudGroup.add(pointCloud);

      originalColors = new Float32Array(geometry.attributes.color.array);
      setupPointInteraction();
      enableGoToForm(geometry.attributes.position.count);
      pointCloudReady = true;

      fitCameraToObject(pointCloudGroup);
      basePointSize = boundingRadius * 0.0018;
      applyPointSize();

      params.pointCount = geometry.attributes.position.count.toLocaleString();
      gui.controllersRecursive().forEach((c) => c.updateDisplay());

      hideOverlay();
      requestRender();
    },
    (xhr) => {
      if (xhr.total) {
        setProgress(xhr.loaded / xhr.total);
        setStatus(`Loading… ${((xhr.loaded / xhr.total) * 100).toFixed(0)}%`);
      }
    },
    (err) => {
      console.error(err);
      setStatus("Failed to load point cloud.");
    }
  );
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  requestRender();
}

function animate() {
  requestAnimationFrame(animate);

  const controlsActive = controls.update();
  if (params.roll !== 0) {
    applyRoll();
  }

  if (needsRender || controlsActive || focusSession || selectionBlinkTween) {
    if (focusSession && !tooltip.hidden) {
      updateFocusedTooltipPosition();
    }
    renderer.render(scene, camera);
    needsRender = false;
  }
}

setupGUI();
setupGoToForm();
window.addEventListener("resize", onResize);
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") dismissFocus();
});
onResize();
loadPointCloud();
animate();
