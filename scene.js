// "The Signal" — Glance hero WebGL scene.
// A glowing 3D progress ring + a stream of encrypted-data particles flowing
// Mac -> iPhone, with bloom, cursor parallax, and scroll reaction. Layered
// behind the DOM content. Degrades safely: reduced-motion / no-WebGL / failure
// all fall back to the existing CSS hero (the canvas just stays transparent).

const canvas = document.getElementById("scene");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Bail cleanly — the CSS hero (ring + mock) remains the experience.
if (canvas && !reduceMotion) {
  boot().catch((e) => {
    console.warn("scene: disabled", e);
    canvas.style.display = "none";
  });
}

async function boot() {
  // Quick WebGL capability probe before importing the heavy libs.
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) {
    throw new Error("no webgl");
  }

  const THREE = await import("three");
  const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
  const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
  const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");
  const { default: Lenis } = await import("lenis");
  const { default: gsap } = await import("gsap");

  const coarse = matchMedia("(pointer: coarse)").matches;
  const mobile = innerWidth < 760 || coarse;

  // ---- palette (matches the site tokens) ----
  const C = {
    blue: new THREE.Color(0x3b82f6),
    blueHi: new THREE.Color(0x8fc0ff),
    orange: new THREE.Color(0xf2a93b),
    green: new THREE.Color(0x4fd486),
  };

  // ---- renderer ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  document.documentElement.classList.add("webgl"); // hides the CSS conic ring; 3D replaces it

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 0, 9);

  const world = new THREE.Group();
  scene.add(world);

  // ---- the progress ring (glowing torus, custom flowing-gradient shader) ----
  const ringUniforms = {
    uTime: { value: 0 },
    uFill: { value: 0.0 },
    uOrange: { value: C.orange },
    uBlue: { value: C.blue },
    uBlueHi: { value: C.blueHi },
  };
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.6, 0.085, 48, 320),
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: ringUniforms,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        uniform float uTime, uFill;
        uniform vec3 uOrange, uBlue, uBlueHi;
        void main(){
          float t = vUv.x;                          // around the ring
          vec3 grad = mix(uOrange, uBlue, smoothstep(0.0, 0.55, t));
          grad = mix(grad, uBlueHi, smoothstep(0.55, 1.0, t));
          // a bright energy band gliding around the ring -> bloom catches it
          float band = smoothstep(0.86, 1.0, sin((t - uTime*0.12) * 6.2831853 * 3.0) * 0.5 + 0.5);
          vec3 col = grad * (0.55 + 1.7 * band);
          // unfilled remainder is dim
          float lit = smoothstep(uFill + 0.02, uFill, t);
          col = mix(col * 0.12, col, max(lit, 0.0) + 0.001);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
  );
  ring.rotation.z = -Math.PI / 2; // start point at top
  world.add(ring);

  // ---- particle stream: encrypted data Mac -> iPhone, arcing through the ring ----
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.2, -1.4, -1.5),
    new THREE.Vector3(-2.6, 0.7, 0.6),
    new THREE.Vector3(0.0, 0.0, 1.4),
    new THREE.Vector3(2.6, -0.7, 0.6),
    new THREE.Vector3(6.2, 1.2, -1.5),
  ]);
  const SAMPLES = 600;
  const path = curve.getSpacedPoints(SAMPLES); // baked, cheap per-frame lookup
  const COUNT = mobile ? 900 : 3600;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const speed = new Float32Array(COUNT);
  const jitter = new Float32Array(COUNT * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < COUNT; i++) {
    phase[i] = Math.random();
    speed[i] = 0.018 + Math.random() * 0.03;
    jitter[i * 3] = (Math.random() - 0.5) * 0.55;
    jitter[i * 3 + 1] = (Math.random() - 0.5) * 0.55;
    jitter[i * 3 + 2] = (Math.random() - 0.5) * 0.55;
    tmp.copy(Math.random() < 0.5 ? C.blue : C.blueHi).lerp(C.orange, Math.random() * 0.35);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sprite = makeDot();
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: mobile ? 0.11 : 0.085, map: sprite, vertexColors: true,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      sizeAttenuation: true, opacity: 0.95,
    })
  );
  world.add(particles);

  function makeDot() {
    const s = 64, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, "rgba(255,255,255,1)");
    rg.addColorStop(0.35, "rgba(255,255,255,0.6)");
    rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
  }

  // ---- bloom ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight),
    mobile ? 0.9 : 1.15, // strength
    0.7,                  // radius
    0.0                   // threshold (let the dim ring contribute softly)
  );
  composer.addPass(bloom);
  composer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));

  // ---- interaction: cursor / tilt parallax + scroll ----
  const target = { x: 0, y: 0 };
  if (!coarse) addEventListener("pointermove", (e) => {
    target.x = (e.clientX / innerWidth - 0.5);
    target.y = (e.clientY / innerHeight - 0.5);
  });
  let scrollN = 0; // 0..1 down the page
  const lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on("scroll", ({ scroll, limit }) => { scrollN = limit > 0 ? scroll / limit : 0; });
  function raf(t) { lenis.raf(t); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);

  // entrance: ring fills + scene fades in
  gsap.fromTo(ringUniforms.uFill, { value: 0 }, { value: 0.88, duration: 2.6, ease: "expo.out", delay: 0.2 });
  gsap.fromTo(world.scale, { x: 0.7, y: 0.7, z: 0.7 }, { x: 1, y: 1, z: 1, duration: 2.0, ease: "expo.out" });

  // ---- resize ----
  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });

  // ---- render loop (paused when tab hidden) ----
  let running = true;
  document.addEventListener("visibilitychange", () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(loop); }
  });
  let last = performance.now();
  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    ringUniforms.uTime.value += dt;

    // advance particles along the baked path
    for (let i = 0; i < COUNT; i++) {
      let p = phase[i] + speed[i] * dt * (1.0 + scrollN * 0.8);
      if (p >= 1) p -= 1; phase[i] = p;
      const idx = (p * SAMPLES) | 0, a = path[idx], b = path[Math.min(idx + 1, SAMPLES)];
      const f = p * SAMPLES - idx;
      pos[i * 3] = a.x + (b.x - a.x) * f + jitter[i * 3];
      pos[i * 3 + 1] = a.y + (b.y - a.y) * f + jitter[i * 3 + 1];
      pos[i * 3 + 2] = a.z + (b.z - a.z) * f + jitter[i * 3 + 2];
    }
    pGeo.attributes.position.needsUpdate = true;

    // parallax + slow auto-rotation + scroll tilt
    world.rotation.y += ((target.x * 0.5) - world.rotation.y) * 0.05;
    world.rotation.x += ((target.y * 0.3 + scrollN * 0.5) - world.rotation.x) * 0.05;
    ring.rotation.z = -Math.PI / 2 - now * 0.00004;
    camera.position.z = 9 + scrollN * 3.5; // dolly out as you scroll
    // full-glory in the hero; fade back so lower sections stay clean + readable
    canvas.style.opacity = String(1 - Math.min(scrollN * 1.6, 0.78));

    composer.render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
