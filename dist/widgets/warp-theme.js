/**
 * Shared visual language for the four inline cards (quote, batch-quote,
 * batch-book, bookings).
 *
 * TWO reasons this file exists rather than the tokens being copy-pasted into
 * each card:
 *   1. All four had the same palette duplicated four times, so a brand change
 *      meant four edits and the fourth always got missed.
 *   2. The logo particle effect is ~4KB of canvas code plus the inlined
 *      wordmark; inlining it four times would quadruple it in every card.
 *
 * BRAND GREEN comes from warp-site's own brand-color guard
 * (scripts/audit-brand-color.mjs), which is the source of truth:
 *   --warp-accent  #4ade80   the UI accent green
 *   --warp-success #22c55e
 *   #00ff33 is the LOGO green and is explicitly banned as a UI accent, so it is
 *   used only for the wordmark in dark mode.
 * The cards previously used #3EE07F / #15803d, which matched nothing on the site.
 *
 * HARD CONSTRAINT: these cards render inside ChatGPT and Claude as fully
 * self-contained HTML with no network access. No three.js, no CDN, no external
 * asset — the wordmark is rasterized from an inline data URI and sampled into
 * particles with plain canvas 2D at runtime.
 */
/** Palette shared by every card. Light values keep text contrast on white
 *  (#4ade80 on white is ~1.7:1 and unreadable), dark values use the brand
 *  accent directly. */
export const WARP_TOKENS_CSS = `
:root {
  --card: #ffffff;
  --line: #e8e9e6;
  --line2: #f2f3f1;
  --text: #16181c;
  --muted: #646b76;
  --dim: #969ca6;
  --accent: #16a34a;
  --accent-soft: rgba(74,222,128,0.16);
  --accent-line: rgba(22,163,74,0.28);
  --warp-tint: rgba(74,222,128,0.07);
  --icon-bg: #f1f2ef;
  --icon-text: #565c66;
  --logo: #16a34a;
  --particle: #22c55e;
  --shadow: 0 1px 2px rgba(16,24,32,0.05), 0 8px 24px -12px rgba(16,24,32,0.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --card: #17181b;
    --line: #2b2d31;
    --line2: #232427;
    --text: #eceef2;
    --muted: #9aa1ad;
    --dim: #6f7681;
    --accent: #4ade80;
    --accent-soft: rgba(74,222,128,0.15);
    --accent-line: rgba(74,222,128,0.30);
    --warp-tint: rgba(74,222,128,0.055);
    --icon-bg: #24262a;
    --icon-text: #b4bac4;
    --logo: #00FF33;
    --particle: #4ade80;
    --shadow: 0 1px 2px rgba(0,0,0,0.30), 0 10px 28px -14px rgba(0,0,0,0.55);
  }
}`;
/** The WARP wordmark, as an alpha mask for the particle sampler. `currentColor`
 *  does not resolve inside an SVG loaded through an <img>, so the fill is
 *  concrete black — the mask supplies SHAPE only and the particles are coloured
 *  from --particle. */
export const WARP_LOGO_MASK_SVG = "<svg viewBox=\"0 0 660 186\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-label=\"WARP\"><path d=\"M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z\" fill=\"#000\"/><path d=\"M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z\" fill=\"#000\"/><path d=\"M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z\" fill=\"#000\"/><path d=\"M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z\" fill=\"#000\"/><path d=\"M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z\" fill=\"#000\"/><path d=\"M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z\" fill=\"#000\"/><path d=\"M292.04 76.1794H275.219V94.1557H292.04V76.1794Z\" fill=\"#000\"/><path d=\"M275.219 131.615H292.04V113.84H275.219V131.615Z\" fill=\"#000\"/></svg>";
/** Static wordmark kept as the fallback: if the browser blocks the SVG-to-canvas
 *  rasterization (some locked-down embeds do), the header still shows the logo
 *  rather than an empty gap. */
export const WARP_LOGO_SVG = "<svg viewBox=\"0 0 660 186\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-label=\"WARP\"><path d=\"M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z\" fill=\"currentColor\"/><path d=\"M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z\" fill=\"currentColor\"/><path d=\"M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z\" fill=\"currentColor\"/><path d=\"M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z\" fill=\"currentColor\"/><path d=\"M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z\" fill=\"currentColor\"/><path d=\"M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z\" fill=\"currentColor\"/><path d=\"M292.04 76.1794H275.219V94.1557H292.04V76.1794Z\" fill=\"currentColor\"/><path d=\"M275.219 131.615H292.04V113.84H275.219V131.615Z\" fill=\"currentColor\"/></svg>";
/** The logo IS the particle object now. It sits where the flat wordmark used to,
 *  sized so there is room for particles to be pushed around without clipping. */
export const LOGO_PARTICLE_CSS = `
.wh-logo-fx { position: relative; width: 176px; height: 48px; flex: 0 0 auto; }
.wh-logo-fx canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; touch-action: none; }
.wh-logo-fx .wh-logo-fallback { position: absolute; left: 0; top: 50%; transform: translateY(-50%); color: var(--logo); display: none; }
.wh-logo-fx .wh-logo-fallback svg { height: 17px; width: auto; display: block; }
.wh-logo-fx.is-fallback canvas { display: none; }
.wh-logo-fx.is-fallback .wh-logo-fallback { display: block; }`;
export const LOGO_PARTICLE_HTML = `<span class="wh-logo-fx" id="__warp_logofx"><canvas id="__warp_logo_canvas" role="img" aria-label="Warp"></canvas><span class="wh-logo-fallback">${WARP_LOGO_SVG}</span></span>`;
/**
 * The WARP wordmark rebuilt as an interactive particle cloud — a 2D port of
 * Canvas UI's ParticleObject behaviour, pointed at our own logo.
 *
 * WHY A PORT, NOT THE REAL COMPONENT: ParticleObject is React + three.js +
 * OrbitControls + GLTF/DRACO. These cards are handed to ChatGPT and Claude as ONE
 * self-contained HTML string with no network access, so a ~600KB WebGL stack can
 * neither be bundled sensibly nor fetched at runtime. What makes that component
 * feel alive is its simulate() step, and that ports exactly:
 *
 *   push      radial repulsion inside a cursor radius, falloff squared
 *   swirl     tangential component, so particles spiral rather than only flee
 *   shove     pointer VELOCITY flings them — a fast sweep hits harder
 *   spring    pull home at stiffness 60*spring
 *   damping   exp(-(3 + 12*damping) * dt) velocity decay
 *   drift     idle shimmer at rest
 *   variance  per-particle size jitter
 *
 * Dropped as 3D-only: raycast into the cloud, orbit, turntable, float/bob. There
 * is no depth here, and a chat card must not steal drag or scroll gestures.
 *
 * SAMPLING follows the reference's sampleImage(): the SVG is rasterized to an
 * alpha mask, every opaque pixel becomes a weighted candidate, and `count`
 * particles are drawn from that distribution with sub-pixel jitter. That random
 * draw is what makes it look like a cloud; walking the mask on a fixed grid is
 * what made an earlier attempt look like a QR code.
 *
 * Exposed as window.__warpLogoParticles() because on the Claude/MCP-Apps path the
 * card renders asynchronously via the postMessage bridge, so a standalone script
 * would find no canvas. Idempotent.
 */
export const LOGO_PARTICLE_JS = `
window.__warpLogoParticles = function () {
  var slot = document.getElementById("__warp_logofx");
  var cv = document.getElementById("__warp_logo_canvas");
  if (!slot || !cv || !cv.getContext) return;
  if (cv.__warpInit) return; cv.__warpInit = 1;

  var W = 176, H = 48;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  var ctx = cv.getContext("2d");
  if (!ctx) { slot.className += " is-fallback"; return; }
  ctx.scale(dpr, dpr);

  // ParticleObject's defaults, translated to this canvas's pixel scale.
  // INK BUDGET MATTERS: the reference uses 14000 particles, but on a canvas of
  // hundreds of px. Here the mask is only ~2400 opaque px, so 1500 particles at
  // 2.6px each painted ~140% coverage and merged into a solid slab with the
  // letterforms erased. ~700 particles at 1.5px lands near 50% — dense enough to
  // read as the wordmark, sparse enough to still look like particles.
  // Landed at ~1150 at 1.35px (~70% of the mask) after checking legibility.
  var COUNT = 1150, RADIUS = 22, STRENGTH = 1, SWIRL = 0.6,
      SPRING = 2.6, DAMPING = 0.35, DRIFT = 0.6, VARIANCE = 0.6;

  function cssVar(n, f) {
    try { var v = getComputedStyle(document.documentElement).getPropertyValue(n); if (v && v.trim()) return v.trim(); } catch (e) {}
    return f;
  }
  var col = cssVar("--logo", "#4ade80");

  function fallback() { if (slot.className.indexOf("is-fallback") < 0) slot.className += " is-fallback"; }

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  // Soft round sprite, blitted per particle — cheaper and prettier than arc().
  var SR = 1.35;
  var sp = document.createElement("canvas");
  sp.width = sp.height = Math.ceil(SR * 2);
  var sc = sp.getContext("2d");
  var g = sc.createRadialGradient(SR, SR, 0, SR, SR, SR);
  g.addColorStop(0, col); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(0,0,0,0)");
  sc.fillStyle = g; sc.beginPath(); sc.arc(SR, SR, SR, 0, 6.2832); sc.fill();

  var img = new Image();
  img.onerror = fallback;
  img.onload = function () {
    var mask;
    try {
      // Rasterize the wordmark, letterboxed into the canvas with a small margin
      // so pushed particles have somewhere to go before they clip.
      var PAD = 3;
      var off = document.createElement("canvas");
      off.width = W; off.height = H;
      var oc = off.getContext("2d");
      var ar = img.width / img.height;
      var dh = H - PAD * 2, dw = dh * ar;
      if (dw > W - PAD * 2) { dw = W - PAD * 2; dh = dw / ar; }
      oc.drawImage(img, PAD, (H - dh) / 2, dw, dh);
      mask = oc.getImageData(0, 0, W, H).data;
    } catch (e) { fallback(); return; }

    // Weighted candidate list, exactly the reference's approach.
    var idx = [], cum = [], total = 0;
    for (var i = 0; i < W * H; i++) {
      var a = mask[i * 4 + 3];
      if (a < 10) continue;
      total += a; idx.push(i); cum.push(total);
    }
    if (!idx.length) { fallback(); return; }

    var N = Math.min(COUNT, idx.length * 3);
    var hx = new Float32Array(N), hy = new Float32Array(N);
    var px = new Float32Array(N), py = new Float32Array(N);
    var vx = new Float32Array(N), vy = new Float32Array(N);
    var sz = new Float32Array(N), ph = new Float32Array(N);
    for (var k = 0; k < N; k++) {
      var pick = Math.random() * total, lo = 0, hi = cum.length - 1;
      while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < pick) lo = mid + 1; else hi = mid; }
      var p = idx[lo];
      hx[k] = (p % W) + Math.random() - 0.5;
      hy[k] = Math.floor(p / W) + Math.random() - 0.5;
      // assemble in from a scatter on first paint
      var ang = Math.random() * 6.2832, dd = 5 + Math.random() * 14;
      px[k] = hx[k] + Math.cos(ang) * dd;
      py[k] = hy[k] + Math.sin(ang) * dd;
      sz[k] = 1 + VARIANCE * (Math.random() - 0.5) * 1.4;
      ph[k] = Math.random() * 6.2832;
    }

    var mx = 0, my = 0, active = false, speed = 0, shx = 0, shy = 0;
    var lx = 0, ly = 0, lt = 0, lastMove = 0;
    function onMove(e) {
      var r = cv.getBoundingClientRect();
      mx = (e.clientX - r.left) * (W / Math.max(r.width, 1));
      my = (e.clientY - r.top) * (H / Math.max(r.height, 1));
      var now = performance.now();
      if (active && lt) {
        var dt = Math.max((now - lt) / 1000, 1e-3);
        var dx = mx - lx, dy = my - ly, len = Math.sqrt(dx * dx + dy * dy);
        speed += (len / dt - speed) * 0.35;
        if (len > 0.3) { var inv = 1 / len; shx += (dx * inv - shx) * 0.4; shy += (dy * inv - shy) * 0.4; }
      }
      lx = mx; ly = my; lt = now; lastMove = now; active = true;
      start();
    }
    function onLeave() { active = false; speed = 0; lt = 0; }
    cv.addEventListener("pointermove", onMove, { passive: true });
    cv.addEventListener("pointerdown", onMove, { passive: true });
    cv.addEventListener("pointerleave", onLeave, { passive: true });
    cv.addEventListener("pointercancel", onLeave, { passive: true });

    // Squared max distance-from-home, for settle detection. MUST start at
    // Infinity: step() is skipped on the very first frame (dt is 0 there), so a
    // 0 seed made "settled" true before any simulation ran and the loop exited
    // after painting a single frame of the initial scatter — which looked exactly
    // like a permanent particle cloud that never formed the wordmark.
    var maxOff = Infinity;
    function step(dt) {
      var stiff = 60 * SPRING;
      maxOff = 0;
      var decay = Math.exp(-(3 + 12 * DAMPING) * dt);
      var accel = 26 * STRENGTH;
      var shove = Math.min(speed / 220, 2) * 14 * STRENGTH;
      var r2 = RADIUS * RADIUS;
      for (var i = 0; i < N; i++) {
        var x = px[i], y = py[i], ax = vx[i], ay = vy[i];
        if (active) {
          var dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
          if (d2 < r2) {
            var d = Math.sqrt(d2), inv = 1 / Math.max(d, 1e-5);
            var nx = dx * inv, ny = dy * inv;
            var fall = 1 - d / RADIUS, f = fall * fall * dt;
            ax += (nx - ny * SWIRL) * accel * f + shx * shove * f;
            ay += (ny + nx * SWIRL) * accel * f + shy * shove * f;
          }
        }
        ax += (hx[i] - x) * stiff * dt;
        ay += (hy[i] - y) * stiff * dt;
        ax *= decay; ay *= decay;
        px[i] = x + ax * dt; py[i] = y + ay * dt;
        vx[i] = ax; vy[i] = ay;
        var ddx = hx[i] - px[i], ddy = hy[i] - py[i];
        var off = ddx * ddx + ddy * ddy;
        if (off > maxOff) maxOff = off;
      }
    }

    function paint(t) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < N; i++) {
        var jx = 0, jy = 0;
        if (DRIFT > 0) {
          jx = Math.cos(t * 0.0017 + ph[i]) * DRIFT * 0.35;
          jy = Math.sin(t * 0.0021 + ph[i]) * DRIFT * 0.35;
        }
        var s = SR * sz[i];
        ctx.drawImage(sp, px[i] + jx - s * 0.5, py[i] + jy - s * 0.5, s, s);
      }
    }

    if (reduce) {
      for (var q = 0; q < N; q++) { px[q] = hx[q]; py[q] = hy[q]; }
      paint(0);
      return;
    }

    // Alive while it matters: assembling, interacting, and briefly after. An
    // inline chat card should not hold requestAnimationFrame open forever, and
    // IntersectionObserver parks it when the card scrolls out of view.
    var running = false, t0 = null, prev = 0, inView = true, framesRun = 0;
    function frame(ts) {
      if (!running) return;
      framesRun++;
      if (t0 === null) { t0 = ts; prev = ts; }
      var dt = Math.min((ts - prev) / 1000, 1 / 30); prev = ts;
      if (dt > 0) step(dt);
      paint(ts - t0);
      speed *= Math.exp(-3 * dt);
      // Settled = every particle is within ~0.2px of home and nothing is pushing.
      var settled = maxOff < 0.04 && !active && speed < 0.5;
      if (!inView || settled) { running = false; return; }
      requestAnimationFrame(frame);
    }
    function start() { if (running || !inView) return; running = true; prev = 0; if (t0 === null) t0 = null; requestAnimationFrame(frame); }
    try {
      if (typeof IntersectionObserver !== "undefined") {
        new IntersectionObserver(function (es) {
          var e = es[es.length - 1];
          inView = e ? e.isIntersecting : true;
          if (inView) start();
        }).observe(cv);
      }
    } catch (e) {}
    cv.addEventListener("pointerenter", start, { passive: true });
    start();

    // Some hosts render the card in a hidden or offscreen document, where
    // requestAnimationFrame is never serviced at all (document.visibilityState
    // "hidden" — the Claude Code preview pane does exactly this). Without this
    // guard the card is stuck displaying the initial random scatter, i.e. a
    // meaningless smear of dots where the logo should be. If no frame has run
    // shortly after start, snap every particle home and paint the wordmark once;
    // the interactive path takes over untouched the moment frames do arrive.
    setTimeout(function () {
      if (framesRun > 0) return;
      for (var q = 0; q < N; q++) { px[q] = hx[q]; py[q] = hy[q]; vx[q] = 0; vy[q] = 0; }
      paint(0);
    }, 240);
  };

  // Self-contained: the wordmark travels as an inline data URI, so nothing is
  // fetched from the network (these cards have none).
  try {
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(${JSON.stringify(WARP_LOGO_MASK_SVG)});
  } catch (e) { fallback(); }
};`;
//# sourceMappingURL=warp-theme.js.map