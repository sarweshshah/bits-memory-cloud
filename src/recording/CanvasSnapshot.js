/**
 * Captures the current WebGL canvas frame as a PNG download.
 */
import { RECORDING } from "../constants.js";

export class CanvasSnapshot {
  constructor({ canvas }) {
    this.canvas = canvas;
  }

  /** Render the latest frame to a PNG and trigger a browser download. */
  capture() {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("CanvasSnapshot: failed to create image blob"));
            return;
          }
          this.#download(blob);
          resolve();
        },
        "image/png"
      );
    });
  }

  #download(blob) {
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${RECORDING.filenamePrefix}-snapshot-${stamp}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
