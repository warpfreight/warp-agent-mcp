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
export declare const WARP_TOKENS_CSS = "\n:root {\n  --card: #ffffff;\n  --line: #e8e9e6;\n  --line2: #f2f3f1;\n  --text: #16181c;\n  --muted: #646b76;\n  --dim: #969ca6;\n  --accent: #16a34a;\n  --accent-soft: rgba(74,222,128,0.16);\n  --accent-line: rgba(22,163,74,0.28);\n  --warp-tint: rgba(74,222,128,0.07);\n  --icon-bg: #f1f2ef;\n  --icon-text: #565c66;\n  --logo: #16a34a;\n  --particle: #22c55e;\n  --shadow: 0 1px 2px rgba(16,24,32,0.05), 0 8px 24px -12px rgba(16,24,32,0.10);\n}\n@media (prefers-color-scheme: dark) {\n  :root {\n    --card: #17181b;\n    --line: #2b2d31;\n    --line2: #232427;\n    --text: #eceef2;\n    --muted: #9aa1ad;\n    --dim: #6f7681;\n    --accent: #4ade80;\n    --accent-soft: rgba(74,222,128,0.15);\n    --accent-line: rgba(74,222,128,0.30);\n    --warp-tint: rgba(74,222,128,0.055);\n    --icon-bg: #24262a;\n    --icon-text: #b4bac4;\n    --logo: #00FF33;\n    --particle: #4ade80;\n    --shadow: 0 1px 2px rgba(0,0,0,0.30), 0 10px 28px -14px rgba(0,0,0,0.55);\n  }\n}";
/** The WARP wordmark, as an alpha mask for the particle sampler. `currentColor`
 *  does not resolve inside an SVG loaded through an <img>, so the fill is
 *  concrete black — the mask supplies SHAPE only and the particles are coloured
 *  from --particle. */
export declare const WARP_LOGO_MASK_SVG = "<svg viewBox=\"0 0 660 186\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-label=\"WARP\"><path d=\"M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z\" fill=\"#000\"/><path d=\"M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z\" fill=\"#000\"/><path d=\"M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z\" fill=\"#000\"/><path d=\"M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z\" fill=\"#000\"/><path d=\"M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z\" fill=\"#000\"/><path d=\"M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z\" fill=\"#000\"/><path d=\"M292.04 76.1794H275.219V94.1557H292.04V76.1794Z\" fill=\"#000\"/><path d=\"M275.219 131.615H292.04V113.84H275.219V131.615Z\" fill=\"#000\"/></svg>";
/** Static wordmark kept as the fallback: if the browser blocks the SVG-to-canvas
 *  rasterization (some locked-down embeds do), the header still shows the logo
 *  rather than an empty gap. */
export declare const WARP_LOGO_SVG = "<svg viewBox=\"0 0 660 186\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-label=\"WARP\"><path d=\"M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z\" fill=\"currentColor\"/><path d=\"M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z\" fill=\"currentColor\"/><path d=\"M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z\" fill=\"currentColor\"/><path d=\"M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z\" fill=\"currentColor\"/><path d=\"M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z\" fill=\"currentColor\"/><path d=\"M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z\" fill=\"currentColor\"/><path d=\"M292.04 76.1794H275.219V94.1557H292.04V76.1794Z\" fill=\"currentColor\"/><path d=\"M275.219 131.615H292.04V113.84H275.219V131.615Z\" fill=\"currentColor\"/></svg>";
/** The logo IS the particle object now. It sits where the flat wordmark used to,
 *  sized so there is room for particles to be pushed around without clipping. */
export declare const LOGO_PARTICLE_CSS = "\n.wh-logo-fx { position: relative; width: 176px; height: 48px; flex: 0 0 auto; }\n.wh-logo-fx canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: crosshair; touch-action: none; }\n.wh-logo-fx .wh-logo-fallback { position: absolute; left: 0; top: 50%; transform: translateY(-50%); color: var(--logo); display: none; }\n.wh-logo-fx .wh-logo-fallback svg { height: 17px; width: auto; display: block; }\n.wh-logo-fx.is-fallback canvas { display: none; }\n.wh-logo-fx.is-fallback .wh-logo-fallback { display: block; }";
export declare const LOGO_PARTICLE_HTML = "<span class=\"wh-logo-fx\" id=\"__warp_logofx\"><canvas id=\"__warp_logo_canvas\" role=\"img\" aria-label=\"Warp\"></canvas><span class=\"wh-logo-fallback\"><svg viewBox=\"0 0 660 186\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\" aria-label=\"WARP\"><path d=\"M660 185.035H0V0H660V185.035ZM14.0597 171.327H646.141V13.9593H14.0597V171.327Z\" fill=\"currentColor\"/><path d=\"M300.976 53.2756L332.509 131.608H351.239L319.705 53.2756H300.976Z\" fill=\"currentColor\"/><path d=\"M215.919 131.608H234.648L266.182 53.2756H247.453L215.919 131.608Z\" fill=\"currentColor\"/><path d=\"M150.892 107.405L136.431 71.3523H115.593L101.131 107.405L78.2342 53.2756H60.0068L93.047 131.608H109.517L125.987 90.5839L142.457 131.608H158.927L192.017 53.2756H173.739L150.892 107.405Z\" fill=\"currentColor\"/><path d=\"M471.856 82.8511C471.816 75.0646 468.691 67.6113 463.166 62.1242C457.642 56.6371 450.167 53.5636 442.381 53.5769H388.502V131.608H405.323V112.125H440.021L447.854 131.608H465.981L456.691 108.41C461.258 105.886 465.065 102.183 467.715 97.6881C470.364 93.1928 471.759 88.0691 471.755 82.8511H471.856ZM405.323 70.3481H442.381C445.71 70.3481 448.903 71.6706 451.257 74.0248C453.611 76.379 454.934 79.572 454.934 82.9013C454.934 86.2307 453.611 89.4236 451.257 91.7778C448.903 94.132 445.71 95.4546 442.381 95.4546H405.323V70.3481Z\" fill=\"currentColor\"/><path d=\"M570.768 53.5769H516.939V131.608H533.711V112.125H570.768C574.612 112.125 578.419 111.368 581.971 109.897C585.522 108.426 588.749 106.269 591.468 103.551C594.186 100.833 596.342 97.6055 597.814 94.0538C599.285 90.5021 600.042 86.6954 600.042 82.8511C600.042 79.0067 599.285 75.2 597.814 71.6483C596.342 68.0966 594.186 64.8695 591.468 62.1511C588.749 59.4327 585.522 57.2764 581.971 55.8053C578.419 54.3341 574.612 53.5769 570.768 53.5769ZM570.768 95.4043H533.711V70.2978H570.768C574.097 70.2978 577.29 71.6204 579.644 73.9746C581.998 76.3288 583.321 79.5217 583.321 82.8511C583.321 86.1804 581.998 89.3734 579.644 91.7276C577.29 94.0818 574.097 95.4043 570.768 95.4043Z\" fill=\"currentColor\"/><path d=\"M292.04 76.1794H275.219V94.1557H292.04V76.1794Z\" fill=\"currentColor\"/><path d=\"M275.219 131.615H292.04V113.84H275.219V131.615Z\" fill=\"currentColor\"/></svg></span></span>";
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
export declare const LOGO_PARTICLE_JS: string;
