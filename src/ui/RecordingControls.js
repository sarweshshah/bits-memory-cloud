/**
 * Icon toolbar for canvas video capture (record, pause/resume, stop).
 */
const ICONS = {
  snapshot: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 4h6l1 2h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l1-2z" fill="none" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="13" r="4" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>`,
  record: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle class="recording-dot" cx="12" cy="12" r="6"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>`,
  resume: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`,
};

export class RecordingControls {
  constructor({ container, onSnapshot, onRecord, onPause, onStop }) {
    this.onSnapshot = onSnapshot;
    this.onRecord = onRecord;
    this.onPause = onPause;
    this.onStop = onStop;
    /** @type {'idle' | 'recording' | 'paused'} */
    this.state = "idle";

    container.classList.add("recording-controls-row");
    // Match lil-gui's .name / .widget columns so buttons align with other inputs
    container.innerHTML = `
      <div class="name"></div>
      <div class="widget">
        <div class="recording-controls" role="toolbar" aria-label="Recording controls">
          <button type="button" class="recording-controls__btn recording-controls__btn--snapshot" aria-label="Snapshot"></button>
          <button type="button" class="recording-controls__btn recording-controls__btn--record" aria-label="Record"></button>
          <button type="button" class="recording-controls__btn recording-controls__btn--pause" aria-label="Pause"></button>
          <button type="button" class="recording-controls__btn recording-controls__btn--stop" aria-label="Stop"></button>
        </div>
      </div>
    `;

    this.snapshotBtn = container.querySelector(".recording-controls__btn--snapshot");
    this.recordBtn = container.querySelector(".recording-controls__btn--record");
    this.pauseBtn = container.querySelector(".recording-controls__btn--pause");
    this.stopBtn = container.querySelector(".recording-controls__btn--stop");

    this.snapshotBtn.innerHTML = ICONS.snapshot;
    this.recordBtn.innerHTML = ICONS.record;
    this.pauseBtn.innerHTML = ICONS.pause;
    this.stopBtn.innerHTML = ICONS.stop;

    this.snapshotBtn.addEventListener("click", () => this.onSnapshot?.());
    this.recordBtn.addEventListener("click", () => this.onRecord?.());
    this.pauseBtn.addEventListener("click", () => this.onPause?.());
    this.stopBtn.addEventListener("click", () => this.onStop?.());
  }

  /** @param {{ state: 'idle' | 'recording' | 'paused', supported: boolean, snapshotEnabled?: boolean, saving?: boolean }} options */
  setState({ state, supported, snapshotEnabled = false, saving = false }) {
    this.state = state;

    this.snapshotBtn.disabled = !snapshotEnabled || saving;
    this.recordBtn.disabled = !supported || state !== "idle" || saving;
    this.pauseBtn.disabled = !supported || state === "idle" || saving;
    this.stopBtn.disabled = !supported || state === "idle" || saving;

    this.pauseBtn.innerHTML = state === "paused" ? ICONS.resume : ICONS.pause;
    this.pauseBtn.setAttribute(
      "aria-label",
      state === "paused" ? "Resume" : "Pause"
    );

    this.recordBtn.classList.toggle(
      "recording-controls__btn--active",
      state === "recording"
    );
  }
}
