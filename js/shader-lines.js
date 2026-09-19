/**
 * Three.js Shader Lines Background – Auth Modal
 * v7: Deferred build until modal is actually visible (non-zero dimensions).
 *     Guards against double Three.js import. Uses polling fallback.
 */
(function () {
  'use strict';

  var THREEJS_CDN = 'js/three.min.js'; /* local fallback – CDN backup not needed */
  var shaderBuilt = false;
  var threeLoading = false;

  /* ── 1. Load Three.js exactly once ── */
  function ensureThree(cb) {
    if (typeof THREE !== 'undefined') { cb(); return; }
    if (threeLoading) {
      // Already loading – poll until ready
      var poll = setInterval(function () {
        if (typeof THREE !== 'undefined') { clearInterval(poll); cb(); }
      }, 50);
      return;
    }
    threeLoading = true;
    var s = document.createElement('script');
    s.src = THREEJS_CDN;
    s.onload  = function () { cb(); };
    s.onerror = function () {
      threeLoading = false;
      console.warn('[Shader] Three.js failed to load.');
    };
    document.head.appendChild(s);
  }

  /* ── 2. Build the WebGL scene once Three is ready ── */
  function buildScene() {
    if (shaderBuilt) return;
    if (typeof THREE === 'undefined') return;

    var container = document.getElementById('authShaderContainer');
    if (!container) return;

    shaderBuilt = true;
    container.innerHTML = '';

    var camera   = new THREE.Camera();
    camera.position.z = 1;
    var scene    = new THREE.Scene();
    var GeoClass = THREE.PlaneGeometry || THREE.PlaneBufferGeometry;
    var geometry = new GeoClass(2, 2);

    var uniforms = {
      time:       { type: 'f',  value: 1.0 },
      resolution: { type: 'v2', value: new THREE.Vector2() }
    };

    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      transparent: true,
      vertexShader: [
        'void main(){gl_Position=vec4(position,1.0);}'
      ].join(''),
      fragmentShader: [
        'precision highp float;',
        'uniform vec2 resolution;',
        'uniform float time;',
        'void main(){',
        '  vec2 st=(gl_FragCoord.xy*2.0-resolution)/min(resolution.x,resolution.y);',
        '  float r=length(st)*1.8;',
        '  float a=atan(st.y,st.x);',
        '  float f=abs(cos(a*4.0+time*0.4))*0.4+0.3;',
        '  float d=1.0-smoothstep(f,f+0.08,r);',
        '  float d2=1.0-smoothstep(f*0.8,f*0.8+0.15,r);',
        '  vec3 col=vec3(0.83,0.68,0.21)*(d-d2)*0.6;',
        '  col+=vec3(0.12,0.12,0.16)*d;',
        '  gl_FragColor=vec4(col,(d>0.01)?0.35:0.0);',
        '}'
      ].join('\n')
    });

    var mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    var renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    function syncSize() {
      /* Always use window size as safe fallback when container is hidden */
      var w = container.offsetWidth  || container.clientWidth  || window.innerWidth;
      var h = container.offsetHeight || container.clientHeight || window.innerHeight;
      if (w === 0) w = window.innerWidth;
      if (h === 0) h = window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.resolution.value.set(
        renderer.domElement.width,
        renderer.domElement.height
      );
    }

    syncSize();
    window.addEventListener('resize', syncSize, false);

    /* Watch for modal becoming active so we re-sync the canvas size */
    var backdrop = document.getElementById('authModalBackdrop');
    if (backdrop) {
      new MutationObserver(function () {
        requestAnimationFrame(syncSize);
      }).observe(backdrop, { attributes: true, attributeFilter: ['class', 'style'] });
    }

    /* Animation loop */
    (function animate() {
      requestAnimationFrame(animate);
      uniforms.time.value += 0.018;
      syncSize(); // keep canvas fitted to container at all times
      renderer.render(scene, camera);
    })();
  }

  /* ── 3. Wait until the modal backdrop exists AND is marked active ── */
  function tryBuild() {
    var backdrop  = document.getElementById('authModalBackdrop');
    var container = document.getElementById('authShaderContainer');
    if (!backdrop || !container) return false;

    // Build immediately (syncSize handles 0-size case)
    ensureThree(buildScene);
    return true;
  }

  /* ── 4. Boot: try now, then watch for DOM/modal changes ── */
  function boot() {
    if (tryBuild()) return; // succeeded already

    // Wait for DOM elements to appear
    var domObs = new MutationObserver(function () {
      if (tryBuild()) domObs.disconnect();
    });
    domObs.observe(document.body || document.documentElement,
      { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
