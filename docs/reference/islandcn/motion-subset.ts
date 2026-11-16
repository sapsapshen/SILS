/* islandcn 动效常数摘录（非上游全文）：assets/island.js 只移植以下弹簧与时长。
   源：https://github.com/opencoredev/islandcn commit 0011a41ea4882f3818caf35c98f3ee46b80c4a2c 的 lib/island/motion.ts（MIT, (c) 2026 Leo）。
   全文 2,302 行里的 React 编排（层、blur skirt、cornerLead、tail legs、录制对比）未摘录，本项目不移植。
   标定注释里的 take 编号（appear-t1 等）指上游的模拟器录制，保留作为数值出处。 */

const islandMotion = {
  shape: {
    // appear-t1: left 0.480 / 0.635, right 0.486 / 0.606. It carries the first 0.3 s of every appear
    // take; `tail.appear` settles the rest.
    appear: { response: 0.483, dampingFraction: 0.62 },
    // alert-t1 (alerting update on compact A): left 0.520 / 0.821, right 0.514 / 0.827.
    expand: { response: 0.517, dampingFraction: 0.824 },
    // expand-t1 (long-press): after the swell, 0.386 / 0.793 on width, height and left.
    pressExpand: { response: 0.387, dampingFraction: 0.792 },
    // appear-alert-t1 (scheduled start, idle to expanded): left 0.540 / 0.811.
    appearExpand: { response: 0.54, dampingFraction: 0.811 },
    // split-alert-t1 (compact A to expanded B): via idle, 0.498 / 0.829 on both legs.
    swap: { response: 0.498, dampingFraction: 0.829 },
    // collapse-t1 (tap outside): aims at idle on 0.479 / 0.894, then `retarget.collapse`.
    collapse: { response: 0.479, dampingFraction: 0.894 },
    // alert-t1, appear-alert-t1 (the alert's hold runs out): aims at idle on 0.535 / 0.84, then
    // `retarget.alertCollapse` after 0.29 s.
    alertCollapse: { response: 0.535, dampingFraction: 0.84 },
    // split-alert-t1 collapse into the split: left 0.366 / 1.12 on its own; 0.3 once the return
    // starts `lag` later and aims at the spread pill (sim: left jitter 3.14 / 11.92 to 1.09 / 3.53).
    // It carries the return's first 0.2 s on every take; `collapseSplitSpread` was refitted to the
    // median of the takes for the rest. Round 23: 0.4 / 0.9 with the left leg's `kick` (below).
    collapseSplit: { response: 0.4, dampingFraction: 0.9 },
    // split-t1: left via idle 0.519 / 0.810, the merged right edge via idle 0.489 / 0.822.
    split: { response: 0.505, dampingFraction: 0.815 },
    // unsplit-t1 alone: left via idle 0.523 / 0.779, the merged right edge via idle 0.477 / 0.697.
    // With `tail.unsplit`, fitted to the median of t1, t2 and t9: 0.487 / 0.794.
    unsplit: { response: 0.487, dampingFraction: 0.794 },
    // dismiss-t1 alone: left 0.443 / 0.965, right 0.440 / 0.977. With `tail.dismiss`, fitted to the
    // median of every dismiss take: 0.432 / 1.019.
    dismiss: { response: 0.432, dampingFraction: 1.019 },
    /** Content changed size inside the same presentation (a longer label, say). */
    resize: { response: 0.5, dampingFraction: 0.82 },
  },
  body: {
    appear: { response: 0.483, dampingFraction: 0.62, delay: 0 },
    // alert-t1 height: 0.497 / 0.825, starting with the edges.
    expand: { response: 0.497, dampingFraction: 0.825, delay: 0 },
    // expand-t1 height: 0.388 / 0.791.
    pressExpand: { response: 0.388, dampingFraction: 0.791, delay: 0 },
    // appear-alert-t1 height: 0.523 / 0.817.
    appearExpand: { response: 0.523, dampingFraction: 0.817, delay: 0 },
    // split-alert-t1 height: 0.492 / 0.832, starting at the retarget (`viaIdle.swap`).
    swap: { response: 0.492, dampingFraction: 0.832, delay: 0.223 },
    // collapse-t1 height: 0.453 / 0.928 (radius 0.443 / 0.955).
    collapse: { response: 0.453, dampingFraction: 0.928, delay: 0 },
    // alert-t1 height: 0.481 / 0.908.
    alertCollapse: { response: 0.481, dampingFraction: 0.908, delay: 0 },
    // split-alert-t1 height: 0.485 / 0.900 on its own; judge round 5 (finding 2, the body stays tall
    // under the bulb at 840 to 846): 0.45 / 0.9, within 1.2 pt from 841 on and 0.5 pt short at the tail,
    // where a taller pill deepens the neck (0.42 / 1 left it 1.2 pt tall at 849 and broke the neck at 856).
    // Round 24 (t13a: split-alert's returning blob flattens sooner, 4 to 8 pt): on split-alert's
    // return and split-collapse-b (t1, t2, t9) the web's bottom rose 1.3 to 2.7 pt ahead of the
    // takes from +0.18 to +0.28 s, outside their spread on 7 frames each. Fitted with the tail's
    // lean from the window's start (`fit-tail.ts collapseSplitHeight`): 0.429 / 1.0 with the lean
    // sooner and quicker (below), cost 0.32 to 0.14.
    // Round 41 (-t47 judge B, split-collapse-b f133 to 144 and split-alert f825 to 836: iOS's main pill
    // keeps its depth where the web's bottom rose 2 to 4 pt early). Against every seen take's median
    // (23 each, `fit-tail.ts collapseSplitHeight`, `fit-bottom.ts`): the height falls on 0.481 / 0.884
    // with a smaller, later lean (below); bottom RMS over the first 0.3 s 1.93 to 1.05 pt on split-alert's
    // return, 1.07 to 1.36 on split-collapse-b (paired on the captures: -4.0 to -2.0 pt at +5, +6).
    collapseSplit: { response: 0.481, dampingFraction: 0.884, delay: 0 },
    split: { response: 0.505, dampingFraction: 0.815, delay: 0 },
    unsplit: { response: 0.5, dampingFraction: 0.74, delay: 0 },
    dismiss: { response: 0.442, dampingFraction: 0.97, delay: 0 },
    resize: { response: 0.5, dampingFraction: 0.82, delay: 0 },
  },
  corner: {
    appear: { response: 0.483, dampingFraction: 0.62, delay: 0 },
    // alert-t1: radius RMS 0.54 to 0.20 pt against riding the height's spring.
    // Round 28 (t19 A and B, yes/yes on split-expand-b-t19, -t20 and split-alert-t19: iOS's growing
    // island keeps rounder, capsule-like ends through its small and medium sizes; the web's passed
    // through a boxier shape). Read at equal height rather than at equal time (`fit-corner-h.ts`:
    // outline.py's R on every growth frame of every seen take, on a 2 pt grid of heights), every
    // opening's corner sat under the takes' median from 46 to 100 pt tall, most at 50 to 70: alert
    // 0.8 to 1.1 pt (RMS 0.82), appear-alert and swap's B 1.2 to 2 (1.27, 1.18), expand, press,
    // expand-dark and wide-expand 0.8 to 1.2 (0.97), split-alert 1.8 to 2 (1.65) and split-expand-b
    // 3 to 3.6 (2.52), outside the takes' spread at most heights. Each spring refitted to that median:
    // alert 0.82 to 0.20 pt RMS, appear-alert and swap 1.23 to 0.18, the four press openings 0.97 to
    // 0.17, split-alert 1.65 to 0.11, split-expand-b 2.52 to 0.02 (`bubble.absorbExpandCorner`).
    expand: { response: 0.448, dampingFraction: 0.87, delay: 0.018 },
    // expand-t1, press, expand-dark-t1: 0.61 to 0.26 pt. Round 28: above.
    pressExpand: { response: 0.32, dampingFraction: 0.831, delay: 0.019 },
    // appear-alert-t1: 0.57 to 0.30 pt. Round 28: with swap's B through idle, above.
    appearExpand: { response: 0.452, dampingFraction: 0.865, delay: 0.02 },
    // split-alert-t1: 0.54 to 0.23 pt (with collapseSplit); 0.032 s after the retarget. Round 28:
    // 0.021 s after it, above.
    swap: { response: 0.41, dampingFraction: 0.888, delay: 0.244 },
    collapse: { response: 0.449, dampingFraction: 0.94, delay: 0.01 },
    // alert-t1, appear-alert-t1: 0.56 to 0.26 pt.
    // Round 43: read at equal height on every seen take (`box-end.py`, 25 alert, 25 appear-alert and
    // 48 swap takes, 50 to 90 pt) iOS's returning ends are the continuous corner at 0.93 to 0.96 of
    // half the height, as on the return into the split (`cornerLead`); on 0.518 the web's stayed a
    // capsule to 64 pt and read 0.6 to 1.3 pt rounder 10% down the end on all three. 0.47: swap's
    // 10% inset +0.12 pt from the median (at most 0.53), 5% at most 0.82 (render of the canonical take).
    alertCollapse: { response: 0.47, dampingFraction: 0.86, delay: 0.009 },
    // Round 41 (-t47 judge B, split-collapse-b f133 to 144: iOS's main pill keeps its lower shoulder
    // while the green moves into the bubble; split-alert f825 to 836, an early neck indent). On every
    // seen take (`box-shoulder.py`, the bottom edge 250 and 270 pt across) the web's lower right corner
    // turned up 1.2 to 2.3 pt early at +11 to +17 frames and the neck column 1 to 2.2 pt at +10 to +12:
    // its corner stayed round longer than iOS's while the height fell. On 0.36 (0.516): -0.3 to -1.1
    // and about 0 on six split-collapse-b takes; split-alert's neck at +371 to +373 -3.5 / -7.9 / -6.9
    // to -1.7 / -5.6 / -5.5 pt.
    collapseSplit: { response: 0.36, dampingFraction: 0.865, delay: 0 },
    // Capsule to capsule: the radius is half the height throughout, so these never show.
    split: { response: 0.505, dampingFraction: 0.815, delay: 0 },
    unsplit: { response: 0.5, dampingFraction: 0.74, delay: 0 },
    dismiss: { response: 0.442, dampingFraction: 0.97, delay: 0 },
    resize: { response: 0.5, dampingFraction: 0.82, delay: 0 },
  },
  press: {
    /** The hold squish for a controlled `IslandView pressed`. Settles, no bounce. */
    down: { response: 0.45, dampingFraction: 1 },
    up: { response: 0.36, dampingFraction: 0.62 },
    /**
     * The swell every press starts at touch-down: the pill grows about its centre, close to
     * linear at about 97 pt/s in width (0.65 of its size per second), x1.12 by +0.2 s, and keeps
     * growing until it turns back (hold200-t3: 172.5 pt at +0.25 s). Round 23: a spring aimed far
     * out (`metrics.press.swell`, x1.187) at 0.803 s and damping 0.64 rises close to linear and
     * traces tap, hold200, expand, press, idletap and idlehold to 0.22 pt RMS before they turn, on
     * the takes' native frames (the spring aimed at x1.062 at 0.509 s and damping 0.05 before it,
     * 0.66: it rounded off from +0.15 s and peaked at 166.7 pt on every press).
     */
    swell: { response: 0.803, dampingFraction: 0.641 },
    /**
     * The detached bubble's swell (a long-press on it), kept on round 16's spring, which its
     * opening was fitted with (split-expand-b). Optional; defaults to `swell`.
     */
    bubbleSwell: { response: 0.509, dampingFraction: 0.05 },
    /** Seconds of swell before a long-press expands: the swell starts at touch-down. */
    swellTime: 0.22,
    /** A press released before this many seconds is a tap; held past it, it becomes a long-press. */
    decide: 0.1,
    /** After a tap, or on an island with nothing to expand, the swell springs back with no bounce (idletap-t1 0.30 / 1.59, idlehold-t1 0.34 / 1.37). */
    release: { response: 0.3, dampingFraction: 1.5 },
    /**
     * Round 30 (the -t27 triangle judges on idletap and idlehold: iOS's pulse has "a longer
     * near-flat maximum", the web's "turns around sooner with a sharper, rounder, shorter peak").
     * On all 22 seen idle takes iOS's width holds within 0.4 pt of its peak for four to five
     * frames (idletap +8 to +12, idlehold +11 to +14) and comes off it slowly; the web's ran into
     * the turn at full speed and fell 1.5 to 2.5 pt under the takes' median two to six frames after
     * it. An idle swell now turns back keeping a fifth of its speed, on a slower spring, with the
     * hold's turn 10 ms later (`holdReturn`): `fit-swell.ts` cost idletap 0.232 to 0.133, idlehold
     * 0.396 to 0.156; tap and hold200 (an activity) keep `release`.
     * Round 31 (the proxy's idlehold content flag was the pill's rim showing past the sensor): read
     * to +64 frames, every seen idle take's height is back at rest by +34 while its width runs on,
     * 0.6 pt over what the height implies by +26 and rising again to 1.1 pt at +40 to +44, back by
     * +60 (all 21 takes within 0.05 pt); the web's width went straight to rest by +48 and its
     * height lagged 0.2 to 0.5 pt. The height now returns on a quicker spring keeping almost none
     * of its speed, and the width widens on its own (`idleWiden`): `fit-swell.ts --after 64` cost
     * idletap 1.785 to 0.107, idlehold 2.176 to 0.165; over round 30's +26 window idletap 0.133 to
     * 0.123, idlehold 0.156 to 0.170.
     */
    idleRelease: { spring: { response: 0.53, dampingFraction: 0.77 }, carry: 0.03 },
    idleWiden: { by: 1.12, rise: { response: 0.425, dampingFraction: 0.925 }, hold: 0.57, fall: { response: 0.3, dampingFraction: 1.15 } },
    /** A tap's swell on an activity turns back this long after touch-down at the soonest (tap-t1, t2, t3 peak +0.21 s after touch-down). */
    tapReturn: 0.22,
    /**
     * Round 23: a press on an activity released before `decide` turns back this long after the
     * release, if that is later than `tapReturn`. The swell grows while it waits: hold200-t3 (let
     * go after about 0.1 s) peaks at 172.46 pt two native frames after a 0.05 s tap's 168.71; 0.17
     * puts the web's at 172.38 on its frame (166.8 two frames early before), and a 0.05 s tap
     * still turns at `tapReturn` (168.71 now, 166.67 before). Optional; without it a tap always
     * turns at `tapReturn`.
     */
    releaseReturn: 0.17,
    /**
     * The same for a tap on an island with nothing to expand (idletap-t1 peaks at +0.183 s, 104.55
     * pt): with round 23's swell 0.19 puts the web's at 104.8 on iOS's frame (RMS 0.36 against
     * 0.41 at 0.22 before; 0.2 with round 31's `idleWiden`). Optional; defaults to `tapReturn`.
     */
    idleTapReturn: 0.2,
    /** A hold on an island with nothing to expand turns back this long after touch-down, finger still down (idlehold-t1 peaks at 106.42 pt; 0.22 with round 23's swell, 106.42, RMS 0.31 against 0.65 at 0.25 before; 0.23 with round 30's `idleRelease`, which leaves the turn flatter; 0.236 with round 31's `idleWiden`). */
    holdReturn: 0.236,
  },
  longPress: 0.216,
  longPressBubble: 0.224,
  alertContentDelay: 0.12,
  alertHold: 5.975,
  alertHoldIdle: 5.969,
  reduced: { duration: 0.2 }
};

/* 上游 transition 名单：island.js 的 MOTION.shape/body/corner 键集合必须与它一致 */
export const shapeTransitions = [
  "appear",
  "expand",
  "pressExpand",
  "appearExpand",
  "swap",
  "collapse",
  "alertCollapse",
  "collapseSplit",
  "split",
  "unsplit",
  "dismiss",
  "resize",
] as const;
