import assert from "node:assert/strict";
import * as THREE from "three";
import { PointSelection } from "./PointSelection.js";
import { SELECTION } from "../constants.js";

function createHarness({ reduceMotion = false } = {}) {
  const group = new THREE.Group();
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 2, 0, 0]);
  const colors = new Float32Array([0.4, 0.5, 0.6, 0.2, 0.3, 0.4, 0.1, 0.2, 0.3]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const mesh = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.12, vertexColors: true })
  );
  group.add(mesh);

  const pointCloud = {
    mesh,
    geometry,
    originalColors: new Float32Array(colors),
    basePointSize: 0.12,
  };

  const renders = [];
  const selection = new PointSelection(pointCloud, group, {
    onRenderRequest: () => renders.push(1),
    getReduceMotion: () => reduceMotion,
  });

  return { selection, pointCloud, colors, renders };
}

const { selection, pointCloud, colors } = createHarness();

assert.equal(typeof selection.hover, "function");
assert.equal(typeof selection.clearHover, "function");

const snapshot = new Float32Array(colors);
selection.hover(1, 2);
assert.ok(selection.highlight?.visible);
assert.equal(
  selection.highlight.material.size,
  pointCloud.basePointSize * 2 * SELECTION.highlightSizeMultiplier
);
assert.equal(selection.highlight.material.opacity, SELECTION.hoverOverlayOpacity);
assert.equal(selection.hasBlink, false);

// Hovered point gets warm accent; other points stay original
const bright = (() => {
  const r = snapshot[3];
  const g = snapshot[4];
  const b = snapshot[5];
  const br = Math.min(1, r * SELECTION.brighten);
  const bg = Math.min(1, g * SELECTION.brighten);
  const bb = Math.min(1, b * SELECTION.brighten);
  const mix = SELECTION.mix;
  const inv = 1 - mix;
  return [
    br * inv + SELECTION.accent.r * mix,
    bg * inv + SELECTION.accent.g * mix,
    bb * inv + SELECTION.accent.b * mix,
  ];
})();
for (let i = 0; i < 3; i++) {
  assert.ok(Math.abs(colors[3 + i] - bright[i]) < 1e-5);
}
assert.deepEqual(Array.from(colors.slice(0, 3)), Array.from(snapshot.slice(0, 3)));
assert.deepEqual(Array.from(colors.slice(6, 9)), Array.from(snapshot.slice(6, 9)));

selection.clearHover();
assert.equal(selection.highlight.visible, false);
assert.equal(selection.hoveredIndex, null);
assert.deepEqual(Array.from(colors), Array.from(snapshot));

// Switching hover restores the previous point before accenting the new one
selection.hover(0, 1);
selection.hover(2, 1);
assert.deepEqual(Array.from(colors.slice(0, 3)), Array.from(snapshot.slice(0, 3)));
assert.ok(Math.abs(colors[6] - snapshot[6]) > 1e-3);
selection.clearHover();
assert.deepEqual(Array.from(colors), Array.from(snapshot));

// Hover then select must dim every non-selected vertex (even after hover updateRanges)
const harness2 = createHarness();
harness2.selection.hover(1, 1);
const colorAttr = harness2.pointCloud.mesh.geometry.attributes.color;
assert.ok(colorAttr.updateRanges.length > 0); // hover left a partial range
harness2.selection.select(0, 1);
assert.equal(harness2.selection.hasBlink, true);
assert.ok(harness2.selection.highlight.visible);

const selected = Array.from(harness2.pointCloud.mesh.geometry.attributes.color.array);
const originals = harness2.pointCloud.originalColors;
for (let i = 0; i < 3; i++) {
  assert.ok(Math.abs(selected[i] - originals[i]) > 1e-4); // accented
}
for (let i = 3; i < 9; i++) {
  assert.ok(
    Math.abs(selected[i] - originals[i] * SELECTION.dimFactor) < 1e-5,
    `expected dimmed channel ${i}`
  );
}
// Full rewrite must clear stale ranges so GPU gets the whole buffer
assert.equal(colorAttr.updateRanges.length, 0);

harness2.selection.reset();
assert.deepEqual(
  Array.from(harness2.pointCloud.mesh.geometry.attributes.color.array),
  Array.from(harness2.pointCloud.originalColors)
);
assert.equal(harness2.selection.highlight.visible, false);

// clearHover must not hide overlay while selected
const harness3 = createHarness({ reduceMotion: true });
harness3.selection.select(2, 1);
harness3.selection.clearHover();
assert.ok(harness3.selection.highlight.visible);

console.log("PointSelection hover tests passed");
