import * as THREE from "three";

export const POINT_CLOUD = {
  url: "/cloud_web.ply",
  colorBrightness: 1.5,
};

export const CONTROLS = {
  autoRotateSpeed: 0.35,
};

export const DEFAULT_SCENE = {
  background: "Near black",
  backgroundPresets: {
    "Near black": 0x050508,
    Midnight: 0x0a0a12,
    Charcoal: 0x1a1a1f,
    "Deep navy": 0x0d1117,
    Slate: 0x2d3748,
    White: 0xffffff,
  },
  toneMappingExposure: 1.35,
};

export const DEFAULT_CAMERA = {
  fov: 50,
  position: new THREE.Vector3(-132.866, 45.298, 172.081),
  target: new THREE.Vector3(0, -3.883, 0),
  zoomDistance: 200,
  roll: 0,
  yaw: 70,
  pitch: 18,
  coordDecimals: 1,
};

export const SELECTION = {
  focusDistance: 100,
  dimFactor: 0.1,
  accent: { r: 1, g: 0.97, b: 0.82 },
  brighten: 2.0,
  mix: 0.5,
  highlightSizeMultiplier: 5,
};

export const INTERACTION = {
  clickThresholdPx: 5,
};
