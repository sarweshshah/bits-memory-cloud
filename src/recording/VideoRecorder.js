/**
 * Records the WebGL canvas to a downloadable MP4 via WebCodecs.
 * Uses a fixed frame clock and all-keyframe encoding to avoid motion smear.
 */
import { RECORDING, computeRecordingBitrate } from "../constants.js";

/** @typedef {'idle' | 'recording' | 'paused'} RecordingState */

export class VideoRecorder {
  #stopping = false;
  /** @type {Promise<typeof import("mp4-muxer")> | null} */
  #muxerModule = null;

  constructor({ canvas, onStatusChange, onSessionEnd }) {
    this.canvas = canvas;
    this.onStatusChange = onStatusChange;
    this.onSessionEnd = onSessionEnd;
    /** @type {RecordingState} */
    this.state = "idle";
    this.fps = RECORDING.defaultFps;
    this.frameIndex = 0;
    this.frameDurationMs = 1000 / RECORDING.defaultFps;
    this.nextFrameMs = 0;
    this.muxer = null;
    this.videoEncoder = null;
    this.encodeCanvas = null;
    this.encodeCtx = null;
    this.encodeWidth = 0;
    this.encodeHeight = 0;
    this.codec = null;
    this.bitrate = RECORDING.minVideoBitsPerSecond;
    this.bitrateMode = "constant";
  }

  get supported() {
    return (
      typeof VideoEncoder !== "undefined" &&
      typeof VideoFrame !== "undefined"
    );
  }

  /** Session is open (recording or paused). */
  get isActive() {
    return this.state !== "idle";
  }

  /** Actively encoding frames. */
  get isCapturing() {
    return this.state === "recording";
  }

  /** Fixed timeline time for the frame about to be captured. */
  get frameTimeSeconds() {
    return this.frameIndex / this.fps;
  }

  #setStatus(status) {
    this.onStatusChange?.(status);
  }

  /** @returns {number} */
  #evenDimension(value) {
    return Math.max(2, Math.floor(value) & ~1);
  }

  /** @returns {{ width: number, height: number, scale: number }} */
  #getScaledDimensions(scale) {
    return {
      width: this.#evenDimension(this.canvas.width * scale),
      height: this.#evenDimension(this.canvas.height * scale),
      scale,
    };
  }

  /** @returns {Promise<{ width: number, height: number, scale: number, codec: string } | null>} */
  async #findWebCodecsProfile(fps, scale) {
    const { width, height } = this.#getScaledDimensions(scale);
    const codec = await this.#pickCodec(width, height, fps);
    if (!codec) return null;
    return { width, height, scale, codec };
  }

  /** @returns {Promise<{ width: number, height: number, scale: number, codec: string } | null>} */
  async #findBestWebCodecsProfile(fps) {
    const scales = [1, 0.85, 0.75, 0.67, 0.5];

    for (const scale of scales) {
      const profile = await this.#findWebCodecsProfile(fps, scale);
      if (profile) return profile;
    }

    return null;
  }

  /** @returns {Promise<string | null>} */
  async #pickCodec(width, height, fps) {
    const bitrate = computeRecordingBitrate(width, height, fps);

    for (const bitrateMode of ["constant", "variable"]) {
      for (const codec of RECORDING.codecs) {
        const support = await VideoEncoder.isConfigSupported({
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          latencyMode: "quality",
          bitrateMode,
        });
        if (support.supported) {
          this.bitrateMode = bitrateMode;
          return codec;
        }
      }
    }

    return null;
  }

  /** Begin a new capture session at the given frame rate. */
  async start(fps = RECORDING.defaultFps) {
    if (this.isActive) return;

    const profile = await this.#findBestWebCodecsProfile(fps);
    if (!profile) {
      this.#setStatus("Unsupported");
      console.warn("VideoRecorder: no supported H.264 profile");
      return;
    }

    await this.#startWebCodecs(fps, profile);
  }

  /** @returns {Promise<typeof import("mp4-muxer")>} */
  #loadMuxerModule() {
    if (!this.#muxerModule) {
      this.#muxerModule = import("mp4-muxer");
    }
    return this.#muxerModule;
  }

  /** @param {{ width: number, height: number, scale: number, codec: string }} profile */
  async #startWebCodecs(fps, profile) {
    const { Muxer, ArrayBufferTarget } = await this.#loadMuxerModule();
    const { width, height, scale, codec } = profile;

    this.fps = fps;
    this.frameIndex = 0;
    this.frameDurationMs = 1000 / fps;
    this.nextFrameMs = performance.now();
    this.encodeWidth = width;
    this.encodeHeight = height;
    this.codec = codec;
    this.bitrate = computeRecordingBitrate(width, height, fps);

    if (scale < 1) {
      this.encodeCanvas = document.createElement("canvas");
      this.encodeCanvas.width = width;
      this.encodeCanvas.height = height;
      this.encodeCtx = this.encodeCanvas.getContext("2d");
      this.encodeCtx.imageSmoothingEnabled = false;
    } else {
      this.encodeCanvas = null;
      this.encodeCtx = null;
    }

    this.muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height },
      fastStart: "in-memory",
    });

    this.videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        this.muxer.addVideoChunk(chunk, meta);
        this.#checkSizeCap();
      },
      error: (error) => {
        console.error("VideoRecorder:", error);
        this.#resetSession();
        this.#setStatus("Error");
      },
    });

    this.videoEncoder.configure({
      codec,
      width,
      height,
      bitrate: this.bitrate,
      framerate: fps,
      latencyMode: "quality",
      bitrateMode: this.bitrateMode,
    });

    this.#stopping = false;
    this.state = "recording";
    this.#setStatus("Recording…");
  }

  /** Whether the render loop should draw and capture the next frame. */
  needsFrame(now = performance.now()) {
    return this.state === "recording" && now >= this.nextFrameMs;
  }

  /** Pause frame capture without closing the session. */
  pause() {
    if (this.state !== "recording") return;
    this.state = "paused";
    this.#setStatus("Paused");
  }

  /** Resume frame capture after a pause. */
  resume() {
    if (this.state !== "paused") return;
    this.state = "recording";
    this.nextFrameMs = performance.now();
    this.#setStatus("Recording…");
  }

  /** Finalize the session and download the MP4 clip. */
  async stop() {
    if (
      !this.isActive ||
      !this.videoEncoder ||
      !this.muxer ||
      this.#stopping
    ) {
      return;
    }

    this.#stopping = true;
    this.state = "paused";
    this.#setStatus("Saving…");

    await this.videoEncoder.flush();
    this.muxer.finalize();
    this.#download(new Blob([this.muxer.target.buffer], { type: "video/mp4" }));
    this.#resetSession();
    this.#setStatus("Saved");
    this.onSessionEnd?.();
  }

  #checkSizeCap() {
    if (this.#stopping || !this.muxer) return;
    if (this.muxer.target.buffer.byteLength < RECORDING.maxFileSizeBytes) return;

    this.#setStatus("Size limit reached");
    void this.stop();
  }

  /** Capture the current canvas immediately after render. */
  captureFrame() {
    if (this.state !== "recording" || !this.videoEncoder || this.#stopping) {
      return;
    }

    const source = this.encodeCanvas ?? this.canvas;
    if (this.encodeCanvas && this.encodeCtx) {
      this.encodeCtx.drawImage(
        this.canvas,
        0,
        0,
        this.encodeWidth,
        this.encodeHeight
      );
    }

    const timestamp = Math.round((this.frameIndex * 1_000_000) / this.fps);
    const frame = new VideoFrame(source, { timestamp });
    this.videoEncoder.encode(frame, { keyFrame: true });
    frame.close();

    this.frameIndex += 1;
    this.nextFrameMs += this.frameDurationMs;

    const now = performance.now();
    if (this.nextFrameMs < now - this.frameDurationMs * 2) {
      this.nextFrameMs = now + this.frameDurationMs;
    }
  }

  #resetSession() {
    this.videoEncoder?.close();

    this.#stopping = false;
    this.state = "idle";
    this.muxer = null;
    this.videoEncoder = null;
    this.encodeCanvas = null;
    this.encodeCtx = null;
    this.frameIndex = 0;
    this.nextFrameMs = 0;
    this.codec = null;
    this.bitrate = RECORDING.minVideoBitsPerSecond;
    this.bitrateMode = "constant";
  }

  #download(blob) {
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${RECORDING.filenamePrefix}-${stamp}.mp4`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
