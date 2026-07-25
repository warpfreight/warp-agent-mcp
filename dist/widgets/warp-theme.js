/**
 * Shared visual language for the four inline cards (quote, batch-quote,
 * batch-book, bookings).
 *
 * TWO reasons this file exists rather than the tokens being copy-pasted into
 * each card:
 *   1. All four had the same palette duplicated four times, so a brand change
 *      meant four edits and the fourth always got missed.
 *   2. The particle forklift is ~2KB of canvas code; inlining it four times
 *      would quadruple it in every rendered card.
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
 * asset — the forklift is drawn with plain canvas 2D and sampled into particles
 * at runtime.
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
/** Header slot for the forklift. Sits in the card's top-right corner, is
 *  decorative only (aria-hidden), and collapses on very narrow hosts so it can
 *  never squeeze the title. */
export const FORKLIFT_CSS = `
.wh-fork { margin-left: auto; width: 104px; height: 48px; flex: 0 0 auto; opacity: 0.95; }
.wh-fork canvas { width: 100%; height: 100%; display: block; }
@media (max-width: 380px) { .wh-fork { display: none; } }`;
/** Markup for the slot — drop into the header row. */
export const FORKLIFT_HTML = `<span class="wh-fork" aria-hidden="true"><canvas id="__warp_fork"></canvas></span>`;
/**
 * Particle forklift. Draws a forklift silhouette to an offscreen canvas, reads
 * the pixels back, and treats every opaque pixel as a particle target — so the
 * shape is defined once, in one place, and the particle field is derived from it
 * (no hand-placed coordinate list to maintain).
 *
 * Particles fly in from a scatter and spring to their targets, then breathe
 * gently. Honours prefers-reduced-motion by painting the settled shape once and
 * never starting the animation loop.
 *
 * Written as a plain string of ES5-ish JS because it is inlined into the card's
 * <script> block; no build step runs over it.
 *
 * Exposed as window.__warpForklift() rather than run as an IIFE because the
 * canvas only exists once a card has rendered — and on the Claude/MCP-Apps path
 * that happens asynchronously when the postMessage bridge delivers data. The
 * render function calls this at the end, so timing is correct on every host.
 * Safe to call more than once: it re-inits against whatever canvas is present.
 */
export const FORKLIFT_JS = `
window.__warpForklift = function () {
  var cv = document.getElementById("__warp_fork");
  if (!cv || !cv.getContext) return;
  var W = 104, H = 48;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = W * dpr; cv.height = H * dpr;
  var ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  function accent() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--particle");
      if (v && v.trim()) return v.trim();
    } catch (e) {}
    return "#4ade80";
  }

  // ── the silhouette, drawn once offscreen ────────────────────────────────
  // Side profile facing RIGHT. A forklift only reads at this size if three
  // things are unambiguous and don't touch each other: a tall mast at the
  // front, forks protruding forward along the floor, and a boxy body with an
  // overhead guard behind. Everything else (seat, detailing) turns to mush at
  // 46px tall, so it is deliberately left out.
  function drawShape(c) {
    c.clearRect(0, 0, W, H);
    c.fillStyle = "#000";

    // BOTTOM-HEAVY is what makes it a forklift rather than a boxy vehicle: a
    // heavy counterweight body low down, a SMALL canopy above it, and the mast
    // as the tallest thing at the front. An earlier version drew a full-height
    // overhead guard, which produced a large hollow rectangle that dominated the
    // silhouette and read as a crate on wheels.

    // counterweight + chassis (the visual mass)
    c.fillRect(6, 24, 42, 15);
    // rear counterweight taper
    c.fillRect(4, 28, 4, 11);
    // operator area: filled seat block so the cab is never an empty outline
    c.fillRect(24, 17, 13, 7);
    // small canopy: thin roof on a single stout rear post
    c.fillRect(20, 9, 24, 2.5);
    c.fillRect(21, 11, 3.5, 7);
    // MAST — thickest vertical, tallest element, at the front
    c.fillRect(52, 2, 5, 37);
    c.fillRect(58, 6, 2.5, 29);
    // fork carriage + forks along the floor (bold, clearly an L)
    c.fillRect(61, 24, 3.5, 15);
    c.fillRect(61, 35, 31, 3.5);
    // one compact box riding the forks — freight, without pallet-slat noise
    c.fillRect(68, 21, 19, 13);
    // wheels: big drive wheel rear, smaller steer wheel front
    c.beginPath(); c.arc(17, 41, 6, 0, 6.2832); c.fill();
    c.beginPath(); c.arc(43, 42, 4.6, 0, 6.2832); c.fill();
  }

  // Sample the drawn pixels into particle targets.
  var pts = [];
  try {
    var off = document.createElement("canvas");
    off.width = W; off.height = H;
    var oc = off.getContext("2d");
    drawShape(oc);
    var img = oc.getImageData(0, 0, W, H).data;
    var STEP = 2; // every 2px -> a few hundred particles, plenty at this size
    for (var y = 0; y < H; y += STEP) {
      for (var x = 0; x < W; x += STEP) {
        if (img[(y * W + x) * 4 + 3] > 128) pts.push({ x: x, y: y });
      }
    }
  } catch (e) {
    // getImageData can throw in locked-down embeds; fall back to the solid
    // silhouette so the corner is never empty.
    ctx.fillStyle = accent(); drawShape(ctx); return;
  }
  if (!pts.length) return;

  var reduce = false;
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var col = accent();
  var P = pts.map(function (p, i) {
    var a = (i * 2.39996) % 6.2832; // golden-angle spread, deterministic
    var r = 12 + (i % 17);
    return {
      tx: p.x, ty: p.y,
      x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
      vx: 0, vy: 0, ph: (i % 31) / 31 * 6.2832
    };
  });

  function paint(t) {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = col;
    for (var i = 0; i < P.length; i++) {
      var p = P[i];
      // spring toward target
      p.vx = (p.vx + (p.tx - p.x) * 0.06) * 0.86;
      p.vy = (p.vy + (p.ty - p.y) * 0.06) * 0.86;
      p.x += p.vx; p.y += p.vy;
      // gentle idle breathing once settled
      var bx = Math.cos(t * 0.0011 + p.ph) * 0.32;
      var by = Math.sin(t * 0.0013 + p.ph) * 0.32;
      ctx.fillRect(p.x + bx, p.y + by, 1.1, 1.1);
    }
  }

  if (reduce) {
    ctx.fillStyle = col;
    for (var j = 0; j < P.length; j++) ctx.fillRect(P[j].tx, P[j].ty, 1.1, 1.1);
    return;
  }

  var t0 = null;
  function frame(ts) {
    if (t0 === null) t0 = ts;
    paint(ts - t0);
    // Run the assemble + a short settle, then stop: an inline chat card must
    // not hold a rAF loop open indefinitely.
    if (ts - t0 < 9000) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
};`;
//# sourceMappingURL=warp-theme.js.map