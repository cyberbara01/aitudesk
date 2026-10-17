// Touchpad swipes on a stack: one page per swipe, and the next swipe counts at once, even while the last one still
// glides. After the fingers lift, Windows goes on sending the swipe's glide as wheel steps that fade out over a second
// or more, so a pause between events comes too late to tell two swipes apart (a click stopped the glide, which is why
// a second swipe used to need one). Within one stream of steps a new swipe shows itself: the steps grow again after
// they had faded, or they turn the other way.

/** A swipe turns the page once it has moved this far along the stack (CSS px). */
export const SWIPE_STEP = 46;
/** The steps of a swipe have faded once they are this share of their biggest. */
const FADE = 0.5;
/** Faded steps that grow this many times over (and by at least RISE_MIN px) are a new swipe. */
const RISE = 2;
const RISE_MIN = 3;
/** Steps the other way this big (CSS px) start a new swipe at once. */
const BACK_MIN = 2;
/** No new swipe sooner than this after a page turn (ms): a hand cannot swipe twice faster. */
const AGAIN_MS = 100;
/** Step sizes are judged over this many steps: single steps jump with the frame timing. */
const SMOOTH = 3;

export class SwipeGate {
  private along = 0;
  private across = 0;
  /** The way this stream turned the page (1 or -1), 0 while it has not. */
  private turned: -1 | 0 | 1 = 0;
  private turnedAt = 0;
  private peak = 0;
  private low = Infinity;
  private fading = false;
  private sizes: number[] = [];

  /** The stream of steps ended (no step for a while). */
  reset() {
    this.along = 0;
    this.across = 0;
    this.turned = 0;
    this.sizes = [];
  }

  /** One touchpad step along and across the stack (CSS px) at `now` (ms): the page turn it makes, 1, -1 or 0. */
  step(a: number, c: number, now: number): -1 | 0 | 1 {
    this.sizes.push(Math.hypot(a, c));
    if (this.sizes.length > SMOOTH) this.sizes.shift();
    const size = this.sizes.reduce((s, v) => s + v, 0) / this.sizes.length;

    if (this.turned !== 0) {
      const back = Math.sign(a) === -this.turned && Math.abs(a) >= BACK_MIN && Math.abs(a) > Math.abs(c);
      let fresh = false;
      if (now - this.turnedAt < AGAIN_MS) {
        this.peak = Math.max(this.peak, size);
      } else if (back) {
        fresh = true;
      } else if (!this.fading) {
        if (size >= this.peak) this.peak = size;
        else if (size <= this.peak * FADE) {
          this.fading = true;
          this.low = size;
        }
      } else if (size < this.low) {
        this.low = size;
      } else if (size >= this.low * RISE && size >= this.low + RISE_MIN) {
        fresh = true;
      }
      if (!fresh) return 0;
      // A new swipe: it counts from this step.
      this.turned = 0;
      this.along = 0;
      this.across = 0;
    }

    this.along += a;
    this.across += c;
    if (Math.abs(this.along) >= SWIPE_STEP && Math.abs(this.along) > Math.abs(this.across)) {
      this.turned = this.along > 0 ? 1 : -1;
      this.turnedAt = now;
      this.peak = size;
      this.low = Infinity;
      this.fading = false;
      return this.turned;
    }
    return 0;
  }
}
