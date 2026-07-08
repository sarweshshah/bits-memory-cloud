/**
 * Full-screen loading overlay shown while the PLY point cloud is fetched.
 */
import gsap from "gsap";

export class LoadingOverlay {
  constructor({ overlay, statusEl, progressFill, overlayTitle, progressBar }) {
    this.overlay = overlay;
    this.statusEl = statusEl;
    this.progressFill = progressFill;
    this.overlayTitle = overlayTitle;
    this.progressBar = progressBar;
    this.reduceMotion = false;
  }

  /** Set up entrance animations for the loading overlay. */
  initAnimations() {
    gsap.set(this.progressFill, {
      scaleX: 0,
      transformOrigin: "left center",
    });

    gsap.from(this.overlayTitle, {
      autoAlpha: 0,
      y: 14,
      duration: 0.7,
      delay: 0.1,
    });
    gsap.from(this.statusEl, {
      autoAlpha: 0,
      y: 10,
      duration: 0.55,
      delay: 0.22,
    });
    gsap.from(this.progressBar, {
      autoAlpha: 0,
      scaleX: 0.4,
      duration: 0.5,
      delay: 0.34,
      transformOrigin: "center center",
    });
  }

  /** Update status text with a subtle pulse animation. */
  setStatus(text) {
    if (this.statusEl.textContent === text) return;
    this.statusEl.textContent = text;

    if (this.reduceMotion) return;

    gsap.fromTo(
      this.statusEl,
      { autoAlpha: 0.3, y: 4 },
      {
        autoAlpha: 0.55,
        y: 0,
        duration: 0.22,
        ease: "power1.out",
        overwrite: true,
      }
    );
  }

  /** Animate the progress bar fill (0–1). */
  setProgress(pct) {
    gsap.to(this.progressFill, {
      scaleX: Math.min(1, pct),
      duration: this.reduceMotion ? 0 : 0.25,
      ease: "power1.out",
      overwrite: true,
    });
  }

  /** Fade out and hide the overlay once loading completes. */
  hide() {
    gsap.to(this.overlay, {
      autoAlpha: 0,
      duration: this.reduceMotion ? 0 : 0.85,
      ease: "power2.inOut",
      onComplete: () => {
        this.overlay.style.visibility = "hidden";
      },
    });
  }
}
