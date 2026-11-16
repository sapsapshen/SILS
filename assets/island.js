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

  // ---- spring.ts：SwiftUI 参数的闭式阻尼弹簧 ----
  // stiffness = (2π/response)²，damping = 4π·dampingFraction/response，质量 1。
  // 闭式而非数值积分：任一时刻的值精确，所以暂停的时钟可以跳到任意一帧且每次
  // 得到同样的像素；数值积分会把步长选择变成可见差异。
  const solveSpring = (config, target, x0, v0, t) => {
    const w0 = 2 * Math.PI / config.response;
    const z = config.dampingFraction;
    const d = x0 - target;
    if (z < 1 - 1e-9) {
      const wd = w0 * Math.sqrt(1 - z * z);
      const e = Math.exp(-z * w0 * t);
      const A = d, B = (v0 + z * w0 * d) / wd;
      const s = Math.sin(wd * t), c = Math.cos(wd * t);
      return {
        value: target + e * (A * c + B * s),
        velocity: e * ((B * wd - A * z * w0) * c - (A * wd + B * z * w0) * s)
      };
    }
    if (z < 1 + 1e-9) {
      const e = Math.exp(-w0 * t);
      const A = d, B = v0 + w0 * d;
      return { value: target + e * (A + B * t), velocity: e * (B - w0 * (A + B * t)) };
    }
    const s = w0 * Math.sqrt(z * z - 1);
    const r1 = -z * w0 + s, r2 = -z * w0 - s;
    const A = (v0 - r2 * d) / (r1 - r2), B = d - A;
    const e1 = Math.exp(r1 * t), e2 = Math.exp(r2 * t);
    return { value: target + A * e1 + B * e2, velocity: A * r1 * e1 + B * r2 * e2 };
  };

  // 一个被动画的数字。set() 记下当前值与当前速度作为新弹簧的起点，所以展开
  // 在半途被打断成收合时不会出现跳变；重复 set 同一个目标不起新弹簧，否则
  // 每帧调 update 会把时钟按回 0，动画永远走不完。
  class AnimatedValue {
    constructor(value, config, velocity = 0) {
      this.start = value;
      this.startVelocity = velocity;
      this.current = value;
      this.target = value;
      this.velocity = velocity;
      this.time = 0;
      this.delay = 0;
      this.side = Math.sign(value - value);
      this.overshot = false;
      this.config = config;
    }
    set(target, config, delay = 0) {
      if (target === this.target && (config === undefined || config === this.config)) return;
      if (config !== undefined) this.config = config;
      this.start = this.current;
      this.startVelocity = this.velocity;
      this.target = target;
      this.time = 0;
      this.delay = delay;
      this.side = Math.sign(this.start - target);      // 出发方向；越过目标即过冲
      this.overshot = false;
    }
    step(dt) {
      if (!this.config) return;
      this.time += dt;
      if (this.time < this.delay) return;
      const state = solveSpring(this.config, this.target, this.start, this.startVelocity, this.time - this.delay);
      this.current = state.value;
      this.velocity = state.velocity;
      if (this.side !== 0 && Math.sign(this.current - this.target) === -this.side) this.overshot = true;
    }
    get value() { return this.current; }
    get done() {
      return this.time >= this.delay
        && Math.abs(this.current - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3;
    }
  }

  // ---- path.ts：连续圆角与黏颈的 SVG 路径构造 ----
  // 上游的圆角是"连续"的：中间一段半径 r 的圆弧，两侧各一条三次曲线把曲率从
  // 直边缓进圆弧，所以角不是切点而是渐变。smoothing 决定把手吃掉弧的多少角度
  // （0.72 是对着模拟器逐帧拟出来的）；装不下时只吃这条边允许的那部分，
  // 于是胶囊的短端保持圆头、长肩保持柔和——这是形状在中间态不发方的原因。
  const fmt = n => (Math.round(n * 1000) / 1000).toString();

  const edgeEase = (r, smoothing, room) => {
    const s = Math.max(0, Math.min(smoothing, room / r - 1));
    const angle = (Math.PI / 4) * s;
    const p = (1 + s) * r;
    const along = r * (1 - Math.sin(angle));
    const across = r * (1 - Math.cos(angle));
    const c = r * Math.tan(angle / 2) * Math.cos(angle);
    const b = Math.max(0, (p - c - along) / 3);
    return { p, a: 2 * b, b, along, across };
  };

  const continuousRectPath = (x, y, width, height, radius, smoothing, leading = radius) => {
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    if (w === 0 || h === 0) return '';
    const r = Math.max(0, Math.min(radius, w / 2, h / 2));
    const rl = Math.max(0, Math.min(leading, w / 2, h / 2));
    if (r < 1e-3 && rl < 1e-3) return `M ${fmt(x)} ${fmt(y)} H ${fmt(x + w)} V ${fmt(y + h)} H ${fmt(x)} Z`;
    const across = edgeEase(r, smoothing, w / 2);
    const down = edgeEase(r, smoothing, h / 2);
    const acrossL = rl === r ? across : edgeEase(rl, smoothing, w / 2);
    const downL = rl === r ? down : edgeEase(rl, smoothing, h / 2);
    const pt = (k, u, du, v, dv) => `${fmt(k.x + u.x * du + v.x * dv)} ${fmt(k.y + u.y * du + v.y * dv)}`;
    // u 沿"到达的那条边"回指，v 沿"离开的那条边"前指。
    const corner = (k, u, v, inc, out, rc) =>
      `L ${pt(k, u, inc.p, v, 0)} ` +
      `C ${pt(k, u, inc.p - inc.a, v, 0)} ${pt(k, u, inc.p - inc.a - inc.b, v, 0)} ${pt(k, u, inc.along, v, inc.across)} ` +
      `A ${fmt(rc)} ${fmt(rc)} 0 0 1 ${pt(k, v, out.along, u, out.across)} ` +
      `C ${pt(k, v, out.p - out.a - out.b, u, 0)} ${pt(k, v, out.p - out.a, u, 0)} ${pt(k, v, out.p, u, 0)} `;
    const right = x + w;
    const bottom = y + h;
    return (
      `M ${fmt(x + acrossL.p)} ${fmt(y)} ` +
      corner({ x: right, y }, { x: -1, y: 0 }, { x: 0, y: 1 }, across, down, r) +
      corner({ x: right, y: bottom }, { x: 0, y: -1 }, { x: -1, y: 0 }, down, across, r) +
      corner({ x, y: bottom }, { x: 1, y: 0 }, { x: 0, y: -1 }, acrossL, downL, rl) +
      corner({ x, y }, { x: 0, y: 1 }, { x: 1, y: 0 }, downL, acrossL, rl) +
      'Z'
    );
  };

  // 非圆弧的角按折线画：岛这个尺寸上 24 段离真曲线不到百分之一.pt。
  const SEGMENTS = 24;
  const cornerPath = (cx, cy, c, from) => {
    if (c.rx <= 0 || c.ry <= 0) return '';
    if (Math.abs(c.exponent - 2) < 1e-3) {
      const end = from + Math.PI / 2;
      return `A ${fmt(c.rx)} ${fmt(c.ry)} 0 0 1 ${fmt(cx + c.rx * Math.cos(end))} ${fmt(cy + c.ry * Math.sin(end))} `;
    }
    const power = 2 / c.exponent;
    let out = '';
    for (let i = 1; i <= SEGMENTS; i += 1) {
      const angle = from + (Math.PI / 2) * (i / SEGMENTS);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      out += `L ${fmt(cx + c.rx * Math.sign(cos) * Math.abs(cos) ** power)} ` +
             `${fmt(cy + c.ry * Math.sign(sin) * Math.abs(sin) ** power)} `;
    }
    return out;
  };

  const roundedRectPath = (x, y, width, height, corner, leading = corner) => {
    if ((corner.smoothing || 0) > 0) {
      return continuousRectPath(x, y, width, height, corner.rx, corner.smoothing || 0, leading.rx);
    }
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    if (w === 0 || h === 0) return '';
    const clampTo = k => ({
      rx: Math.max(0, Math.min(k.rx, w / 2)),
      ry: Math.max(0, Math.min(k.ry, h / 2)),
      exponent: k.exponent
    });
    const c = clampTo(corner);
    const l = leading === corner ? c : clampTo(leading);
    const r = x + w;
    const b = y + h;
    return (
      `M ${fmt(x + l.rx)} ${fmt(y)} ` +
      `L ${fmt(r - c.rx)} ${fmt(y)} ` + cornerPath(r - c.rx, y + c.ry, c, -Math.PI / 2) +
      `L ${fmt(r)} ${fmt(b - c.ry)} ` + cornerPath(r - c.rx, b - c.ry, c, 0) +
      `L ${fmt(x + l.rx)} ${fmt(b)} ` + cornerPath(x + l.rx, b - l.ry, l, Math.PI / 2) +
      `L ${fmt(x)} ${fmt(y + l.ry)} ` + cornerPath(x + l.rx, y + l.ry, l, Math.PI) +
      'Z'
    );
  };

  const capsulePath = (x, y, width, height, smoothing = 0) => {
    const r = Math.min(width, height) / 2;
    return roundedRectPath(x, y, width, height, { rx: r, ry: r, exponent: 2, smoothing });
  };

  const polar = (c, angle, length) => ({ x: c.x + length * Math.cos(angle), y: c.y + length * Math.sin(angle) });

  // 两圆之间的黏颈（metaball bridge）：一条闭合路径，与两圆同色填充后读作一个
  // 液态形状。间隙到 maxGap 时颈细到消失，所以分裂断开时不会"啪"地弹出。
  const bridgePath = (a, b, options) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (a.r <= 0 || b.r <= 0 || d <= Math.abs(a.r - b.r)) return '';
    const gap = d - a.r - b.r;
    if (gap >= options.maxGap) return '';
    const reach = Math.max(0, gap) / options.maxGap;
    const v = options.spread * (1 - reach) ** (options.power || 1.5);
    if (v <= 1e-4) return '';
    let u1 = 0;
    let u2 = 0;
    if (d < a.r + b.r) {
      u1 = Math.acos(Math.min(1, Math.max(-1, (a.r * a.r + d * d - b.r * b.r) / (2 * a.r * d))));
      u2 = Math.acos(Math.min(1, Math.max(-1, (b.r * b.r + d * d - a.r * a.r) / (2 * b.r * d))));
    }
    const between = Math.atan2(dy, dx);
    const maxSpread = Math.acos(Math.min(1, Math.max(-1, (a.r - b.r) / d)));
    const angle1 = between + u1 + (maxSpread - u1) * v;
    const angle2 = between - u1 - (maxSpread - u1) * v;
    const angle3 = between + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
    const angle4 = between - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;
    const p1 = polar(a, angle1, a.r);
    const p2 = polar(a, angle2, a.r);
    const p3 = polar(b, angle3, b.r);
    const p4 = polar(b, angle4, b.r);
    const total = a.r + b.r;
    const handle = Math.min(v * options.handleSize, Math.hypot(p1.x - p3.x, p1.y - p3.y) / total) * Math.min(1, (d * 2) / total);
    const h1 = polar(p1, angle1 - Math.PI / 2, a.r * handle);
    const h2 = polar(p2, angle2 + Math.PI / 2, a.r * handle);
    const h3 = polar(p3, angle3 + Math.PI / 2, b.r * handle);
    const h4 = polar(p4, angle4 - Math.PI / 2, b.r * handle);
    const point = k => `${fmt(k.x)} ${fmt(k.y)}`;
    return `M ${point(p1)} C ${point(h1)} ${point(h3)} ${point(p3)} L ${point(p4)} C ${point(h4)} ${point(h2)} ${point(p2)} Z`;
  };

  // 颈刚断开时留在两端的短尖：两侧从圆上离开后又贴回圆，所以是凹而窄的。
  const cuspPath = (c, toward, length, base = 0.5) => {
    const d = Math.hypot(toward.x - c.x, toward.y - c.y);
    if (c.r <= 0 || d < 1e-6 || length < 0.01) return '';
    const aim = Math.atan2(toward.y - c.y, toward.x - c.x);
    const tip = polar(c, aim, c.r + length);
    const point = k => `${fmt(k.x)} ${fmt(k.y)}`;
    return (
      `M ${point(polar(c, aim + base, c.r))} Q ${point(polar(c, aim + base * 0.25, c.r))} ${point(tip)} ` +
      `Q ${point(polar(c, aim - base * 0.25, c.r))} ${point(polar(c, aim - base, c.r))} L ${point(c)} Z`
    );
  };

  // 内容遮罩用的 45 度切角矩形：模拟器就是这样裁展开内容的（52pt 方块与底部
  // 进度条的外角沿 x + y = r 被切掉）。
  const chamferPath = (x, y, width, height, leg) => {
    const w = Math.max(0, width);
    const h = Math.max(0, height);
    if (w === 0 || h === 0) return '';
    const c = Math.max(0, Math.min(leg, w / 2, h / 2));
    const r = x + w;
    const b = y + h;
    return (
      `M ${fmt(x + c)} ${fmt(y)} L ${fmt(r - c)} ${fmt(y)} L ${fmt(r)} ${fmt(y + c)} L ${fmt(r)} ${fmt(b - c)} ` +
      `L ${fmt(r - c)} ${fmt(b)} L ${fmt(x + c)} ${fmt(b)} L ${fmt(x)} ${fmt(b - c)} L ${fmt(x)} ${fmt(y + c)} Z`
    );
  };

  // ---- geometry.ts：形状要去哪里 ----
  // left/right 是相对屏幕中线的偏移，所以传感器区恒在 0；top 从屏幕顶算。
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  // 岛按哪个宽度排版：容器宽度，但永不宽过一台手机。
  const islandScreenWidth = containerWidth =>
    (containerWidth > 0 ? Math.min(containerWidth, METRICS.screen.width) : METRICS.screen.width);
  const expandedWidth = screenWidth => screenWidth - 2 * METRICS.expanded.sideInset;
  const hiddenBubble = (right, height) => ({ bubbleLeft: right - height, bubbleRight: right, bubbleHeight: 0 });

  // 紧凑胶囊两侧的伸展：一侧为空就留在传感器边，两侧都有内容才受 balance 约束。
  const compactSides = measure => {
    const c = METRICS.compact;
    const side = (slot, inner) => (slot > 0 ? inner + Math.min(slot, c.maxSlotWidth) + c.edgePadding : 0);
    const leading = side(measure.leading, c.innerPadding.leading);
    const trailing = side(measure.trailing, c.innerPadding.trailing);
    if (leading <= 0 || trailing <= 0 || c.balance <= 0) return { leading, trailing };
    return { leading: Math.max(leading, trailing * c.balance), trailing: Math.max(trailing, leading * c.balance) };
  };

  // iOS 27 的分裂：两枚胶囊各显示自己活动的紧凑内容。主胶囊占到传感器右边就
  // 停，副胶囊恒 62.18；总跨度超过 maxSpan 时上游退回 minimal，这里照做。
  const splitLayout = measure => {
    if (!measure.split) return null;
    const s = METRICS.split;
    const sensor = METRICS.compact.sensorWidth / 2;
    const { attached, detached } = measure.split;
    const pair = (slots, gap) => slots.leading + slots.trailing + (slots.leading > 0 && slots.trailing > 0 ? gap : 0);
    const attachedWidth = s.attached.outerPadding + pair(attached, s.attached.gap) + s.attached.innerPadding;
    const bubbleWidth = s.detached.width > 0 && detached.trailing > 0
      ? s.detached.width
      : Math.max(METRICS.minimal.detached.minWidth,
        s.detached.outerPadding + pair(detached, s.detached.gap) +
        (detached.trailing > 0 ? s.detached.trailingPadding : s.detached.outerPadding));
    const left = -(sensor + attachedWidth);
    const bubbleLeft = sensor + METRICS.minimal.gap;
    const bubbleRight = bubbleLeft + bubbleWidth;
    if (bubbleRight - left > s.maxSpan) return null;
    return { left, right: sensor, bubbleLeft, bubbleRight, attachedWidth, bubbleWidth };
  };

  // 副胶囊 trailing 槽在静止时的画法：画多宽（内容裁到剩的那点空间）与中心在哪，
  // 从右边量起，这样胶囊从主胶囊里弹出来时内容跟着右缘走。
  const bubbleTrailing = (detached, bubbleWidth) => {
    const d = METRICS.split.detached;
    if (d.width <= 0) {
      return { width: detached.trailing, fromRight: d.trailingPadding + detached.trailing / 2, room: Infinity };
    }
    const start = d.outerPadding + detached.leading + d.slotGap;
    const end = bubbleWidth - d.slotEnd;
    const room = Math.max(0, end - start);
    return { width: Math.min(detached.trailing, room), fromRight: bubbleWidth - (start + end) / 2, room };
  };

  const shapeTarget = (kind, measure, containerWidth) => {
    const screenWidth = islandScreenWidth(containerWidth);
    const top = METRICS.top;
    switch (kind) {
      case 'idle': {
        const { width, height } = METRICS.idle;
        return { left: -width / 2, right: width / 2, top, height, radius: height / 2, ...hiddenBubble(width / 2, height) };
      }
      case 'compact': {
        const c = METRICS.compact;
        const sensor = c.sensorWidth / 2;
        // 两侧各按自己的内容生长，所以模拟器上的紧凑胶囊本来就略偏中心。
        const sides = compactSides(measure);
        const left = -Math.min(sensor + sides.leading, c.maxWidth / 2);
        const right = Math.min(sensor + sides.trailing, c.maxWidth / 2);
        return { left, right, top, height: c.height, radius: c.height / 2, ...hiddenBubble(right, c.height) };
      }
      case 'minimal': {
        const m = METRICS.minimal;
        const sensor = METRICS.compact.sensorWidth / 2;
        const split = splitLayout(measure);
        if (split) return { ...split, top, height: m.height, radius: m.height / 2, bubbleHeight: m.height };
        // 退回 minimal：主胶囊保持传感器右缘，向左生长以容纳自己的内容。
        const left = measure.attached > 0 ? -(sensor + m.attached.innerPadding + measure.attached + m.attached.outerPadding) : -sensor;
        const right = sensor;
        const bubbleWidth = Math.max(m.detached.minWidth, measure.detached + 2 * m.detached.padding);
        return {
          left, right, top, height: m.height, radius: m.height / 2,
          bubbleLeft: right + m.gap, bubbleRight: right + m.gap + bubbleWidth, bubbleHeight: m.height
        };
      }
      case 'expanded': {
        const e = METRICS.expanded;
        const half = expandedWidth(screenWidth) / 2;
        const height = clamp(measure.expandedHeight + e.padding.top + e.padding.bottom, e.minHeight, e.maxHeight);
        return { left: -half, right: half, top: e.top, height, radius: e.radius, ...hiddenBubble(half, METRICS.compact.height) };
      }
      default:
        return shapeTarget('idle', measure, containerWidth);
    }
  };

  // 两次呈现之间该用哪条弹簧。swap 指"换的活动"（A 的紧凑到 B 的展开，要经过
  // idle）；swelling 指长按已把胶囊胀起来；alert 指离开的展开面是一次提醒。
  const shapeTransition = (from, to, options) => {
    const o = options || {};
    if (from === to) return 'resize';
    if (to === 'expanded') {
      if (from === 'idle') return 'appearExpand';
      if (from === 'minimal' || o.swap) return 'swap';
      return o.swelling ? 'pressExpand' : 'expand';
    }
    if (from === 'expanded') {
      if (to === 'minimal') return 'collapseSplit';
      if (to === 'idle') return 'dismiss';
      return o.alert ? 'alertCollapse' : 'collapse';
    }
    if (to === 'idle') return 'dismiss';
    if (from === 'idle') return 'appear';
    if (to === 'minimal') return 'split';
    return 'unsplit';
  };


  // ---- keyline：metrics.ts 的 keylineFade ----
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

  // ---- 活动栈：store.ts ----
  const state = { activities: [], expanded: null, front: {}, handoff: null, nextOrder: 1 };
  let clockNow = () => (typeof performance === 'undefined' ? Date.now() / 1000 : performance.now() / 1000);
  let render = () => {};
  const timers = [];                                  // {at, fn}，Task 7 的 alert 与长按用
  const bySort = (a, b) => b.priority - a.priority || a.order - b.order;
  const find = id => state.activities.find(a => a.id === id);
  const commit = () => { syncShape(); render(); };

  // 一侧为空时用另一侧，都没有时用 compact：上游 minimal 的兜底顺序。
  const minimalOf = content => (content && content.minimal) || (content && content.compact) || null;

  // 同组活动轮流显示：被 expand/alert 顶到前面的那条优先，否则最先开始的胜出。
  const shownOf = snapshot => group => {
    const members = snapshot.activities.filter(a => a.group === group);
    const forward = snapshot.front[group];
    if (forward !== undefined && members.some(a => a.id === forward)) return forward;
    const first = members.reduce((best, a) => (best === null || a.order < best.order ? a : best), null);
    return first ? first.id : null;
  };
  const isShown = (snapshot, activity) =>
    activity.group === null || (snapshot.handoff !== activity.group && shownOf(snapshot)(activity.group) === activity.id);

  const deriveScene = snapshot => {
    const shown = snapshot.activities.filter(a => isShown(snapshot, a));
    const first = shown[0];
    const second = shown[1];
    const expanded = snapshot.expanded ? snapshot.activities.find(a => a.id === snapshot.expanded.id) : undefined;
    if (expanded) {
      return {
        presentation: { kind: 'expanded', ...(expanded.content.expanded || {}) },
        contentKey: `expanded:${expanded.id}#${expanded.revision}`,
        label: expanded.label, primary: expanded, detached: null
      };
    }
    if (!first) return { presentation: { kind: 'idle' }, contentKey: 'idle', label: '', primary: null, detached: null };
    if (!second) {
      return {
        presentation: { kind: 'compact', ...(first.content.compact || {}) },
        contentKey: `compact:${first.id}#${first.revision}`,
        label: first.label, primary: first, detached: null
      };
    }
    // iOS 27 的分裂里两枚胶囊都显示各自活动的紧凑内容；minimal 只是装不下时的退路。
    return {
      presentation: {
        kind: 'minimal',
        attached: minimalOf(first.content),
        detached: minimalOf(second.content),
        split: { attached: first.content.compact || {}, detached: second.content.compact || {} }
      },
      contentKey: `minimal:${first.id}#${first.revision}:${second.id}#${second.revision}`,
      label: `${first.label}, ${second.label}`,
      primary: first, detached: second
    };
  };

  // 深合并：只覆盖给到的槽，所以 {compact:{trailing}} 保留 leading。
  const merge = (base, over) => {
    if (!base) return over;
    const out = { ...base };
    for (const key of Object.keys(over || {})) out[key] = over[key];
    return out;
  };

  const push = (at, fn, id) => { timers.push({ at, fn, id }); timers.sort((a, b) => a.at - b.at); };
  // alerting：记住"当前展开是一次提醒"，回落时才能选 alertCollapse 那条弹簧。
  const alerting = new Set();
  // 上游语义（motion.ts 的 alertContentDelay 注释）：提醒**先用旧内容展开**，
  // 新内容 alertContentDelay 之后就地换上，hold 用完后回落。在 idle 岛上出场的
  // 提醒回落略早（alertHoldIdle），因为它没有"旧内容那一拍"。
  const scheduleAlert = (id, at, contentDelta, wasIdle) => {
    if (!find(id)) return;
    const idle = wasIdle === undefined ? deriveScene(state).presentation.kind === 'idle' : wasIdle;
    const hold = idle ? (MOTION.alertHoldIdle || MOTION.alertHold) : MOTION.alertHold;
    alerting.add(id);
    expand(id);
    if (contentDelta) push(at + MOTION.alertContentDelay, () => update(id, contentDelta), id);
    push(at + hold, () => {
      alerting.delete(id);
      if (state.expanded && state.expanded.id === id) collapse();
    }, id);
  };

  const handle = id => ({ id, update: partial => update(id, partial), end: () => end(id) });

  function start(options) {
    const existing = find(options.id);
    if (existing) { update(options.id, options); return handle(options.id); }
    // 出场时岛是不是空的，决定这次提醒用 alertHold 还是略短的 alertHoldIdle。
    const wasIdle = deriveScene(state).presentation.kind === 'idle';
    state.activities.push({
      id: options.id,
      label: options.label || options.id,
      priority: options.priority || 0,
      group: options.group === undefined ? null : options.group,
      order: state.nextOrder++,
      startedAt: clockNow(),
      revision: 0,
      content: { compact: options.compact || null, minimal: options.minimal || null, expanded: options.expanded || null },
      onPress: options.onPress || null
    });
    state.activities.sort(bySort);
    if (options.alert) scheduleAlert(options.id, clockNow(), null, wasIdle);
    commit();
    return handle(options.id);
  }

  function update(id, partial) {
    const activity = find(id);
    if (!activity) return;
    if (partial.alert) {
      // 提醒这一拍先把岛展开成旧内容，新内容 0.12s 后就地换上（见 scheduleAlert）。
      const delta = { ...partial };
      delete delta.alert;
      scheduleAlert(id, clockNow(), Object.keys(delta).length ? delta : null);
      return;
    }
    applyContent(activity, partial);
    state.activities.sort(bySort);
    commit();
  }

  function applyContent(activity, partial) {
    if (partial.compact) activity.content.compact = merge(activity.content.compact, partial.compact);
    if (partial.expanded) activity.content.expanded = merge(activity.content.expanded, partial.expanded);
    if (partial.minimal) activity.content.minimal = merge(activity.content.minimal, partial.minimal);
    if (partial.label) activity.label = partial.label;
    if (partial.priority !== undefined) activity.priority = partial.priority;
    if (partial.onPress) activity.onPress = partial.onPress;
    // 内容"换脸"而非"变值"时 bump revision：渲染层据此换图层并走 crossfade。
    if (partial.transition === 'crossfade') activity.revision += 1;
  }

  function end(id) {
    const index = state.activities.findIndex(a => a.id === id);
    if (index < 0) return;
    const [gone] = state.activities.splice(index, 1);
    if (state.expanded && state.expanded.id === id) state.expanded = null;
    if (gone.group !== null && state.front[gone.group] === id) delete state.front[gone.group];
    for (let i = timers.length - 1; i >= 0; i -= 1) if (timers[i].id === id) timers.splice(i, 1);
    commit();
  }

  function expand(id) {
    const scene = deriveScene(state);
    const target = id ? find(id) : scene.primary;
    if (!target) return;
    if (target.group !== null) state.front[target.group] = target.id;
    state.expanded = { id: target.id, at: clockNow() };
    commit();
  }

  function collapse() { state.expanded = null; commit(); }

  // ---- 形状：八条腿各自一条弹簧 ----
  // left/right/top/height 走 shape 与 body，radius 走 corner。上游把它们分开是
  // 因为模拟器的圆角比高度慢半拍：合成一条弹簧会在收合时显得过方或过圆。
  const SHAPE_KEYS = ['left', 'right', 'top', 'height', 'radius', 'bubbleLeft', 'bubbleRight', 'bubbleHeight'];
  const TABLE_OF = { left: 'shape', right: 'shape', bubbleLeft: 'shape', bubbleRight: 'shape', top: 'body', height: 'body', bubbleHeight: 'body', radius: 'corner' };
  const emptyMeasure = () => ({ leading: 0, trailing: 0, attached: 0, detached: 0, split: null, expandedHeight: 0 });

  // headless（无 DOM）时的内容宽度模型：真实绘制由 Task 8 的 offsetWidth 实测，
  // 这里只为让状态机与几何在没有页面的环境里仍然可算、可测。数字取自上游槽位：
  // 紧凑图标 22pt、副胶囊 ring 20pt、15px 等宽数字约 6.6pt/字。
  const HEADLESS = { glyph: 22, ring: 20, time: 33, char: 6.6, expandedHeight: 70 };
  const specWidth = spec => {
    if (!spec || typeof spec !== 'object') return 0;
    if (spec.glyph !== undefined) return HEADLESS.glyph;
    if (spec.ring !== undefined) return HEADLESS.ring;
    if (spec.time !== undefined) return HEADLESS.time;
    if (spec.text !== undefined) return String(spec.text).length * HEADLESS.char;
    if (spec.bar !== undefined || spec.buttons) return 0;
    return 0;
  };
  // DOM 可用时优先实测：槽位宽度是内容决定的，估算只在没有页面时兜底。
  const measureSlot = (spec, node) => (node && node.offsetWidth ? node.offsetWidth : specWidth(spec));

  const measureOf = (scene, nodes) => {
    const p = scene.presentation;
    const out = emptyMeasure();
    if (p.kind === 'compact') {
      out.leading = measureSlot(p.leading, nodes && nodes.leading);
      out.trailing = measureSlot(p.trailing, nodes && nodes.trailing);
    } else if (p.kind === 'minimal') {
      out.split = {
        attached: { leading: specWidth(p.split.attached.leading), trailing: specWidth(p.split.attached.trailing) },
        detached: { leading: specWidth(p.split.detached.leading), trailing: specWidth(p.split.detached.trailing) }
      };
      out.attached = specWidth(p.attached && (p.attached.leading !== undefined ? p.attached.leading : p.attached));
      out.detached = specWidth(p.detached && (p.detached.leading !== undefined ? p.detached.leading : p.detached));
    } else if (p.kind === 'expanded') {
      out.expandedHeight = (nodes && nodes.expandedHeight) || HEADLESS.expandedHeight;
    }
    return out;
  };

  const springFor = (table, name) => {
    const base = (MOTION[table] && MOTION[table][name]) || MOTION.shape.resize;
    if (!reducedMotion) return base;
    return { response: REDUCED_SPRING.response, dampingFraction: REDUCED_SPRING.dampingFraction, delay: 0 };
  };

  const idleTarget = shapeTarget('idle', emptyMeasure(), METRICS.screen.width);
  const shapeValues = {};
  SHAPE_KEYS.forEach(key => { shapeValues[key] = new AnimatedValue(idleTarget[key], MOTION.shape.resize); });
  let lastKind = 'idle';
  let lastPrimaryId = null;
  let lastScreenWidth = METRICS.screen.width;
  let lastTickAt = null;
  let measuredNodes = null;

  const retarget = (target, name) => {
    for (const key of SHAPE_KEYS) {
      const config = springFor(TABLE_OF[key], name);
      shapeValues[key].set(target[key], config, reducedMotion ? 0 : (config.delay || 0));
    }
  };

  // 呈现变了就换弹簧目标；transition 由上游那张选择矩阵决定。
  const syncShape = () => {
    if (!mounted) return;
    const scene = deriveScene(state);
    const kind = scene.presentation.kind;
    const primaryId = scene.primary ? scene.primary.id : null;
    const swap = primaryId !== lastPrimaryId && kind !== 'idle';
    const options = {
      swap,
      swelling: pressKind === 'hold' && (clockNow() - pressAt) >= MOTION.press.decide,
      alert: alerting.size > 0
    };
    const target = shapeTarget(kind, measureOf(scene, measuredNodes), lastScreenWidth);
    retarget(target, shapeTransition(lastKind, kind, options));
    lastKind = kind;
    lastPrimaryId = primaryId;
  };

  const outsidePress = () => { if (state.expanded) collapse(); };
  const keyEscape = () => { if (state.expanded) collapse(); };

  let pressKind = null;
  let pressAt = 0;
  const press = kind => {
    pressKind = kind;
    pressAt = clockNow();
    if (kind === 'tap') release();
    else commit();
  };
  function release() {
    if (!pressKind) return;
    const held = clockNow() - pressAt;
    const primary = deriveScene(state).primary;
    // 长按只负责展开（由 tick 越过阈值时触发），点按才走活动自己的 onPress。
    if (pressKind === 'tap' || held < MOTION.longPress) { if (primary && primary.onPress) primary.onPress(); }
    pressKind = null;
    commit();
  }

  // ---- 渲染层：固定模板，不做通用组件树 ----
  // 上游用 React 协调任意 ReactNode；本站只需要七个内容原子，所以这里是一棵
  // 一次建好、之后只改属性的固定树。形状只写 path 的 d 与 transform/opacity，
  // 绝不写 width/height/top/left——那会在 40 万字的文档上触发重排。
  const SVG_NS = 'http://www.w3.org/2000/svg';
  // 两个符号自绘（不引 Hugeicons，见 NOTICE）：书签与莲座。
  const GLYPHS = {
    bookmark: 'M7 3.5h10c.6 0 1 .4 1 1V20l-6-3.2-6 3.2V4.5c0-.6.4-1 1-1Z',
    lotus: 'M12 20.5C7.9 18.6 5 15.1 5 11.3c0-1.9.8-3.7 2.3-5.3.9 2.3 2.5 4.1 4.7 5.4 2.2-1.3 3.8-3.1 4.7-5.4 1.5 1.6 2.3 3.4 2.3 5.3 0 3.8-2.9 7.3-7 9.2Z' +
      'M12 5.5c1.6 2.1 2.2 4.2 1.8 6.4-.6.4-1.2.7-1.8.9-.6-.2-1.2-.5-1.8-.9-.4-2.2.2-4.3 1.8-6.4Z'
  };
  const CHAR_MS = 6.6;                              // 15px 等宽数字的字宽估算（headless）

  const el = (tag, cls, attrs) => {
    const n = document.createElement(tag);
    if (cls) n.setAttribute('class', cls);
    for (const key in attrs || {}) n.setAttribute(key, attrs[key]);
    return n;
  };
  const svgEl = (tag, cls, attrs) => {
    const n = document.createElementNS(SVG_NS, tag);
    if (cls) n.setAttribute('class', cls);
    for (const key in attrs || {}) n.setAttribute(key, attrs[key]);
    return n;
  };

  const node = {};                                  // 结构缓存
  let contentKey = '';
  let frameQueued = false;
  let timeAtom = null;

  const slotPair = cls => {
    const wrap = el('span', cls);
    wrap.append(el('span', 'island-slot leading'), el('span', 'island-slot trailing'));
    return wrap;
  };

  function buildDom(root, backdrop) {
    const island = el('div', 'island', { role: 'group' });
    node.region = island;
    node.shape = svgEl('svg', 'island-shape', { 'aria-hidden': 'true' });
    node.shape.appendChild(svgEl('title')).textContent = '灵动岛';
    node.fill = svgEl('path', 'island-fill');
    node.keyline = svgEl('path', 'island-keyline');
    const alpha = keylineAlpha(backdrop || '#ffffff');
    if (alpha > 0) node.keyline.setAttribute('stroke-opacity', String(alpha));
    node.shape.append(node.fill, node.keyline);
    node.sensor = el('div', 'island-sensor', { 'aria-hidden': 'true' });
    node.pill = el('button', 'island-pill', { type: 'button', 'aria-expanded': 'false' });
    node.pill.append(el('span', 'island-slot leading'), el('span', 'island-slot trailing'));
    node.bubble = el('div', 'island-bubble');
    node.bubble.append(el('span', 'island-slot leading'), el('span', 'island-slot trailing'));
    node.expanded = el('div', 'island-expanded');
    const row = el('div', 'island-row');
    node.expandedLeading = el('span', 'island-region', { 'data-slot': 'leading' });
    node.expandedCenter = el('span', 'island-region', { 'data-slot': 'center' });
    node.expandedTrailing = el('span', 'island-region', { 'data-slot': 'trailing' });
    row.append(node.expandedLeading, node.expandedCenter, node.expandedTrailing);
    node.expandedBottom = el('div', 'island-region', { 'data-slot': 'bottom' });
    node.expanded.append(row, node.expandedBottom);
    node.live = el('p', 'island-live', { role: 'status', 'aria-live': 'polite' });
    island.append(node.shape, node.sensor, node.pill, node.bubble, node.expanded, node.live);
    root.appendChild(island);

    node.pill.addEventListener('pointerdown', () => press('hold'));
    node.pill.addEventListener('pointerup', () => release());
    node.pill.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); expand(); }
      else if (event.key === 'Escape') collapse();
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('keydown', event => { if (event.key === 'Escape') keyEscape(); });
      document.addEventListener('pointerdown', event => {
        if (event.target && node.region && node.region.children && !contains(node.region, event.target)) outsidePress();
      });
    }
    return island;
  }
  const contains = (parent, child) => {
    if (parent === child) return true;
    for (const kid of parent.children || []) if (contains(kid, child)) return true;
    return false;
  };

  // ---- 内容原子 ----
  const atom = spec => {
    if (!spec) return null;
    if (spec.glyph !== undefined) {
      const mark = svgEl('svg', 'island-glyph', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true' });
      mark.appendChild(svgEl('path', null, { d: GLYPHS[spec.glyph] || GLYPHS.bookmark, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      return mark;
    }
    if (spec.ring !== undefined) return ring(spec.ring, spec.size || 20);
    if (spec.bar !== undefined) return bar(spec.bar);
    if (spec.buttons) return buttonRow(spec.buttons);
    if (spec.label !== undefined) { const n = el('span', 'island-label'); n.textContent = spec.label; return n; }
    if (spec.time !== undefined) return timeAtomFor(spec);
    if (spec.value !== undefined) { const n = el('span', 'island-value'); n.textContent = String(spec.value); return n; }
    if (spec.subtitle !== undefined) { const n = el('span', 'island-subtitle'); n.textContent = String(spec.subtitle); return n; }
    if (spec.title !== undefined) { const n = el('span', 'island-title'); n.textContent = String(spec.title); return n; }
    if (spec.text !== undefined) { const n = el('span', 'island-text'); n.textContent = String(spec.text); return n; }
    return null;
  };
  const ring = (value, size) => {
    const r = (size - 3) / 2;
    const circumference = 2 * Math.PI * r;
    const mark = svgEl('svg', 'island-ring', { viewBox: `0 0 ${size} ${size}`, width: String(size), height: String(size), 'aria-hidden': 'true' });
    mark.appendChild(svgEl('circle', 'island-ring-track', { cx: size / 2, cy: size / 2, r, 'stroke-width': '3' }));
    const arc = svgEl('circle', 'island-ring-arc', {
      cx: size / 2, cy: size / 2, r, 'stroke-width': '3',
      'stroke-dasharray': `${(Math.max(0, Math.min(1, value)) * circumference).toFixed(3)} ${circumference.toFixed(3)}`
    });
    mark.appendChild(arc);
    return mark;
  };
  const bar = value => {
    const wrap = el('div', 'island-bar');
    const fill = el('i');
    // 用 scaleX 而非 width：底部条跟着值走时不该让展开面重新布局。
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
    wrap.appendChild(fill);
    return wrap;
  };
  const buttonRow = buttons => {
    const wrap = el('span', 'island-buttons');
    buttons.forEach(config => {
      const button = el('button', 'island-btn', { type: 'button' });
      button.textContent = config.label;
      button.addEventListener('click', () => { if (config.onPress) config.onPress(config.key); });
      wrap.appendChild(button);
    });
    return wrap;
  };
  const formatMs = (ms, format, locale) => {
    const total = Math.max(0, Math.round(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    if (format === 'mm:ss') return `${minutes}:${String(seconds).padStart(2, '0')}`;
    const hours = Math.floor(minutes / 60);
    return hours > 0 ? `${hours} 小时 ${minutes % 60} 分` : `${minutes} 分 ${String(seconds).padStart(2, '0')} 秒`;
  };
  const timeAtomFor = spec => {
    const n = el('span', 'island-time');
    n.textContent = formatMs(spec.until ? Math.max(0, spec.until - Date.now()) : (spec.time || 0), spec.format || 'mm:ss');
    timeAtom = { node: n, spec };
    return n;
  };

  // ---- 槽位放置 ----
  // 每帧只写 transform：槽位的宽度交给 CSS 的 max-width，不在此处按帧设变量。
  const place = (slot, x) => {
    slot.style.transform = `translate(${x.toFixed(2)}px, 0)`;
  };

  const paintSlots = scene => {
    const p = scene.presentation;
    const geometry = currentGeometry();
    const compact = p.kind === 'compact' ? p : null;
    if (compact) {
      fillSlot(node.pill.children[0], compact.leading);
      fillSlot(node.pill.children[1], compact.trailing);
      measuredNodes = { leading: node.pill.children[0], trailing: node.pill.children[1] };
    } else if (p.kind === 'minimal') {
      fillSlot(node.pill.children[0], p.split ? p.split.attached.leading : null);
      fillSlot(node.pill.children[1], p.split ? p.split.attached.trailing : null);
      fillSlot(node.bubble.children[0], p.split ? p.split.detached.leading : null);
      fillSlot(node.bubble.children[1], p.split ? p.split.detached.trailing : null);
      measuredNodes = { leading: node.pill.children[0], trailing: node.pill.children[1] };
    } else if (p.kind === 'expanded') {
      fillSlot(node.expandedLeading, p.leading);
      fillSlot(node.expandedCenter, p.center);
      fillSlot(node.expandedTrailing, p.trailing);
      fillSlot(node.expandedBottom, p.bottom);
      measuredNodes = { expandedHeight: (node.expanded.offsetHeight || HEADLESS.expandedHeight) };
    }
    // 槽位贴外缘：左槽从左内边距起，右槽贴在右内边距处。
    const c = METRICS.compact;
    const pillLeft = geometry.left + c.edgePadding;
    place(node.pill, geometry.left, geometry.right - geometry.left);
    place(node.pill.children[0], pillLeft - geometry.left, c.maxSlotWidth);
    place(node.pill.children[1], geometry.right - geometry.left - c.edgePadding, c.maxSlotWidth);
  };

  const fillSlot = (slot, spec) => {
    if (!slot) return;
    const child = atom(spec);
    slot.children.length = 0;
    if (child) slot.appendChild(child);
  };

  const outlineOf = geometry => {
    const width = Math.max(0, geometry.right - geometry.left);
    let d = continuousRectPath(geometry.left, geometry.top, width, geometry.height, geometry.radius, METRICS.corner.smoothing);
    if (geometry.bubbleHeight > 0.5) {
      const bubble = geometry.bubbleRight - geometry.bubbleLeft;
      // 副胶囊与主胶囊同色填充：两条子路径并成一个 d，省一个节点也省一次合成。
      d += ' ' + continuousRectPath(geometry.bubbleLeft, geometry.top, bubble, geometry.bubbleHeight,
        geometry.bubbleHeight / 2, METRICS.corner.smoothing);
    }
    return d;
  };

  const paint = () => {
    if (!mounted || headless) return;
    const scene = deriveScene(state);
    const geometry = currentGeometry();
    node.fill.setAttribute('d', outlineOf(geometry));
    node.keyline.setAttribute('d', outlineOf(geometry));
    const expanded = geometry.kind === 'expanded';
    node.pill.setAttribute('aria-expanded', String(expanded));
    node.pill.setAttribute('aria-label', scene.label || '');
    node.pill.hidden = expanded;
    node.bubble.hidden = geometry.bubbleHeight <= 0.5;
    node.expanded.hidden = !expanded;
    node.sensor.style.opacity = String(METRICS.sensor.opacity * (expanded ? 0 : 1));
    // 内容只在 contentKey 变化时重画：每帧重建 DOM 会在正文里造成无谓的布局。
    if (scene.contentKey !== contentKey) {
      contentKey = scene.contentKey;
      timeAtom = null;
      paintSlots(scene);
      if (alerting.size) node.live.textContent = scene.label;
    } else if (timeAtom) {
      const spec = timeAtom.spec;
      timeAtom.node.textContent = formatMs(spec.until ? Math.max(0, spec.until - clockNow() * 1000) : (spec.time || 0), spec.format);
    }
  };

  function scheduleFrame() {
    if (typeof requestAnimationFrame !== 'function') { paint(); return; }
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => { frameQueued = false; paint(); });
  }


  // 一帧：跑到期定时器、越过长按阈值则展开、推进所有形状弹簧。
  const tick = now => {
    const dt = lastTickAt === null ? 0 : Math.max(0, now - lastTickAt);
    lastTickAt = now;
    while (timers.length && timers[0].at <= now) {
      const timer = timers.shift();
      timer.fn();
    }
    if (pressKind === 'hold' && !state.expanded && now - pressAt >= MOTION.longPress) expand();
    for (const key of SHAPE_KEYS) shapeValues[key].step(dt);
    if (mounted && !headless) render();
  };

  const currentGeometry = () => {
    const out = { kind: lastKind };
    let settled = true;
    let overshot = false;
    for (const key of SHAPE_KEYS) {
      const value = shapeValues[key];
      out[key] = value.value;
      if (!value.done) settled = false;
      if (value.overshot) overshot = true;
    }
    out.width = out.right - out.left;
    out.settled = settled;
    out.overshot = overshot;
    return out;
  };


  const noop = () => {};
  let reducedMotion = false;
  let mounted = false;                    // mount 之前所有公开方法都必须惰性
  let headless = true;                    // 有没有真 DOM 可画
  const deadHandle = { id: '', update: noop, end: noop };

  const Island = {
    enabled: false,
    mount(root, options) {
      const o = options || {};
      if (o.clock) clockNow = o.clock;
      // 判据用能力而不是 typeof document：Task 6/7/10/11 的单测传裸对象，走
      // headless —— 状态机照常跑，只是不建 DOM、不起帧循环。
      headless = !root || typeof root.appendChild !== 'function';
      if (o.reducedMotion !== undefined) reducedMotion = !!o.reducedMotion;
      else if (!headless && typeof matchMedia === 'function') reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      mounted = true;
      Island.enabled = !headless;
      if (!headless) {
        let backdrop = o.backdrop;
        if (!backdrop && typeof getComputedStyle === 'function') {
          backdrop = (getComputedStyle(document.documentElement).getPropertyValue('--paper') || '#ffffff').trim();
        }
        buildDom(root, backdrop || '#ffffff');
      }
      render = headless ? noop : scheduleFrame;
      commit();
    },
    start: options => (mounted ? start(options) : deadHandle),
    update: (id, partial) => { if (mounted) update(id, partial); },
    end: id => { if (mounted) end(id); },
    expand: id => { if (mounted) expand(id); },
    collapse: () => { if (mounted) collapse(); },
    press: kind => { if (mounted) press(kind); },
    release: () => { if (mounted) release(); },
    internals: {
      METRICS, MOTION, REDUCED_SPRING, luma, keylineAlpha, solveSpring, AnimatedValue,
      fmt, edgeEase, continuousRectPath, roundedRectPath, capsulePath, bridgePath, cuspPath, chamferPath,
      islandScreenWidth, expandedWidth, compactSides, splitLayout, bubbleTrailing, shapeTarget, shapeTransition,
      deriveScene, isShown, minimalOf,
      scene: () => deriveScene(state),
      allActivities: () => state.activities.slice(),
      tick, currentGeometry, outsidePress, keyEscape,
      setClock: fn => { clockNow = fn; },
      setReducedMotion: value => { reducedMotion = !!value; },
      isReduced: () => reducedMotion
    }
  };
  Object.defineProperties(Island, {
    presentation: { get: () => (mounted ? deriveScene(state).presentation.kind : 'idle') },
    activities: { get: () => (mounted ? state.activities.filter(a => isShown(state, a)) : []) }
  });
  window.Island = Island;
})();
