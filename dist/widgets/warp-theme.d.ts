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
export declare const WARP_TOKENS_CSS = "\n:root {\n  --card: #ffffff;\n  --line: #e8e9e6;\n  --line2: #f2f3f1;\n  --text: #16181c;\n  --muted: #646b76;\n  --dim: #969ca6;\n  --accent: #16a34a;\n  --accent-soft: rgba(74,222,128,0.16);\n  --accent-line: rgba(22,163,74,0.28);\n  --warp-tint: rgba(74,222,128,0.07);\n  --icon-bg: #f1f2ef;\n  --icon-text: #565c66;\n  --logo: #16a34a;\n  --particle: #22c55e;\n  --shadow: 0 1px 2px rgba(16,24,32,0.05), 0 8px 24px -12px rgba(16,24,32,0.10);\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --card: #17181b;\n    --line: #2b2d31;\n    --line2: #232427;\n    --text: #eceef2;\n    --muted: #9aa1ad;\n    --dim: #6f7681;\n    --accent: #4ade80;\n    --accent-soft: rgba(74,222,128,0.15);\n    --accent-line: rgba(74,222,128,0.30);\n    --warp-tint: rgba(74,222,128,0.055);\n    --icon-bg: #24262a;\n    --icon-text: #b4bac4;\n    --logo: #00FF33;\n    --particle: #4ade80;\n    --shadow: 0 1px 2px rgba(0,0,0,0.30), 0 10px 28px -14px rgba(0,0,0,0.55);\n  }\n}";
/** Header slot for the forklift. Sits in the card's top-right corner, is
 *  decorative only (aria-hidden), and collapses on very narrow hosts so it can
 *  never squeeze the title. */
export declare const FORKLIFT_CSS = "\n.wh-fork { margin-left: auto; width: 104px; height: 48px; flex: 0 0 auto; opacity: 0.95; }\n.wh-fork canvas { width: 100%; height: 100%; display: block; }\n@media (max-width: 380px) { .wh-fork { display: none; } }";
/** Markup for the slot — drop into the header row. */
export declare const FORKLIFT_HTML = "<span class=\"wh-fork\" aria-hidden=\"true\"><canvas id=\"__warp_fork\"></canvas></span>";
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
export declare const FORKLIFT_JS = "\nwindow.__warpForklift = function () {\n  var cv = document.getElementById(\"__warp_fork\");\n  if (!cv || !cv.getContext) return;\n  var W = 104, H = 48;\n  var dpr = Math.min(window.devicePixelRatio || 1, 2);\n  cv.width = W * dpr; cv.height = H * dpr;\n  var ctx = cv.getContext(\"2d\");\n  if (!ctx) return;\n  ctx.scale(dpr, dpr);\n\n  function accent() {\n    try {\n      var v = getComputedStyle(document.documentElement).getPropertyValue(\"--particle\");\n      if (v && v.trim()) return v.trim();\n    } catch (e) {}\n    return \"#4ade80\";\n  }\n\n  // \u2500\u2500 the silhouette, drawn once offscreen \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n  // Side profile facing RIGHT. A forklift only reads at this size if three\n  // things are unambiguous and don't touch each other: a tall mast at the\n  // front, forks protruding forward along the floor, and a boxy body with an\n  // overhead guard behind. Everything else (seat, detailing) turns to mush at\n  // 46px tall, so it is deliberately left out.\n  function drawShape(c) {\n    c.clearRect(0, 0, W, H);\n    c.fillStyle = \"#000\";\n\n    // BOTTOM-HEAVY is what makes it a forklift rather than a boxy vehicle: a\n    // heavy counterweight body low down, a SMALL canopy above it, and the mast\n    // as the tallest thing at the front. An earlier version drew a full-height\n    // overhead guard, which produced a large hollow rectangle that dominated the\n    // silhouette and read as a crate on wheels.\n\n    // counterweight + chassis (the visual mass)\n    c.fillRect(6, 24, 42, 15);\n    // rear counterweight taper\n    c.fillRect(4, 28, 4, 11);\n    // operator area: filled seat block so the cab is never an empty outline\n    c.fillRect(24, 17, 13, 7);\n    // small canopy: thin roof on a single stout rear post\n    c.fillRect(20, 9, 24, 2.5);\n    c.fillRect(21, 11, 3.5, 7);\n    // MAST \u2014 thickest vertical, tallest element, at the front\n    c.fillRect(52, 2, 5, 37);\n    c.fillRect(58, 6, 2.5, 29);\n    // fork carriage + forks along the floor (bold, clearly an L)\n    c.fillRect(61, 24, 3.5, 15);\n    c.fillRect(61, 35, 31, 3.5);\n    // one compact box riding the forks \u2014 freight, without pallet-slat noise\n    c.fillRect(68, 21, 19, 13);\n    // wheels: big drive wheel rear, smaller steer wheel front\n    c.beginPath(); c.arc(17, 41, 6, 0, 6.2832); c.fill();\n    c.beginPath(); c.arc(43, 42, 4.6, 0, 6.2832); c.fill();\n  }\n\n  // Sample the drawn pixels into particle targets.\n  var pts = [];\n  try {\n    var off = document.createElement(\"canvas\");\n    off.width = W; off.height = H;\n    var oc = off.getContext(\"2d\");\n    drawShape(oc);\n    var img = oc.getImageData(0, 0, W, H).data;\n    var STEP = 2; // every 2px -> a few hundred particles, plenty at this size\n    for (var y = 0; y < H; y += STEP) {\n      for (var x = 0; x < W; x += STEP) {\n        if (img[(y * W + x) * 4 + 3] > 128) pts.push({ x: x, y: y });\n      }\n    }\n  } catch (e) {\n    // getImageData can throw in locked-down embeds; fall back to the solid\n    // silhouette so the corner is never empty.\n    ctx.fillStyle = accent(); drawShape(ctx); return;\n  }\n  if (!pts.length) return;\n\n  var reduce = false;\n  try { reduce = window.matchMedia(\"(prefers-reduced-motion: reduce)\").matches; } catch (e) {}\n\n  var col = accent();\n  var P = pts.map(function (p, i) {\n    var a = (i * 2.39996) % 6.2832; // golden-angle spread, deterministic\n    var r = 12 + (i % 17);\n    return {\n      tx: p.x, ty: p.y,\n      x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,\n      vx: 0, vy: 0, ph: (i % 31) / 31 * 6.2832\n    };\n  });\n\n  function paint(t) {\n    ctx.clearRect(0, 0, W, H);\n    ctx.fillStyle = col;\n    for (var i = 0; i < P.length; i++) {\n      var p = P[i];\n      // spring toward target\n      p.vx = (p.vx + (p.tx - p.x) * 0.06) * 0.86;\n      p.vy = (p.vy + (p.ty - p.y) * 0.06) * 0.86;\n      p.x += p.vx; p.y += p.vy;\n      // gentle idle breathing once settled\n      var bx = Math.cos(t * 0.0011 + p.ph) * 0.32;\n      var by = Math.sin(t * 0.0013 + p.ph) * 0.32;\n      ctx.fillRect(p.x + bx, p.y + by, 1.1, 1.1);\n    }\n  }\n\n  if (reduce) {\n    ctx.fillStyle = col;\n    for (var j = 0; j < P.length; j++) ctx.fillRect(P[j].tx, P[j].ty, 1.1, 1.1);\n    return;\n  }\n\n  var t0 = null;\n  function frame(ts) {\n    if (t0 === null) t0 = ts;\n    paint(ts - t0);\n    // Run the assemble + a short settle, then stop: an inline chat card must\n    // not hold a rAF loop open indefinitely.\n    if (ts - t0 < 9000) requestAnimationFrame(frame);\n  }\n  requestAnimationFrame(frame);\n};";
