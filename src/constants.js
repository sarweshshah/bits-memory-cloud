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
  position: new THREE.Vector3(178.74, 61.803, 65.056), // yaw 70°, pitch 18°, distance 200
  target: new THREE.Vector3(0, 0, 0),
  zoomDistance: 200,
  roll: 0,
  yaw: 70,
  pitch: 18,
  minPitch: 5, // Minimum elevation (degrees); prevents under-horizon views
  maxPitch: 89,
  coordDecimals: 1, // Decimal places shown in tooltips and logs
};

/** Visual treatment when a point is selected/focused. */
export const SELECTION = {
  dimFactor: 0.1, // Brightness multiplier for non-selected points
  accent: { r: 1, g: 0.97, b: 0.82 }, // Warm highlight tint (mixed with point color)
  brighten: 2.0,
  mix: 0.5, // Blend ratio between brightened color and accent
  highlightSizeMultiplier: 5, // Overlay point size relative to base
  highlightScreenPadding: 4, // Extra px clearance for tooltip placement
  hoverOverlayOpacity: 0.75, // Semi-transparent so warm accent reads through
};

/** Pointer interaction thresholds. */
export const INTERACTION = {
  clickThresholdPx: 5, // Max pointer movement (px) still treated as a click
};

/** Interactive viewport pixel ratio cap (retina-aware). */
export const DISPLAY = {
  maxPixelRatio: 2,
};

/** Canvas video export defaults. */
export const RECORDING = {
  defaultFps: 30,
  fpsSteps: [24, 30, 60],
  minVideoBitsPerSecond: 16_000_000,
  maxVideoBitsPerSecond: 80_000_000,
  bitsPerPixelFrame: 0.18, // Target bits per pixel per frame for sharp detail
  maxPixelRatio: 3, // Upper cap for very high-DPR displays during export
  timesliceMs: 100,
  maxFileSizeBytes: 500 * 1024 * 1024, // Stop recording once in-memory MP4 reaches this size
  filenamePrefix: "bits-memory-cloud",
  codecs: ["avc1.640028", "avc1.42001f", "avc1.42E01E"],
};

/** Native device pixel ratio (1 on standard, 2+ on retina). */
export function getDevicePixelRatio() {
  return window.devicePixelRatio || 1;
}

/** Pixel ratio for interactive viewing — retina-aware but capped for performance. */
export function getDisplayPixelRatio() {
  return Math.min(getDevicePixelRatio(), DISPLAY.maxPixelRatio);
}

/** Pixel ratio for snapshots and video — uses full retina backing resolution. */
export function getCapturePixelRatio() {
  return Math.min(getDevicePixelRatio(), RECORDING.maxPixelRatio);
}

/** Scale video bitrate with resolution and frame rate for sharper output. */
export function computeRecordingBitrate(width, height, fps) {
  const estimate = Math.round(width * height * fps * RECORDING.bitsPerPixelFrame);
  return Math.min(
    RECORDING.maxVideoBitsPerSecond,
    Math.max(RECORDING.minVideoBitsPerSecond, estimate)
  );
}
