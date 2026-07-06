import * as THREE from "three";

export const PLY_URL = "/cloud_web.ply";
export const AUTO_ROTATE_SPEED = 0.35;

export const DEFAULT_CAMERA = {
  fov: 50,
  position: new THREE.Vector3(-132.866, 45.298, 172.081),
  target: new THREE.Vector3(0, -3.883, 0),
  zoomDistance: 200,
  roll: 0,
  yaw: 90,
  pitch: 18,
};

export const CLICK_THRESHOLD_PX = 5;
export const DIM_FACTOR = 0.3;
export const SELECT_ACCENT = { r: 1, g: 0.97, b: 0.82 };
export const SELECT_BRIGHTEN = 1.4;
export const SELECT_MIX = 0.5;
export const HIGHLIGHT_SIZE_MULTIPLIER = 5;
export const SNAP_MIN_DISTANCE = 130;
export const COORD_DECIMALS = 1;
