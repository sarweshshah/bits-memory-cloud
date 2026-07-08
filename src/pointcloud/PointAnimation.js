export function getPointPulseScale(
  elapsedSeconds,
  { amplitude, frequencyHz, enabled = true }
) {
  if (!enabled || amplitude === 0 || frequencyHz === 0) {
    return 1;
  }

  return 1 + Math.sin(elapsedSeconds * Math.PI * 2 * frequencyHz) * amplitude;
}

export function getAnimatedPointSize(
  basePointSize,
  pointSizeMultiplier,
  elapsedSeconds,
  options
) {
  return (
    basePointSize *
    pointSizeMultiplier *
    getPointPulseScale(elapsedSeconds, options)
  );
}
