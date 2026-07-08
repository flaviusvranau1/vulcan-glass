import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const isMobile = window.matchMedia('(pointer: coarse)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Renderer ----------
const canvas = document.getElementById('webgl');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // post-processing-ul ascunde aliasing-ul; MSAA nu se aplică oricum pe render targets
  stencil: false,
  alpha: false,
  powerPreference: 'high-performance',
});
const DPR = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(window.innerWidth, window.innerHeight);
// transmisia randează scena încă o dată — o ținem sub rezoluția completă (r172+)
renderer.transmissionResolutionScale = isMobile ? 0.5 : 0.75;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// ---------- Scene & camera ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04080f);
scene.fog = new THREE.FogExp2(0x04080f, 0.02);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);
camera.position.set(0, 0.15, 8.6); // fără text mare peste roată — obiectul stă în centru, ca la igloo

// ---------- Environment (reflexiile din sticlă vin de aici) ----------
// Fundalul rămâne negru, dar mediul are câteva panouri luminoase ("lightformers"):
// dungile lor reflectate sunt singurul mod în care sticla se citește pe întuneric.
function buildEnvScene() {
  const env = new THREE.Scene();
  // gradient moale pe panouri: dreptunghiurile albe cu margini dure se reflectă
  // ca "plastic de showroom" — miez luminos cu falloff = reflexii organice
  const gc = document.createElement('canvas');
  gc.width = gc.height = 128;
  const gcx = gc.getContext('2d');
  const gg = gcx.createRadialGradient(64, 64, 6, 64, 64, 64);
  gg.addColorStop(0, '#fff');
  gg.addColorStop(0.55, '#555');
  gg.addColorStop(1, '#000');
  gcx.fillStyle = gg;
  gcx.fillRect(0, 0, 128, 128);
  const gradTex = new THREE.CanvasTexture(gc);
  const addFormer = (hex, intensity, w, h, x, y, z) => {
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: gradTex });
    mat.color = new THREE.Color(hex).multiplyScalar(intensity);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  addFormer(0xffffff, 4.5, 10, 3, 0, 7, 0);      // panou alb lat, deasupra
  addFormer(0x7fd8ff, 3.5, 1.6, 9, -7, 0, 2);    // dungă rece, stânga
  addFormer(0xffb36b, 2.2, 1.2, 7, 7, -1, 1);    // dungă caldă, dreapta
  addFormer(0x3a7bd5, 1.4, 8, 5, 0, -1, -9);     // umplere albastră, în spate
  return env;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(buildEnvScene(), 0.04).texture;
scene.environmentIntensity = 1.15;
pmrem.dispose(); // env-ul e copt, generatorul nu mai e necesar

// ---------- Lumini ----------
const keyLight = new THREE.PointLight(0x8fd8ff, 12, 30);
keyLight.position.set(4, 3, 4);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x3a7bd5, 16, 30);
rimLight.position.set(-5, -2, -4);
scene.add(rimLight);

const warmLight = new THREE.PointLight(0xffb36b, 6, 20);
warmLight.position.set(2.5, -2.5, 3);
scene.add(warmLight);

// lumina din interiorul anvelopei — efectul "igloo"
const coreLight = new THREE.PointLight(0xaee9ff, 5, 8);
coreLight.position.set(0, 0, 0);
scene.add(coreLight);

// ---------- Halo (disc luminos în spatele anvelopei) ----------
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(143, 216, 255, 0.55)');
  g.addColorStop(0.4, 'rgba(80, 150, 220, 0.18)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
const glowMat = new THREE.SpriteMaterial({
  map: makeGlowTexture(),
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  transparent: true,
  opacity: 0.85,
});
const glow = new THREE.Sprite(glowMat);
glow.scale.set(17, 17, 1);
glow.position.set(0, 0, -4.2);
scene.add(glow);

// ---------- Anvelopa de sticlă ----------
// sticla CG pare "plastic ieftin" când suprafața e perfect uniformă;
// o hartă de rugozitate cu pete o face să respire ca gheața reală
function makeRoughnessNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const cx = c.getContext('2d');
  cx.fillStyle = 'rgb(58,58,58)';
  cx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const g = Math.floor(26 + Math.random() * 90);
    cx.fillStyle = `rgba(${g},${g},${g},0.35)`;
    const r = 2 + Math.random() * 14;
    cx.beginPath();
    cx.arc(Math.random() * 256, Math.random() * 256, r, 0, 7);
    cx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const glassNoise = makeRoughnessNoise();

const glassMat = new THREE.MeshPhysicalMaterial({
  transmission: 1,
  thickness: 1.4,
  roughness: 1, // valoarea reală vine din hartă: ~0.12–0.42, variată ca gheața
  roughnessMap: glassNoise,
  bumpMap: glassNoise,            // micro-relief: sparge și banding-ul din bufferul de transmisie
  bumpScale: 0.015,
  metalness: 0,
  ior: 1.31,                      // gheață reală (physicallybased.info), nu sticlă generică
  dispersion: isMobile ? 0 : 0.15, // cu ior 1.31, dispersia mare arată a piatră prețioasă, nu a gheață
  attenuationColor: new THREE.Color(0x9fc7db),
  attenuationDistance: 0.9,       // umerii anvelopei se adâncesc vizibil în culoare
  clearcoat: 0,                   // semnalul #1 de "plastic ud" — sticla reală nu are lac
  envMapIntensity: 1.0,
  specularIntensity: 0.6,
  iridescence: 0.25,              // șoapta futuristă — sfertul valorii de balon de săpun
  iridescenceIOR: 1.3,
  iridescenceThicknessRange: [100, 400],
});

const tireGroup = new THREE.Group();   // orientarea generală (controlată de scroll + mouse)
const spinGroup = new THREE.Group();   // rotația roții în jurul propriei axe
tireGroup.add(spinGroup);
scene.add(tireGroup);

// corpul anvelopei
const body = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.62, 48, 128), glassMat);
spinGroup.add(body);

// crampoanele (profilul) — un singur InstancedMesh (un draw call), dar fiecare piesă
// are propriul arc: cursorul le împinge, ele revin elastic (interacțiunea "igloo")
const blockGeo = new THREE.BoxGeometry(0.14, 0.12, 0.3); // radial, tangențial, axial
const N_BLOCKS = 64;
const treadInst = new THREE.InstancedMesh(blockGeo, glassMat, N_BLOCKS * 2);
treadInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
treadInst.frustumCulled = false; // bounding-ul unei singure cutii ar tăia greșit tot inelul
const treadPieces = [];
{
  const T = new THREE.Matrix4();
  const RX = new THREE.Matrix4();
  let idx = 0;
  for (let i = 0; i < N_BLOCKS; i++) {
    for (const row of [-1, 1]) {
      const a = (i / N_BLOCKS) * Math.PI * 2 + (row > 0 ? Math.PI / N_BLOCKS : 0);
      const m = new THREE.Matrix4()
        .makeRotationZ(a)
        .multiply(T.makeTranslation(2.15, 0, row * 0.22))
        .multiply(RX.makeRotationX(row * 0.5)); // striație direcțională, în V
      treadInst.setMatrixAt(idx, m);
      const pos = new THREE.Vector3().setFromMatrixPosition(m);
      const angle = Math.atan2(pos.y, pos.x);
      const piece = {
        mat: m.clone(),
        pos,
        angle,
        radial: new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0),
        tangent: new THREE.Vector3(-Math.sin(angle), Math.cos(angle), 0),
        off: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        seed: 0.7 + Math.random() * 0.6, // fiecare piesă reacționează puțin diferit — organic, nu mecanic
        frozen: false,
        releaseAt: 0,
      };
      if (!reducedMotion) {
        // intro-ul de asamblare: piesa pornește împrăștiată departe; arcul o aduce la locul ei
        piece.off.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          .normalize().multiplyScalar(6 + Math.random() * 5);
        piece.frozen = true;
      }
      treadPieces.push(piece);
      idx++;
    }
  }
}
spinGroup.add(treadInst);

// inele fine luminoase pe flancuri — accentul "neon în gheață"
const ringMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(0x8fe3ff).multiplyScalar(2.5), // HDR: peste threshold-ul de bloom, deci doar ele "aprind"
  transparent: true,
  opacity: 0.9,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});
for (const side of [-1, 1]) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.012, 8, 120), ringMat);
  ring.position.z = side * 0.5;
  spinGroup.add(ring);
}

// janta metalică — grup separat, ca să se poată desprinde din anvelopă (exploded view)
const metalMat = new THREE.MeshStandardMaterial({
  color: 0x2a313c,
  metalness: 1,
  roughness: 0.28,
  envMapIntensity: 1.4,
});
const rimGroup = new THREE.Group();
spinGroup.add(rimGroup);

const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 32), metalMat);
hub.rotation.x = Math.PI / 2;
rimGroup.add(hub);

const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.055, 16, 90), metalMat);
rimGroup.add(rimRing);

const spokeGeo = new THREE.BoxGeometry(0.1, 0.72, 0.09);
for (let i = 0; i < 5; i++) {
  const spoke = new THREE.Mesh(spokeGeo, metalMat);
  const a = (i / 5) * Math.PI * 2;
  spoke.position.set(Math.cos(a + Math.PI / 2) * 0.6, Math.sin(a + Math.PI / 2) * 0.6, 0);
  spoke.rotation.z = a;
  rimGroup.add(spoke);
}

// prezoanele — cilindri hexagonali pe fața butucului; la explode zboară în față, eșalonat
const boltMat = new THREE.MeshStandardMaterial({
  color: 0x9aa3ad,
  metalness: 1,
  roughness: 0.18,
  envMapIntensity: 1.6,
});
const boltPieces = [];
const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 6);
for (let i = 0; i < 5; i++) {
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
  bolt.rotation.x = Math.PI / 2;
  bolt.position.set(Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0.24);
  spinGroup.add(bolt);
  const piece = {
    mesh: bolt,
    pos: bolt.position.clone(),
    off: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    seed: 0.8 + Math.random() * 0.5,
    frozen: false,
    releaseAt: 0,
  };
  if (!reducedMotion) {
    piece.off.set(Math.random() - 0.5, Math.random() - 0.5, 0.5 + Math.random())
      .normalize().multiplyScalar(4 + Math.random() * 3);
    piece.frozen = true;
  }
  boltPieces.push(piece);
}
if (!reducedMotion) rimGroup.scale.setScalar(0.001); // janta "crește" la intro

// ---------- Interacțiunea cu cursorul (stil igloo) ----------
// Două forme invizibile primesc raycast-ul: torul (suprafața anvelopei) și un disc peste butuc.
// Punctul lovit împinge piesele din jur; arcul le aduce înapoi.
const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
// tub generos: acoperă și crampoanele ieșite în afară și aerul de lângă suprafață —
// cu modelul unghiular nu contează că hit-ul cade puțin mai departe radial
const torusProxy = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.85, 12, 48), proxyMat);
const discProxy = new THREE.Mesh(new THREE.CircleGeometry(1.3, 24), proxyMat);
discProxy.position.z = 0.4;
tireGroup.add(torusProxy, discProxy);

const raycaster = new THREE.Raycaster();
const rayNdc = new THREE.Vector2();
const hitLocal = new THREE.Vector3();
let hitActive = false;

const _F = new THREE.Vector3();
const _cur = new THREE.Vector3();
let introActive = !reducedMotion; // cât rulează asamblarea, plafonul de deplasare e ridicat
// arcul comun: _F trebuie setat înainte de apel
function integrate(piece, dt) {
  piece.vel.addScaledVector(_F, dt);
  piece.vel.addScaledVector(piece.off, -55 * dt);          // arcul care trage piesa acasă
  piece.vel.multiplyScalar(Math.max(0, 1 - 7.5 * dt));     // amortizare — wobble scurt, apoi liniște
  piece.off.addScaledVector(piece.vel, dt);
  const cap = introActive ? 20 : 0.85;                     // plafon: piesa se ferește, nu evadează
  const L = piece.off.length();
  if (L > cap) piece.off.multiplyScalar(cap / L);
}

// ---------- Particule (praf de gheață) ----------
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(200,235,255,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const P_COUNT = isMobile ? 700 : 1500;
const pPos = new Float32Array(P_COUNT * 3);
const pSpeed = new Float32Array(P_COUNT);
for (let i = 0; i < P_COUNT; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 24;
  pPos[i * 3 + 1] = (Math.random() - 0.5) * 14;
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 18;
  pSpeed[i] = 0.1 + Math.random() * 0.35;
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.06,
  map: makeDotTexture(),
  color: 0xbfe6ff,
  transparent: true,
  opacity: 0.65,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  sizeAttenuation: true,
}));
particles.frustumCulled = false;
scene.add(particles);

// ---------- Logo din praf — finalul igloo: literele se destramă sub cursor și se refac ----------
const LOGO_CENTER = new THREE.Vector3(0, 0.95, -11);
const dustPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 11); // planul z = -11
const _dustHit = new THREE.Vector3();
const dust = { count: 0, active: false };
let dustPoints = null;
let dustGeo = null;
let dustHome = null;
let dustPos = null;
let dustVel = null;
let dustSeed = null;
let dustBaseCol = null;
let dustColAttr = null;

function buildDustLogo() {
  const W = 1200;
  const H = 240;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext('2d');
  cx.fillStyle = '#fff';
  cx.font = "700 168px 'Space Grotesk', sans-serif";
  cx.textAlign = 'center';
  cx.textBaseline = 'middle';
  cx.fillText('VULCAN GLASS', W / 2, H / 2 + 8);
  const img = cx.getImageData(0, 0, W, H).data;
  const step = isMobile ? 4 : 3; // ~4-7k particule — CPU le duce lejer
  const homes = [];
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (img[(y * W + x) * 4 + 3] > 120) homes.push(x, y);
    }
  }
  const n = homes.length / 2;
  dust.count = n;
  const S = 3.4 / W; // lățimea logo-ului în unități de scenă
  dustHome = new Float32Array(n * 3);
  dustPos = new Float32Array(n * 3);
  dustVel = new Float32Array(n * 3);
  dustSeed = new Float32Array(n * 2); // fază + sensibilitate per particulă
  const colors = new Float32Array(n * 3);
  const cIce = new THREE.Color(0xbfe8ff);
  const cWhite = new THREE.Color(0xf2f8ff);
  const cAmber = new THREE.Color(0xffb36b);
  for (let i = 0; i < n; i++) {
    const hx = (homes[i * 2] - W / 2) * S + LOGO_CENTER.x;
    const hy = (H / 2 - homes[i * 2 + 1]) * S + LOGO_CENTER.y;
    const hz = LOGO_CENTER.z + (Math.random() - 0.5) * 0.12; // adâncime ușoară = praf, nu poster
    dustHome[i * 3] = hx;
    dustHome[i * 3 + 1] = hy;
    dustHome[i * 3 + 2] = hz;
    dustPos[i * 3] = hx;
    dustPos[i * 3 + 1] = hy;
    dustPos[i * 3 + 2] = hz;
    dustSeed[i * 2] = Math.random() * Math.PI * 2;
    dustSeed[i * 2 + 1] = 0.6 + Math.random() * 0.9;
    const r = Math.random();
    const c = r < 0.06 ? cAmber : r < 0.5 ? cIce : cWhite;
    const glow = 0.9 + Math.random() * 0.8; // câteva scântei trec de threshold-ul de bloom
    colors[i * 3] = c.r * glow;
    colors[i * 3 + 1] = c.g * glow;
    colors[i * 3 + 2] = c.b * glow;
  }
  dustBaseCol = colors.slice(); // culorile de bază; cele afișate se scalează cu viteza (semnătura igloo)
  dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3).setUsage(THREE.DynamicDrawUsage));
  dustColAttr = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute('color', dustColAttr);
  dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.026,
    map: makeDotTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  }));
  dustPoints.frustumCulled = false;
  dustPoints.visible = false;
  scene.add(dustPoints);
}

// ---------- Post-processing ----------
// MSAA direct pe render target-ul composer-ului (WebGL2) = anti-aliasing real,
// iar HalfFloat previne banding-ul pe gradienturile întunecate
const composerTarget = new THREE.WebGLRenderTarget(
  window.innerWidth * DPR,
  window.innerHeight * DPR,
  { samples: 2, type: THREE.HalfFloatType } // MSAA 2x: diferența față de 4x nu se vede, costul da
);
const composer = new EffectComposer(renderer, composerTarget);
composer.setPixelRatio(DPR);
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight), // bloom-ul e oricum blur — nu merită pixeli de DPR
  0.35,  // strength
  0.25,  // radius mic = strălucire, nu ceață
  0.85   // threshold sus: doar speculare + inelele HDR aprind, restul rămâne curat
);
composer.addPass(bloom);

// tone mapping + sRGB ÎNAINTE de grain: grain-ul aplicat în spațiu liniar se "sparge" în umbre
composer.addPass(new OutputPass());

// pasul final (în sRGB): aberație cromatică radială + grain soft-light ponderat pe luminozitate + vinietă + dither
const finalPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uFrame: { value: 0 },
    uCA: { value: 0.004 },
    uRes: { value: new THREE.Vector2(window.innerWidth * DPR, window.innerHeight * DPR) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uFrame;
    uniform float uCA;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    vec3 softLight(vec3 base, vec3 blend) {
      return mix(sqrt(base) * (2.0 * blend - 1.0) + 2.0 * base * (1.0 - blend),
                 2.0 * base * blend + base * base * (1.0 - 2.0 * blend),
                 step(base, vec3(0.5)));
    }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float d = dot(c, c);
      // aberație cromatică radială: mică în repaus, crește la scroll rapid (uniform)
      float ca = uCA * d;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c * ca).b;
      // grain de film: celule ~2px device, soft-light, doar în tonuri medii/umbre
      vec2 gp = floor(uv * uRes / 2.0);
      float g = hash(gp + uFrame);
      vec3 grained = softLight(col, vec3(g));
      float response = smoothstep(0.05, 0.5, luma(col));
      vec3 grainResult = mix(grained, col, pow(response, 2.0));
      col = mix(col, grainResult, 0.35);
      // dither anti-banding pe gradienturile întunecate (invizibil)
      col += (hash(uv * uRes) - 0.5) / 255.0;
      // vinietă discretă
      float v = smoothstep(0.7, 0.2, d);
      col *= mix(0.82, 1.0, v);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
composer.addPass(finalPass);

// ---------- Scroll → cameră (GSAP ScrollTrigger) ----------
gsap.registerPlugin(ScrollTrigger, SplitText);

// Lenis: scroll-ul cu inerție al site-urilor premiate; ScrollTrigger se sincronizează cu el
const lenis = new Lenis({ lerp: 0.09, autoRaf: false });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

// proxy-ul animat de scroll; camera îl urmărește în bucla de randare
const cam = {
  x: 0, y: 0.15, z: 8.6,       // poziția camerei
  tx: 0, ty: 0.15, tz: 0,      // punctul privit — roata centrată, nimic peste ea
  rotY: 0.55,                  // unghiul anvelopei (three-quarter la început)
  spin: 0.22,                  // viteza de rotație a roții
  glowO: 0.85,                 // opacitatea halo-ului
};

// viteza de scroll alimentează efectele "igloo": spin, dâre de zăpadă, aberație cromatică
let scrollSpeed = 0;

const tl = gsap.timeline({
  defaults: { ease: 'none' },
  scrollTrigger: {
    trigger: '#content',
    start: 'top top',
    end: 'bottom bottom',
    scrub: 0.5, // Lenis face deja netezirea — scrub mare peste Lenis = terci
    onUpdate(self) {
      const v = Math.min(Math.abs(self.getVelocity()) / 2500, 1);
      if (v > scrollSpeed) scrollSpeed = v;
    },
  },
});

// 01 — trei sferturi față, aproape: aici inviți cursorul să se joace cu piesele
tl.to(cam, { x: 2.4, y: 0.8, z: 5.6, ty: 0.1, rotY: 0.8, spin: 0.3, duration: 1 }, 0);
// 02 — profil lateral
tl.to(cam, { x: -4.8, y: 0.3, z: 3.4, ty: 0.1, rotY: 1.45, spin: 0.45, duration: 1 }, 1);
// 03 — revine frontal, se pregătește survolul
tl.to(cam, { x: 0, y: 0.7, z: 4.0, ty: 0.3, rotY: 0.15, spin: 0.3, glowO: 0.35, duration: 1 }, 2);
// 04a — urcă și trece peste anvelopă, cu turația crescând...
tl.to(cam, { y: 3.2, z: 0.3, ty: 0, spin: 2.6, duration: 0.5 }, 3);
// 04b — ...și coboară pe diagonală spate-lateral: roata la turație, halo-ul în spate, silueta lizibilă
tl.to(cam, { x: -3.6, y: 0.9, z: -3.6, ty: 0, glowO: 0.4, spin: 1.2, duration: 0.5 }, 3.5);
// 05 — camera se întoarce și zboară spre logo-ul din praf, adânc în scenă
tl.to(cam, { x: 0, y: 0.35, z: -6.3, tx: 0, ty: 0.55, tz: -11, glowO: 0.08, spin: 0.35, duration: 1 }, 4);

// fade-in / fade-out pe textele secțiunilor + titluri dezvăluite pe linii, cu mască
document.querySelectorAll('.section .section-inner').forEach((el) => {
  gsap.from(el, {
    opacity: 0,
    y: 60,
    duration: 0.8,
    ease: 'power2.out',
    scrollTrigger: {
      trigger: el.closest('.section'),
      start: 'top 62%',
      end: 'bottom 38%',
      toggleActions: 'play reverse play reverse',
    },
  });
});
document.fonts.ready.then(() => {
  buildDustLogo(); // fontul Space Grotesk trebuie încărcat înainte să-l desenăm pe canvas
  if (reducedMotion) return;
  document.querySelectorAll('.section h2').forEach((h) => {
    const split = SplitText.create(h, { type: 'lines', mask: 'lines' });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 0.9,
      ease: 'power4.out',
      stagger: 0.09,
      scrollTrigger: {
        trigger: h.closest('.section'),
        start: 'top 62%',
        toggleActions: 'play none play none',
      },
    });
  });
});

// ---------- Mouse parallax ----------
const mouse = { x: 0, y: 0 };
const par = { x: 0, y: 0 };
let pointerSeen = false; // nu împinge piese până nu mișcă utilizatorul cursorul
let pointerSpeed = 0;    // viteza cursorului: mângâi roata = atingere fină, o mături = piesele zboară
let lastPX = 0;
let lastPY = 0;
window.addEventListener('pointermove', (e) => {
  if (pointerSeen) {
    const d = Math.hypot(e.clientX - lastPX, e.clientY - lastPY);
    pointerSpeed = Math.min(pointerSpeed + d * 0.02, 3);
  }
  lastPX = e.clientX;
  lastPY = e.clientY;
  pointerSeen = true;
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
});

// ---------- Resize ----------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  const pr = renderer.getPixelRatio();
  finalPass.uniforms.uRes.value.set(window.innerWidth * pr, window.innerHeight * pr);
});

// ---------- Garda de FPS (stil igloo): coboară calitatea în trepte până e fluid ----------
let ftAcc = 0;
let ftN = 0;
let degradeStep = 0;
function fpsWatchdog(dtRaw) {
  if (dtRaw > 0.25) return; // vârf izolat (compilare shadere, tab ascuns) — nu e FPS real
  ftAcc += dtRaw;
  ftN++;
  if (ftN < 60) return;
  const avg = ftAcc / ftN;
  ftAcc = 0;
  ftN = 0;
  if (avg > 0.024 && degradeStep < 4) { // sub ~42fps susținut → o treaptă jos
    degradeStep++;
    if (degradeStep === 1) {
      renderer.transmissionResolutionScale = 0.5; // întâi transmisia — cea mai scumpă, cea mai invizibilă
    } else {
      const pr = Math.max(1.0, renderer.getPixelRatio() * 0.85);
      renderer.setPixelRatio(pr);
      composer.setPixelRatio(pr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      finalPass.uniforms.uRes.value.set(window.innerWidth * pr, window.innerHeight * pr);
    }
  }
}

// ---------- Bucla de randare ----------
const clock = new THREE.Clock();
const lookTarget = new THREE.Vector3();
const _instMat = new THREE.Matrix4();
const intro = { zoom: reducedMotion ? 0 : 6 };  // distanță extra de cameră la intro (dolly-in)
const ringBase = { v: reducedMotion ? 0.9 : 0 }; // inelele neon se aprind spre finalul asamblării
let nextShiver = 12;                             // primul "fior" ambiental

function renderFrame() {
  const dtRaw = clock.getDelta();
  const dt = Math.min(dtRaw, 0.05);
  const t = clock.elapsedTime;
  fpsWatchdog(dtRaw);

  // viteza de scroll se stinge lin; alimentează spin, dâre de zăpadă și aberația cromatică
  scrollSpeed *= Math.max(0, 1 - 3 * dt);

  // rotația roții + orientarea din scroll + mouse
  spinGroup.rotation.z -= (cam.spin + scrollSpeed * 3) * dt;
  tireGroup.rotation.y = cam.rotY + par.x * 0.1;
  tireGroup.rotation.x = par.y * 0.06;
  tireGroup.position.y = Math.sin(t * 0.6) * 0.07; // plutire lentă

  // parallax lin
  par.x += (mouse.x - par.x) * 0.04;
  par.y += (mouse.y - par.y) * 0.04;

  camera.position.set(cam.x + par.x * 0.3, cam.y - par.y * 0.2, cam.z + intro.zoom);
  lookTarget.set(cam.tx, cam.ty, cam.tz);
  camera.lookAt(lookTarget);

  // stratul ambient: nimic nu stă perfect nemișcat — două sinusuri cu frecvențe incomensurabile
  const breathe = 1 + 0.12 * Math.sin(t * 0.9) + 0.06 * Math.sin(t * 1.37);
  ringMat.opacity = ringBase.v * breathe;
  bloom.strength = 0.35 * (1 + 0.06 * Math.sin(t * 0.9));

  // halo
  glowMat.opacity = cam.glowO * (1 + 0.08 * Math.sin(t * 0.7));

  // interacțiunea cu cursorul: punctul de interacțiune are inerție — perturbarea "curge" în urma cursorului
  rayNdc.x += (mouse.x - rayNdc.x) * 0.14;
  rayNdc.y += (-mouse.y - rayNdc.y) * 0.14;
  raycaster.setFromCamera(rayNdc, camera);
  const hits = pointerSeen ? raycaster.intersectObjects([torusProxy, discProxy], false) : [];
  hitActive = hits.length > 0;
  if (hitActive) {
    hitLocal.copy(hits[0].point);
    spinGroup.worldToLocal(hitLocal);
  }
  window.__lastHit = hitActive ? { x: hitLocal.x, y: hitLocal.y, z: hitLocal.z } : null;

  // forța cursorului crește cu viteza lui: mângâiere fină vs. măturare care aruncă piesele
  pointerSpeed *= Math.max(0, 1 - 5 * dt);
  const velBoost = 1 + Math.min(pointerSpeed, 2.5);

  // micro-evenimente: la 7-15s, un "fior" trece prin câteva piese — scena nu e niciodată moartă
  if (!reducedMotion && !introActive && t > nextShiver) {
    const a = Math.random() * Math.PI * 2;
    for (const p of treadPieces) {
      let dA = ((p.angle - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (Math.abs(dA) < 0.35) p.vel.addScaledVector(p.radial, 2.2 + Math.random() * 1.8);
    }
    nextShiver = t + 7 + Math.random() * 8;
  }

  // fizica crampoanelor: apropiere UNGHIULARĂ de cursor (oriunde atingi roata la "ora 2",
  // piesele de la ora 2 se feresc — radial în afară + tangențial, ca cioburile igloo)
  const hitA = hitActive ? Math.atan2(hitLocal.y, hitLocal.x) : 0;
  const _m = _instMat;
  for (let i = 0; i < treadPieces.length; i++) {
    const p = treadPieces[i];
    if (p.frozen) {
      if (t > p.releaseAt && p.releaseAt > 0) p.frozen = false;
    } else {
      _F.set(0, 0, 0);
      if (hitActive) {
        let dA = p.angle - hitA;
        dA = ((dA + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        const arc = Math.abs(dA) * 2.15;
        const dz = (p.pos.z - hitLocal.z) * 0.6; // adâncimea contează mai puțin — reacție uniformă pe toată lățimea
        const d = Math.sqrt(arc * arc + dz * dz);
        if (d < 1.6) {
          const q = 1 - d / 1.6;
          const s = 70 * q * q * p.seed * velBoost;
          _F.copy(p.radial).multiplyScalar(s);
          _F.addScaledVector(p.tangent, Math.sign(dA) * s * 0.5);
        }
      }
      integrate(p, dt);
    }
    _m.copy(p.mat);
    _m.elements[12] += p.off.x;
    _m.elements[13] += p.off.y;
    _m.elements[14] += p.off.z;
    treadInst.setMatrixAt(i, _m);
  }
  treadInst.instanceMatrix.needsUpdate = true;

  // prezoanele: împinse direct dinspre punctul lovit (butucul e plat, hit-ul cade aproape)
  for (const p of boltPieces) {
    if (p.frozen) {
      if (t > p.releaseAt && p.releaseAt > 0) p.frozen = false;
    } else {
      _F.set(0, 0, 0);
      if (hitActive) {
        _cur.copy(p.pos).add(p.off);
        const d = _cur.distanceTo(hitLocal);
        if (d < 1.3) {
          const q = 1 - d / 1.3;
          _F.subVectors(_cur, hitLocal).normalize().multiplyScalar(40 * q * q * p.seed * velBoost);
        }
      }
      integrate(p, dt);
    }
    p.mesh.position.copy(p.pos).add(p.off);
  }

  // logo-ul din praf: activ doar în cadrul final; cursorul îl destramă, arcurile îl refac
  dust.active = dustPoints !== null && cam.tz < -6;
  if (dustPoints) dustPoints.visible = dust.active;
  if (dust.active) {
    const hitOk = pointerSeen && raycaster.ray.intersectPlane(dustPlane, _dustHit) !== null;
    const R = 1.15;
    const push = 6 * velBoost; // măturarea rapidă suflă praful mai tare
    const damp = Math.max(0, 1 - 4.5 * dt);
    for (let i = 0; i < dust.count; i++) {
      const ix = i * 3;
      const px = dustPos[ix];
      const py = dustPos[ix + 1];
      const pz = dustPos[ix + 2];
      let fx = 0;
      let fy = 0;
      let fz = 0;
      if (hitOk) {
        const dx = px - _dustHit.x;
        const dy = py - _dustHit.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R * R) {
          const d = Math.sqrt(d2) || 0.001;
          const q = 1 - d / R;
          const s = (push * q * q * dustSeed[i * 2 + 1]) / d;
          fx = dx * s;
          fy = dy * s;
          fz = (dustSeed[i * 2] - Math.PI) * 0.1 * push * q * q; // puțină împrăștiere în adâncime
        }
      }
      // drift permanent — praful nu stă niciodată perfect nemișcat
      const ph = dustSeed[i * 2];
      fx += Math.sin(t * 0.8 + ph) * 0.3;
      fy += Math.cos(t * 0.63 + ph * 1.7) * 0.3;
      // arcul moale care rescrie literele
      fx += (dustHome[ix] - px) * 12;
      fy += (dustHome[ix + 1] - py) * 12;
      fz += (dustHome[ix + 2] - pz) * 12;
      dustVel[ix] = (dustVel[ix] + fx * dt) * damp;
      dustVel[ix + 1] = (dustVel[ix + 1] + fy * dt) * damp;
      dustVel[ix + 2] = (dustVel[ix + 2] + fz * dt) * damp;
      dustPos[ix] += dustVel[ix] * dt;
      dustPos[ix + 1] += dustVel[ix + 1] * dt;
      dustPos[ix + 2] += dustVel[ix + 2] * dt;
      // semnătura igloo: praful în mișcare se aprinde, praful așezat abia mocnește
      const sp = Math.abs(dustVel[ix]) + Math.abs(dustVel[ix + 1]) + Math.abs(dustVel[ix + 2]);
      const br = Math.min(0.72 + sp * 1.6, 2.4);
      dustColAttr.array[ix] = dustBaseCol[ix] * br;
      dustColAttr.array[ix + 1] = dustBaseCol[ix + 1] * br;
      dustColAttr.array[ix + 2] = dustBaseCol[ix + 2] * br;
    }
    dustGeo.attributes.position.needsUpdate = true;
    dustColAttr.needsUpdate = true;
  }

  // ninsoare fină; la scroll rapid cade în dâre, ca prin viteză
  const pos = pGeo.attributes.position.array;
  const fallBoost = 1 + scrollSpeed * 8;
  for (let i = 0; i < P_COUNT; i++) {
    pos[i * 3 + 1] -= pSpeed[i] * dt * fallBoost;
    if (pos[i * 3 + 1] < -7) pos[i * 3 + 1] = 7;
  }
  pGeo.attributes.position.needsUpdate = true;

  finalPass.uniforms.uFrame.value = Math.floor(t * 24); // grain reînsămânțat la 24fps = filmic, nu jitter
  finalPass.uniforms.uCA.value = 0.004 + scrollSpeed * 0.02; // aberația cromatică doar în viteză — limbajul igloo
  composer.render();
}

renderer.setAnimationLoop(renderFrame);
window.__renderOnce = renderFrame; // hook de debug: forțează un cadru din consolă/preview
window.__maxOff = () => {          // hook de debug: cât de departe sunt piesele de poziția lor de repaus
  let m = 0;
  for (const p of treadPieces) m = Math.max(m, p.off.length());
  for (const p of boltPieces) m = Math.max(m, p.off.length());
  return m;
};
window.__screenPosOfPiece = (i) => { // hook de debug: unde e piesa i pe ecran (px)
  const v = treadPieces[i].pos.clone();
  spinGroup.localToWorld(v);
  v.project(camera);
  return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
};

// butonul "Vezi din nou" — înapoi la început, prin Lenis
document.querySelector('.cta.ghost').addEventListener('click', (e) => {
  e.preventDefault();
  lenis.scrollTo(0, { duration: 1.6 });
});

// ---------- Cursor custom + butoane magnetice (doar mouse real) ----------
if (window.matchMedia('(pointer: fine)').matches && !reducedMotion) {
  document.body.classList.add('fine-cursor');
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  gsap.set([dot, ring], { xPercent: -50, yPercent: -50, opacity: 0 }); // invizibil până la prima mișcare
  const dotX = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3.out' });
  const dotY = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3.out' });
  const ringX = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3.out' });
  const ringY = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3.out' });
  let cursorShown = false;
  window.addEventListener('pointermove', (e) => {
    if (!cursorShown) {
      cursorShown = true;
      gsap.set([dot, ring], { x: e.clientX, y: e.clientY });
      gsap.to([dot, ring], { opacity: 1, duration: 0.3 });
    }
    dotX(e.clientX); dotY(e.clientY);
    ringX(e.clientX); ringY(e.clientY);
  });

  document.querySelectorAll('.cta, .cta-mini').forEach((btn) => {
    const bx = gsap.quickTo(btn, 'x', { duration: 0.3, ease: 'power3.out' });
    const by = gsap.quickTo(btn, 'y', { duration: 0.3, ease: 'power3.out' });
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      bx((e.clientX - r.left - r.width / 2) * 0.35);
      by((e.clientY - r.top - r.height / 2) * 0.35);
    });
    btn.addEventListener('pointerleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)' });
    });
  });
}

console.log(
  '%c VULCAN GLASS %c demo 3D interactiv · Flavius Vranău · three.js + GSAP ',
  'background:#8fe3ff;color:#04080f;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px',
  'background:#111a26;color:#8fe3ff;padding:4px 8px;border-radius:0 4px 4px 0'
);

// ---------- Intro ----------
// loader-ul dispare abia după ce shaderele sunt compilate în fundal — primul cadru e instant, fără blocaj
const pageLoaded = new Promise((r) => {
  if (document.readyState === 'complete') r();
  else window.addEventListener('load', r, { once: true });
});
const shadersCompiled = Promise.race([
  renderer.compileAsync(scene, camera),
  new Promise((r) => setTimeout(r, 2500)), // plasă de siguranță: nu bloca intro-ul dacă compilarea întârzie
]);
Promise.all([pageLoaded, shadersCompiled]).then(() => {
  setTimeout(() => {
    document.getElementById('loader').classList.add('hidden');
    document.body.classList.add('ready');

    // asamblarea: piesele se eliberează în val, arcurile le trag la locul lor
    if (!reducedMotion) {
      const t0 = clock.elapsedTime;
      treadPieces.forEach((p) => { p.releaseAt = t0 + 0.15 + Math.random() * 1.1; });
      boltPieces.forEach((p) => { p.releaseAt = t0 + 1.0 + Math.random() * 0.5; });
      gsap.to(intro, { zoom: 0, duration: 2.4, ease: 'expo.out', delay: 0.2, onComplete: () => { introActive = false; } });
      gsap.to(rimGroup.scale, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'back.out(1.4)', delay: 0.7 });
      gsap.to(ringBase, { v: 0.9, duration: 1.2, ease: 'power3.out', delay: 1.3 });
    }

    gsap.from('.hero-caption > *', {
      opacity: 0,
      y: 40,
      duration: 1.1,
      stagger: 0.12,
      ease: 'power3.out',
      delay: reducedMotion ? 0 : 0.9,
    });
  }, 200);
});
