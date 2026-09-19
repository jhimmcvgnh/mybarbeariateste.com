/**
 * Electric Gaze - Animated Ordered-Dither Background
 * renderMode: "dither" | animStyle: "shimmer" | cellSize: 9
 * contrast: 158 | animSpeed: 100 | animIntensity: 60
 * bgMode: "none" (procedural noise field)
 */
(function () {
  'use strict';

  var BAYER8 = [
     0,32, 8,40, 2,34,10,42,
    48,16,56,24,50,18,58,26,
    12,44, 4,36,14,46, 6,38,
    60,28,52,20,62,30,54,22,
     3,35,11,43, 1,33, 9,41,
    51,19,59,27,49,17,57,25,
    15,47, 7,39,13,45, 5,37,
    63,31,55,23,61,29,53,21
  ];

  var CELL     = 9;
  var BAYER_N  = 8;
  var CONTRAST = 2.48;
  var ANIM_SPD = 1.0;
  var ANIM_INT = 0.60;

  function bayerAt(col, row) {
    return BAYER8[(row % BAYER_N) * BAYER_N + (col % BAYER_N)] / 64.0;
  }

  function field(col, row, t) {
    var x = col * 0.18, y = row * 0.14;
    return (
      Math.sin(x + t * 0.70) * 0.22 +
      Math.sin(y + t * 0.50) * 0.20 +
      Math.sin(x * 0.55 + y * 0.70 + t * 1.10) * 0.18 +
      Math.sin(x * 1.20 - y * 0.40 + t * 0.85) * 0.15 +
      Math.sin(x * 0.30 + y * 0.95 + t * 0.40) * 0.13 +
      Math.sin((x + y) * 0.22 - t * 0.65) * 0.12
    ) * 0.5 + 0.5;
  }

  function shimmer(col, row, t) {
    return Math.sin(col * 0.28 + row * 0.17 + t * 3.2) * 0.5 + 0.5;
  }

  function cellColor(lum, col, row, t, cols, rows) {
    var nx = col / cols, ny = row / rows;
    var hue = 38 + Math.sin(t * 0.45 + nx * 4.2) * 16
                 + Math.sin(t * 0.30 + ny * 3.1) * 10
                 + Math.sin(t * 0.80) * 8;
    var sat = 78 + Math.sin(t * 0.60 + nx * 2) * 22;
    var ltness = 45 + lum * 35;
    var alpha = 0.18 + lum * 0.60;
    return 'hsla(' + hue.toFixed(1) + ',' + sat.toFixed(1) + '%,' + ltness.toFixed(1) + '%,' + alpha.toFixed(3) + ')';
  }

  function render(ctx, canvas, t) {
    var W = canvas.width, H = canvas.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    var cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
    for (var row = 0; row < rows; row++) {
      for (var col = 0; col < cols; col++) {
        var raw = field(col, row, t);
        var shim = shimmer(col, row, t);
        var lum = raw * (1 - ANIM_INT * 0.40) + shim * (ANIM_INT * 0.40);
        var contrasted = (lum - 0.5) * CONTRAST + 0.5;
        contrasted = contrasted < 0 ? 0 : contrasted > 1 ? 1 : contrasted;
        if (contrasted <= bayerAt(col, row)) continue;
        ctx.fillStyle = cellColor(contrasted, col, row, t, cols, rows);
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }
  }

  function buildScene(container) {
    var old = container.querySelector('canvas');
    if (old) old.remove();
    var canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;';
    container.insertBefore(canvas, container.firstChild);
    var ctx = canvas.getContext('2d');
    var animId = null, t = 0;
    function resize() {
      var r = container.getBoundingClientRect();
      canvas.width  = r.width  || window.innerWidth;
      canvas.height = r.height || window.innerHeight;
    }
    function loop() {
      resize();
      render(ctx, canvas, t);
      t += 0.016 * ANIM_SPD;
      animId = requestAnimationFrame(loop);
    }
    var backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) {
      new MutationObserver(function () { resize(); })
        .observe(backdrop, { attributes: true, attributeFilter: ['class','style'] });
    }
    window.addEventListener('resize', resize);
    resize();
    loop();
  }

  function tryBuild() {
    var container = document.getElementById('authShaderContainer');
    if (!container) return false;
    buildScene(container);
    return true;
  }

  function boot() {
    if (tryBuild()) return;
    var obs = new MutationObserver(function () { if (tryBuild()) obs.disconnect(); });
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
