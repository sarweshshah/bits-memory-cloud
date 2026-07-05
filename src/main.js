import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PLYLoader } from "three/addons/loaders/PLYLoader.js";
import GUI from "three/addons/libs/lil-gui.module.min.js";

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

let pointCloud = null;
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
  pointCloud.material.size = basePointSize * params.pointSize;
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
  progressFill.style.width = `${Math.min(100, pct * 100)}%`;
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function getCameraSettings() {
  _offset.copy(camera.position).sub(controls.target);
  const distance = _offset.length();
  const yaw = THREE.MathUtils.radToDeg(Math.atan2(_offset.x, _offset.z));

  return {
    position: {
      x: +camera.position.x.toFixed(3),
      y: +camera.position.y.toFixed(3),
      z: +camera.position.z.toFixed(3),
    },
    target: {
      x: +controls.target.x.toFixed(3),
      y: +controls.target.y.toFixed(3),
      z: +controls.target.z.toFixed(3),
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

  if (needsRender || controlsActive) {
    renderer.render(scene, camera);
    needsRender = false;
  }
}

setupGUI();
window.addEventListener("resize", onResize);
onResize();
loadPointCloud();
animate();
