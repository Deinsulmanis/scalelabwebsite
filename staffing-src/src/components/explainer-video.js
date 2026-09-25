import { trackOnce } from '../analytics.js';
import { whenVisibleFor } from '../attribution/visibility.js';
import { createWatchTracker } from '../attribution/video-progress.js';

/**
 * Click-to-play explainer. The markup ships a plain <video controls> so the
 * video plays without JavaScript; this adds the poster play button, an end
 * screen that leads to booking, a readable failure state, and measurement:
 *
 *   visible    half the player in view for one second        staffing_video_impression / video_visible
 *   playing    frames actually playing (not just requested)  staffing_video_play / video_playing
 *   25/50/75   that share of the video actually WATCHED;     staffing_video_25… / video_25…
 *              seeking or dragging through it counts nothing
 *   complete   95% watched, or ended after 90% watched       staffing_video_complete / video_complete
 *
 * With preload="none", nothing but the poster downloads until someone presses play.
 */
export class ExplainerVideo {
  constructor(root, attribution = null) {
    this.root = root;
    this.attribution = attribution;
    this.progress = createWatchTracker();
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

    this.video.addEventListener('play', () => { this.endScreen.hidden = true; });
    this.video.addEventListener('playing', () => {
      trackOnce('staffing_video_play');
      this.attribution?.once('video_playing');
    });
    this.video.addEventListener('timeupdate', () => this.report(this.progress.tick({
      currentTime: this.video.currentTime, duration: this.video.duration,
      at: performance.now(), rate: this.video.playbackRate,
    })));
    for (const type of ['seeking', 'pause', 'waiting']) this.video.addEventListener(type, () => this.progress.interrupt());
    this.video.addEventListener('ended', () => {
      this.endScreen.hidden = false;
      this.report(this.progress.ended({ duration: this.video.duration }));
    });
    // A missing or blocked file errors on <source>, not on the <video> itself.
    this.video.querySelectorAll('source').forEach((source) => source.addEventListener('error', () => this.fail()));
    this.video.addEventListener('error', () => this.fail());

    whenVisibleFor(this.video, { share: 0.5, ms: 1000 }, () => {
      trackOnce('staffing_video_impression');
      this.attribution?.once('video_visible');
    });
  }

  play() {
    this.playButton.hidden = true;
    // Hide the end screen now, not only when the async 'play' event arrives.
    this.endScreen.hidden = true;
    this.video.controls = true;
    this.video.focus({ preventScroll: true });
    // Playback can still be refused (e.g. data saver); the native controls remain.
    this.video.play()?.catch(() => {});
  }

  report(milestones) {
    for (const milestone of milestones) {
      const name = milestone === 'complete' ? 'video_complete' : `video_${milestone}`;
      trackOnce(`staffing_${name}`);
      this.attribution?.once(name);
    }
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
