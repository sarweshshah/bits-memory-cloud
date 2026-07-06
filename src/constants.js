/**
 * Application-wide configuration constants.
 * Centralizes tunable values for the point cloud viewer, camera, and selection.
 */
import * as THREE from "three";

/** Point cloud asset and rendering defaults. */
export const POINT_CLOUD = {
  url: "/cloud_web.ply",
  colorBrightness: 1.5, // Multiplier applied to vertex colors in the material
};

/** OrbitControls behavior. */
export const CONTROLS = {
  autoRotateSpeed: 0.35,
};

/** Scene appearance presets and tone mapping. */
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

/** Initial camera pose and coordinate display precision. */
export const DEFAULT_CAMERA = {
  fov: 50,
  position: new THREE.Vector3(-132.866, 45.298, 172.081),
  target: new THREE.Vector3(0, 0, 0),
  zoomDistance: 200,
  roll: 0,
  yaw: 70,
  pitch: 18,
  coordDecimals: 1, // Decimal places shown in tooltips and logs
};

/** Visual treatment when a point is selected/focused. */
export const SELECTION = {
  focusDistance: 100, // Camera distance from focused point
  dimFactor: 0.1, // Brightness multiplier for non-selected points
  accent: { r: 1, g: 0.97, b: 0.82 }, // Warm highlight tint (mixed with point color)
  brighten: 2.0,
  mix: 0.5, // Blend ratio between brightened color and accent
  highlightSizeMultiplier: 5, // Overlay point size relative to base
  highlightScreenPadding: 4, // Extra px clearance for tooltip placement
  occlusionSearchRadius: 25, // World-space radius around target to check for blockers
  occlusionPointRadiusScale: 1.75, // Ray clearance multiplier for occluder point size
};

/** Pointer interaction thresholds. */
export const INTERACTION = {
  clickThresholdPx: 5, // Max pointer movement (px) still treated as a click
};
