import { trackOnce, trackWhenVisible } from '../analytics.js';

const MILESTONES = [25, 50, 75];

/**
 * Click-to-play explainer. The markup ships a plain <video controls> so the
 * video plays without JavaScript; this adds the poster play button, progress
 * events, an end screen that leads to booking, and a readable failure state.
 * With preload="none", nothing but the poster downloads until someone presses play.
 */
export class ExplainerVideo {
  constructor(root) {
    this.root = root;
    this.video = root.querySelector('video');
    this.playButton = root.querySelector('[data-video-play]');
    this.endScreen = root.querySelector('[data-video-end]');
    this.errorState = root.querySelector('[data-video-error]');
    this.summary = document.querySelector('[data-video-summary]');
    if (!this.video || !this.playButton) return;

    if (!this.video.canPlayType('video/mp4')) {
      this.fail();
      return;
    }

    this.video.controls = false;
    this.playButton.hidden = false;
    this.playButton.addEventListener('click', () => this.play());
    root.querySelector('[data-video-replay]').addEventListener('click', () => {
      this.video.currentTime = 0;
      this.play();
    });

    this.video.addEventListener('play', () => {
      this.endScreen.hidden = true;
      trackOnce('staffing_video_play');
    });
    this.video.addEventListener('timeupdate', () => this.recordProgress());
    this.video.addEventListener('ended', () => {
      this.endScreen.hidden = false;
      trackOnce('staffing_video_complete');
    });
    // A missing or blocked file errors on <source>, not on the <video> itself.
    this.video.querySelectorAll('source').forEach((source) => source.addEventListener('error', () => this.fail()));
    this.video.addEventListener('error', () => this.fail());

    trackWhenVisible(this.video, 'staffing_video_impression', 0.5);
  }

  play() {
    this.playButton.hidden = true;
    this.video.controls = true;
    this.video.focus({ preventScroll: true });
    // Playback can still be refused (e.g. data saver); the native controls remain.
    this.video.play()?.catch(() => {});
  }

  recordProgress() {
    const { currentTime, duration } = this.video;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const percent = (currentTime / duration) * 100;
    MILESTONES.forEach((milestone) => {
      if (percent >= milestone) trackOnce(`staffing_video_${milestone}`);
    });
  }

  fail() {
    if (this.root.classList.contains('has-error')) return;
    // If the visitor was using the player, keep their focus on the explanation rather than losing it.
    const hadFocus = this.root.contains(document.activeElement);
    this.root.classList.add('has-error');
    this.video.controls = false;
    this.playButton.hidden = true;
    this.endScreen.hidden = true;
    this.errorState.hidden = false;
    if (hadFocus) this.errorState.focus({ preventScroll: true });
    if (this.summary) this.summary.open = true;
    trackOnce('staffing_video_error');
  }
}
