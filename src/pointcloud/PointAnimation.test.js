import assert from "node:assert/strict";
import { getAnimatedPointSize, getPointPulseScale } from "./PointAnimation.js";

const options = {
  amplitude: 0.1,
  frequencyHz: 0.1,
};

assert.equal(getPointPulseScale(0, options), 1);

assert.equal(
  getPointPulseScale(1 / (4 * options.frequencyHz), options),
  1 + options.amplitude
);

assert.equal(
  getAnimatedPointSize(2, 3, 1 / (4 * options.frequencyHz), options),
  6 * (1 + options.amplitude)
);

assert.equal(
  getAnimatedPointSize(2, 3, 1, { ...options, enabled: false }),
  6
);
