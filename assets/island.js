/* 灵动岛引擎：移植自 islandcn（MIT, copyright (c) 2026 Leo），署名见 NOTICE。
   spring / path / geometry 三节按 docs/reference/islandcn/ 的数学移植；
   motion 只取标定过的弹簧与时长（docs/reference/islandcn/motion-subset.ts）；
   React 协调层由本文件的固定模板渲染替代。改动清单见 NOTICE。
   加载时不碰 DOM：无 document 时整体降级，阅读路径不受影响。 */
(() => {
  'use strict';

  // ---- METRICS：docs/reference/islandcn/metrics.ts ----
  // 每个数都是上游对 iPhone 18 Pro 模拟器逐帧标定后的值，改写等于放弃保真度；
  // 需要偏差时走 metrics 覆盖，不要动这里。上游注释保留了标定的 take 编号。
  const METRICS = {
    screen: { width: 402, height: 874 },
    top: 13.91,
    idle: { width: 94.85, height: 36.84 },
    compact: {
      height: 36.85,
      sensorWidth: 94.85,
      edgePadding: 7.18,
      innerPadding: { leading: -0.18, trailing: 0.07 },
      maxSlotWidth: 72,
      maxWidth: 260,
      balance: 0.7475
    },
    minimal: {
      height: 36.85,
      attached: { outerPadding: 7.09, innerPadding: 8.4 },
      detached: { padding: 6.42, minWidth: 36.85 },
      gap: 7.82
    },
    split: {
      attached: { outerPadding: 6.59, gap: 6.15, innerPadding: 8.18 },
      detached: { outerPadding: 6.42, gap: 12, trailingPadding: 13.09, width: 62.18, slotGap: 6.085, slotEnd: 7.175 },
      maxSpan: 290
    },
    corner: { smoothing: 0.72 },
    expanded: {
      sideInset: 13.83,
      top: 13.83,
      minHeight: 84,
      maxHeight: 180,
      radius: 47.9,
      padding: { top: 18.18, side: 18.5, trailing: 17.81, bottom: 18.35 },
      bottomInset: 0,
      centerTop: 1.33,
      rowGap: 8,
      shadow: {
        offsetY: 10.7, blur: 30.76, aspect: 1.018, opacity: 0.3533,
        tail: { offsetY: 23.43, blur: 81.03, aspect: 1.084, strength: 0.0922 }
      }
    },
    contentClip: { radius: 34.4 },
    press: { squish: 0.09, swell: 0.187, bubbleSwell: 0.0622 },
    bridge: { handleSize: 2.4, spread: 0.3, maxGap: 5 },
    content: { blur: 8, scale: 0.85, follow: 1, followMin: 0.2, followMax: 2.5 },
    sensor: { opacity: 1 },
    keyline: {
      width: 1.5, alpha: 0.16, fullUntil: 0.04, noneFrom: 0.17,
      expandedDim: 0.07, ramp: 6,
      fade: [{ luma: 0.0706, share: 0.328 }, { luma: 0.1104, share: 0.109 }]
    }
  };

  // ---- MOTION：docs/reference/islandcn/motion-subset.ts ----
  // 三条弹簧（shape 边、body 高与顶、corner 圆角）各自独立：模拟器的圆角比高度
  // 慢半拍，写成一条弹簧会在收合时显得过圆。delay 是该腿的起跑延迟（秒）。
  const MOTION = {
    shape: {
      appear: { response: 0.483, dampingFraction: 0.62 },
      expand: { response: 0.517, dampingFraction: 0.824 },
      pressExpand: { response: 0.387, dampingFraction: 0.792 },
      appearExpand: { response: 0.54, dampingFraction: 0.811 },
      swap: { response: 0.498, dampingFraction: 0.829 },
      collapse: { response: 0.479, dampingFraction: 0.894 },
      alertCollapse: { response: 0.535, dampingFraction: 0.84 },
      collapseSplit: { response: 0.4, dampingFraction: 0.9 },
      split: { response: 0.505, dampingFraction: 0.815 },
      unsplit: { response: 0.487, dampingFraction: 0.794 },
      dismiss: { response: 0.432, dampingFraction: 1.019 },
      resize: { response: 0.5, dampingFraction: 0.82 }
    },
    body: {
      appear: { response: 0.483, dampingFraction: 0.62, delay: 0 },
      expand: { response: 0.497, dampingFraction: 0.825, delay: 0 },
      pressExpand: { response: 0.388, dampingFraction: 0.791, delay: 0 },
      appearExpand: { response: 0.523, dampingFraction: 0.817, delay: 0 },
      swap: { response: 0.492, dampingFraction: 0.832, delay: 0.223 },
      collapse: { response: 0.453, dampingFraction: 0.928, delay: 0 },
      alertCollapse: { response: 0.481, dampingFraction: 0.908, delay: 0 },
      collapseSplit: { response: 0.481, dampingFraction: 0.884, delay: 0 },
      split: { response: 0.505, dampingFraction: 0.815, delay: 0 },
      unsplit: { response: 0.5, dampingFraction: 0.74, delay: 0 },
      dismiss: { response: 0.442, dampingFraction: 0.97, delay: 0 },
      resize: { response: 0.5, dampingFraction: 0.82, delay: 0 }
    },
    corner: {
      appear: { response: 0.483, dampingFraction: 0.62, delay: 0 },
      expand: { response: 0.448, dampingFraction: 0.87, delay: 0.018 },
      pressExpand: { response: 0.32, dampingFraction: 0.831, delay: 0.019 },
      appearExpand: { response: 0.452, dampingFraction: 0.865, delay: 0.02 },
      swap: { response: 0.41, dampingFraction: 0.888, delay: 0.244 },
      collapse: { response: 0.449, dampingFraction: 0.94, delay: 0.01 },
      alertCollapse: { response: 0.47, dampingFraction: 0.86, delay: 0.009 },
      collapseSplit: { response: 0.36, dampingFraction: 0.865, delay: 0 },
      // 胶囊到胶囊时半径恒等于高度一半，这两条与 body 同值、实际不会显形
      split: { response: 0.505, dampingFraction: 0.815, delay: 0 },
      unsplit: { response: 0.5, dampingFraction: 0.74, delay: 0 },
      dismiss: { response: 0.442, dampingFraction: 0.97, delay: 0 },
      resize: { response: 0.5, dampingFraction: 0.82, delay: 0 }
    },
    press: {
      down: { response: 0.45, dampingFraction: 1 },
      up: { response: 0.36, dampingFraction: 0.62 },
      swell: { response: 0.803, dampingFraction: 0.641 },
      release: { response: 0.3, dampingFraction: 1.5 },
      swellTime: 0.22,
      decide: 0.1,
      tapReturn: 0.22,
      releaseReturn: 0.17,
      idleTapReturn: 0.2,
      holdReturn: 0.236
    },
    alertHold: 5.975,
    alertContentDelay: 0.12,
    longPress: 0.216,
    longPressBubble: 0.224,
    reduced: { duration: 0.2 }
  };

  // 减动效下所有腿换成这条：0.2s 收敛、临界阻尼无过冲（上游 motion.reduced）。
  const REDUCED_SPRING = { response: MOTION.reduced.duration / 2, dampingFraction: 1 };

  // ---- keyline：metrics.ts 的 keylineFade，两点之间按对数插值 ----
  // 上游试过一条指数线，过不了两个实测点，所以按段插值而不是外推。
  const luma = hex => {
    const value = parseInt(String(hex).replace('#', ''), 16);
    if (!Number.isFinite(value)) return 1;
    const channel = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(k => k / 255);
    return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
  };
  const keylineAlpha = backdrop => {
    const k = METRICS.keyline;
    const light = luma(backdrop);
    if (light >= k.noneFrom) return 0;
    if (light <= k.fullUntil) return k.alpha;
    const points = [{ luma: k.fullUntil, share: 1 }, ...k.fade, { luma: k.noneFrom, share: 0 }];
    for (let i = 1; i < points.length; i += 1) {
      if (light <= points[i].luma) {
        const from = points[i - 1], to = points[i];
        const t = Math.log(light / from.luma) / Math.log(to.luma / from.luma);
        const share = Math.exp(t * Math.log(Math.max(to.share, 1e-9) / from.share));
        return k.alpha * Math.min(1, Math.max(0, share));
      }
    }
    return 0;
  };

  // ---- 状态与时序（Task 6-8 填充）----
  let clock = () => (typeof performance === 'undefined' ? Date.now() / 1000 : performance.now() / 1000);
  let reducedMotion = false;
  const noop = () => {};
  const deadHandle = { id: '', update: noop, end: noop };

  const Island = {
    enabled: false,
    presentation: 'idle',
    activities: [],
    mount: noop,
    start: () => deadHandle,
    update: noop,
    end: noop,
    expand: noop,
    collapse: noop,
    press: noop,
    internals: { METRICS, MOTION, REDUCED_SPRING, luma, keylineAlpha, setClock: fn => { clock = fn; } }
  };
  Island.internals.setReducedMotion = value => { reducedMotion = !!value; };
  Island.internals.isReduced = () => reducedMotion;
  window.Island = Island;
})();
