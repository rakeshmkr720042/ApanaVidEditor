import type { Bloom } from '../types'

/**
 * Real-looking flowers drawn on the graphics chip (WebGL): every petal is a small curved 3D surface (cupped, bent
 * back, edges rolled), lit by a warm sun with soft wrap light, light shining through thin petals, velvet sheen at
 * the edges, fine veins and darker hearts. A whole flower is rings of such petals that open one ring after another,
 * with green sepals, a stem and leaves. Used for the garden, the hero bud that blooms, the flower thumbs and the
 * loose falling petals (pre-drawn tumbling sprites). Everything is a pure function of its inputs, so preview and
 * export give the same picture. Returns null when WebGL is missing; callers then use the simple 2D flowers.
 */
type Canvas = HTMLCanvasElement | OffscreenCanvas
type Ctx2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
export type FlowerKind = Bloom['flower']
type RGB = [number, number, number]

// ---------- shapes (the number the shaders use) ----------
const SH = { rose: 0, pointed: 1, narrow: 2, notch: 3, leaf: 4, ruffle: 5, sphere: 6, stem: 7, disc: 8, stamen: 9 } as const

interface Ring {
  n: number; len: number; wid: number; r0: number; lift?: number
  th: [number, number]; bend: [number, number]; cup: [number, number]; curl: [number, number]
  delay: number; ao: number; az?: number; shape: number; roll?: number; ruffle?: number; jitter?: number
  green?: boolean // sepals
}
interface Spec {
  rings: Ring[]
  center?: { kind: 'disc' | 'pod' | 'stamens'; r: number; y: number; n?: number }
  bud: number // how small the closed bud is (petal length factor when closed)
  sheen: number; trans: number; tipLight: number
  stemR: number
}

const ROSE: Spec = {
  bud: 0.8, sheen: 0.3, trans: 0.25, tipLight: 0.06, stemR: 0.032,
  rings: [
    { n: 5, len: 0.42, wid: 0.42, r0: 0.05, lift: -0.06, th: [0.45, 2.0], bend: [-0.9, 0.3], cup: [1.0, 0.3], curl: [0, 0.1], delay: 0, ao: 1, az: 0.3, shape: SH.leaf, green: true },
    { n: 5, len: 0.68, wid: 1.0, r0: 0.07, th: [0.42, 1.42], bend: [-1.25, 0.3], cup: [1.35, 0.55], curl: [0, 1.0], delay: 0.02, ao: 1, az: 0, shape: SH.rose, roll: 0.9 },
    { n: 5, len: 0.62, wid: 1.0, r0: 0.06, th: [0.4, 1.12], bend: [-1.25, 0.45], cup: [1.35, 0.75], curl: [0, 0.8], delay: 0.1, ao: 0.93, az: 0.63, shape: SH.rose, roll: 0.75 },
    { n: 5, len: 0.55, wid: 1.0, r0: 0.05, th: [0.38, 0.78], bend: [-1.25, 0.55], cup: [1.35, 0.95], curl: [0, 0.55], delay: 0.18, ao: 0.84, az: 0.21, shape: SH.rose, roll: 0.55 },
    { n: 5, len: 0.47, wid: 1.0, r0: 0.04, th: [0.36, 0.45], bend: [-1.25, 0.5], cup: [1.35, 1.1], curl: [0, 0.3], delay: 0.25, ao: 0.72, az: 0.95, shape: SH.rose, roll: 0.35 },
    { n: 4, len: 0.39, wid: 1.1, r0: 0.03, th: [0.32, 0.2], bend: [-1.2, 0.2], cup: [1.4, 1.25], curl: [0, 0.1], delay: 0.31, ao: 0.6, az: 0.4, shape: SH.rose, roll: 0.15 },
    { n: 3, len: 0.3, wid: 1.25, r0: 0.015, th: [0.28, 0.05], bend: [-1.1, -0.1], cup: [1.5, 1.4], curl: [0, 0], delay: 0.36, ao: 0.5, az: 1.3, shape: SH.rose, roll: 0 },
  ],
}
const LOTUS: Spec = {
  bud: 0.75, sheen: 0.3, trans: 0.7, tipLight: -0.2, stemR: 0.03,
  center: { kind: 'pod', r: 0.13, y: 0.06 },
  rings: [
    { n: 6, len: 0.78, wid: 0.42, r0: 0.07, th: [0.12, 1.25], bend: [-0.1, 0.25], cup: [1.2, 0.8], curl: [0, 0.15], delay: 0, ao: 1, az: 0, shape: SH.pointed },
    { n: 6, len: 0.74, wid: 0.42, r0: 0.06, th: [0.06, 0.85], bend: [-0.1, 0.3], cup: [1.3, 0.9], curl: [0, 0.1], delay: 0.1, ao: 0.92, az: 0.52, shape: SH.pointed },
    { n: 5, len: 0.66, wid: 0.45, r0: 0.05, th: [0.02, 0.5], bend: [-0.05, 0.3], cup: [1.3, 1.0], curl: [0, 0.05], delay: 0.2, ao: 0.85, az: 0.2, shape: SH.pointed },
  ],
}
const SUNFLOWER: Spec = {
  bud: 0.5, sheen: 0.2, trans: 0.55, tipLight: 0.1, stemR: 0.05,
  center: { kind: 'disc', r: 0.36, y: 0.03 },
  rings: [
    { n: 16, len: 0.42, wid: 0.32, r0: 0.3, lift: -0.04, th: [0.4, 1.95], bend: [0.1, 0.1], cup: [0.5, 0.4], curl: [0, 0], delay: 0, ao: 0.9, az: 0, shape: SH.leaf, green: true },
    { n: 21, len: 0.64, wid: 0.3, r0: 0.33, th: [0.15, 1.5], bend: [-0.3, 0.25], cup: [0.9, 0.5], curl: [0, 0.25], delay: 0.04, ao: 1, az: 0, shape: SH.narrow, jitter: 0.12 },
    { n: 21, len: 0.6, wid: 0.3, r0: 0.31, th: [0.1, 1.35], bend: [-0.3, 0.3], cup: [0.9, 0.55], curl: [0, 0.2], delay: 0.1, ao: 0.9, az: 0.15, shape: SH.narrow, jitter: 0.12 },
  ],
}
const SAKURA: Spec = {
  bud: 0.55, sheen: 0.25, trans: 0.9, tipLight: 0.35, stemR: 0.018,
  center: { kind: 'stamens', r: 0.2, y: 0.02, n: 22 },
  rings: [
    { n: 5, len: 0.28, wid: 0.45, r0: 0.04, lift: -0.04, th: [0.4, 1.9], bend: [0.1, 0.2], cup: [0.6, 0.3], curl: [0, 0], delay: 0, ao: 1, az: 0.6, shape: SH.leaf, green: true },
    { n: 5, len: 0.62, wid: 0.95, r0: 0.05, th: [0.08, 1.3], bend: [-0.3, 0.2], cup: [1.6, 0.5], curl: [0, 0.25], delay: 0.02, ao: 1, az: 0, shape: SH.notch, roll: 0.2 },
  ],
}
const MARIGOLD: Spec = {
  bud: 0.5, sheen: 0.12, trans: 0.45, tipLight: 0.08, stemR: 0.035,
  rings: [
    { n: 9, len: 0.38, wid: 0.5, r0: 0.08, lift: -0.06, th: [0.3, 1.8], bend: [0.1, 0.2], cup: [0.5, 0.3], curl: [0, 0], delay: 0, ao: 1, az: 0, shape: SH.leaf, green: true },
    ...[0, 1, 2, 3, 4, 5, 6].map((k): Ring => ({
      n: 16 - k, len: 0.62 - k * 0.055, wid: 0.62, r0: 0.08 - k * 0.008, th: [0.1, 1.55 - k * 0.2], bend: [-0.2, 0.3 + k * 0.05], cup: [1.2, 0.7 + k * 0.08],
      curl: [0, 0.3], delay: 0.02 + k * 0.05, ao: 1 - k * 0.07, az: k * 0.41, shape: SH.ruffle, ruffle: 0.06, jitter: 0.1,
    })),
  ],
}
const SPECS: Record<FlowerKind, Spec> = { rose: ROSE, lotus: LOTUS, sunflower: SUNFLOWER, sakura: SAKURA, marigold: MARIGOLD }

// ---------- colours ----------
interface Pal { base: RGB; mid: RGB; tip: RGB; back: RGB; heart: RGB }
const hex = (h: string): RGB => { const n = parseInt(h.replace('#', '').slice(0, 6), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] }
const mixc = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
const NATURAL: Record<FlowerKind, string> = { rose: '#b3112b', lotus: '#f07aa8', sunflower: '#ffbf1f', sakura: '#f7a1c0', marigold: '#ff8a00' }
function palette(kind: FlowerKind, color: string | null | undefined): Pal {
  const c = hex(/^#?[0-9a-f]{6}/i.test(color ?? '') ? color! : NATURAL[kind])
  const sum = c[0] + c[1] + c[2]
  const white = sum > 2.5
  if (kind === 'lotus') return { base: mixc(c, [1, 0.98, 0.9], 0.85), mid: mixc(c, [1, 1, 1], 0.5), tip: c, back: mixc(c, [1, 1, 1], 0.3), heart: [1, 0.92, 0.6] }
  if (kind === 'sakura') return { base: mixc(c, [0.8, 0.15, 0.4], 0.5), mid: c, tip: mixc(c, [1, 0.95, 0.97], 0.45), back: mixc(c, [1, 1, 1], 0.3), heart: [0.75, 0.12, 0.3] }
  if (kind === 'sunflower' || kind === 'marigold') return { base: mixc(c, [0.55, 0.2, 0], 0.45), mid: c, tip: mixc(c, [1, 0.95, 0.6], 0.25), back: mixc(c, [0.9, 0.8, 0.3], 0.3), heart: [0.3, 0.15, 0.05] }
  // rose: dark velvet heart, rich middle, a touch lighter at the rim
  if (white) return { base: [0.93, 0.9, 0.72], mid: c, tip: [1, 0.99, 0.97], back: [0.95, 0.93, 0.88], heart: [0.85, 0.8, 0.55] }
  return { base: mixc(c, [0.12, 0, 0.02], 0.6), mid: mixc(c, [0.5, 0, 0.05], 0.15), tip: mixc(c, [1, 0.6, 0.6], 0.08), back: mixc(c, [1, 0.7, 0.7], 0.15), heart: mixc(c, [0.08, 0, 0.02], 0.75) }
}
const GREEN: Pal = { base: [0.13, 0.3, 0.08], mid: [0.2, 0.45, 0.12], tip: [0.3, 0.52, 0.16], back: [0.33, 0.5, 0.25], heart: [0.1, 0.2, 0.05] }
const WOOD: Pal = { base: [0.22, 0.14, 0.1], mid: [0.3, 0.2, 0.15], tip: [0.35, 0.25, 0.2], back: [0.3, 0.2, 0.15], heart: [0.2, 0.12, 0.08] }
const LEAF: Pal = { base: [0.1, 0.28, 0.07], mid: [0.16, 0.38, 0.1], tip: [0.2, 0.42, 0.12], back: [0.32, 0.47, 0.24], heart: [0.08, 0.2, 0.05] }

// ---------- shaders ----------
const VS = `
precision highp float;
attribute vec2 a_uv;
uniform float u_shape;
uniform vec4 u_geo;   // len, wid, r0, lift
uniform vec4 u_bend;  // th0, bend, cup, curl
uniform vec4 u_more;  // az, roll, ruffle, notch
uniform mat3 u_rot;   // flower -> view
uniform vec4 u_place; // centre x, y (ndc), scale (ndc per unit, y), aspect (w/h)
uniform vec2 u_depth; // base depth, perspective
varying vec2 v_uv;
varying vec3 v_n;
varying vec3 v_pos;

float halfWidth(float v, float u) {
  if (u_shape < 0.5) { // rose: narrow claw, broad round top
    return (0.28 + 0.72 * pow(sin(min(v / 0.72, 1.0) * 1.5708), 0.7)) * sqrt(max(0.0, 1.0 - pow(v, 7.0)));
  } else if (u_shape < 1.5) { // pointed (lotus)
    return pow(sin(3.1416 * pow(v, 0.75)), 0.85) * (1.0 - 0.15 * v);
  } else if (u_shape < 2.5) { // narrow (sunflower)
    return pow(sin(3.1416 * pow(v, 0.55)), 0.9) * (0.75 + 0.25 * v);
  } else if (u_shape < 3.5) { // notch (sakura)
    return (0.3 + 0.7 * pow(sin(min(v / 0.7, 1.0) * 1.5708), 0.6)) * sqrt(max(0.0, 1.0 - pow(v, 8.0)));
  } else if (u_shape < 4.5) { // leaf / sepal: pointed oval with fine teeth
    float w = pow(sin(3.1416 * pow(v, 0.8)), 0.9);
    return w * (1.0 - 0.06 * abs(fract(v * 9.0) - 0.5) * step(0.5, u_more.z + 0.5));
  } else if (u_shape < 5.5) { // ruffle (marigold)
    return (0.35 + 0.65 * pow(sin(min(v / 0.75, 1.0) * 1.5708), 0.6)) * sqrt(max(0.0, 1.0 - pow(v, 6.0)));
  }
  return 0.06 * (1.0 - 0.5 * v); // stamen
}

vec3 petalPos(vec2 uv) {
  float u = uv.x, v = uv.y;
  float len = u_geo.x;
  float L = 1.0;
  if (u_shape > 2.5 && u_shape < 3.5) L = 1.0 - 0.14 * exp(-pow(u * 3.5, 2.0));
  if (u_shape > 4.5 && u_shape < 5.5) L = 1.0 - 0.06 * abs(sin(u * 7.0));
  float s = v * L;
  // centre line in the (out, up) plane, bending as it goes; curl rolls the tip back
  vec2 p = vec2(0.0);
  const int N = 10;
  float ds = s / float(N);
  for (int i = 0; i < N; i++) {
    float sm = (float(i) + 0.5) * ds;
    float th = u_bend.x + u_bend.y * sm + u_bend.w * sm * sm * sm;
    p += vec2(sin(th), cos(th)) * ds;
  }
  float th = u_bend.x + u_bend.y * s + u_bend.w * s * s * s;
  vec2 nrm = vec2(-cos(th), sin(th)); // inner face, in (out, up)
  float hw = halfWidth(v, u) * u_geo.y;
  float x = u * hw;
  // cup: the sides curve towards the inner face (an arc), rose edges roll back out
  float k = u_bend.z / max(u_geo.y * 0.5, 0.05);
  float lat = abs(k) > 0.001 ? sin(k * x) / k : x;
  float off = abs(k) > 0.001 ? (1.0 - cos(k * x)) / k : 0.0;
  float edge = smoothstep(0.55, 1.0, abs(u)) * smoothstep(0.3, 1.0, v);
  off -= u_more.y * edge * edge * hw * 0.55;
  off += u_more.z * sin(u * 9.0 + v * 4.0) * v;
  float out_ = u_geo.z + (p.x + nrm.x * off) * len;
  float up = u_geo.w + (p.y + nrm.y * off) * len;
  float az = u_more.x;
  vec3 radial = vec3(sin(az), 0.0, cos(az));
  vec3 side = vec3(cos(az), 0.0, -sin(az));
  return radial * out_ + vec3(0.0, up, 0.0) + side * lat * len;
}

vec3 spherePos(vec2 uv) {
  float lon = uv.x * 3.1416, lat = (uv.y - 0.5) * 3.1416;
  return vec3(cos(lat) * sin(lon) * u_geo.y, u_geo.w + sin(lat) * u_geo.x, cos(lat) * cos(lon) * u_geo.y);
}
vec3 stemPos(vec2 uv) {
  float a = uv.x * 3.1416;
  float d = uv.y * u_geo.x; // down the stem
  float r = u_geo.y * (1.0 + 0.25 * uv.y);
  float bx = u_bend.y * d * d;
  return vec3(cos(a) * r + bx, u_geo.w - d, sin(a) * r);
}
vec3 discPos(vec2 uv) {
  float a = uv.x * 3.1416;
  float r = uv.y * u_geo.y;
  float dome = u_bend.x * (1.0 - uv.y * uv.y);
  return vec3(sin(a) * r, u_geo.w + dome, cos(a) * r);
}
vec3 posAt(vec2 uv) {
  if (u_shape > 8.5) return petalPos(uv);
  if (u_shape > 7.5) return discPos(uv);
  if (u_shape > 6.5) return stemPos(uv);
  if (u_shape > 5.5) return spherePos(uv);
  return petalPos(uv);
}
void main() {
  vec3 p = posAt(a_uv);
  vec3 pu = posAt(a_uv + vec2(0.01, 0.0));
  vec3 pv = posAt(a_uv + vec2(0.0, 0.01));
  vec3 n = cross(pu - p, pv - p);
  if (u_shape > 5.5 && u_shape < 8.5) n = -n;
  vec3 q = u_rot * p;
  v_n = u_rot * n;
  v_uv = a_uv;
  v_pos = q;
  float persp = 1.0 / max(0.2, 1.0 - q.z * u_depth.y);
  gl_Position = vec4(u_place.x + q.x * u_place.z * persp / u_place.w, u_place.y + q.y * u_place.z * persp, u_depth.x - q.z * 0.02, 1.0);
}`

const FS = `
precision highp float;
varying vec2 v_uv;
varying vec3 v_n;
varying vec3 v_pos;
uniform float u_shape;
uniform vec3 u_base, u_mid, u_tip, u_back, u_heart;
uniform vec4 u_look; // ao, sheen, translucency, tipLight
uniform vec3 u_light;
uniform float u_seed;
uniform float u_alpha;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
vec3 lin(vec3 c) { return c * c; }
void main() {
  vec3 n = normalize(v_n);
  bool front = gl_FrontFacing;
  if (!front) n = -n;
  vec3 V = vec3(0.0, 0.0, 1.0);
  if (dot(n, V) < 0.0) n = normalize(n - V * dot(n, V) * 1.2);
  vec3 L = normalize(u_light);
  float u = v_uv.x, v = v_uv.y;
  vec3 col;
  float sheen = u_look.y, trans = u_look.z;
  float ao = u_look.x;
  if (u_shape > 7.5 && u_shape < 8.5) {
    // seed disc (sunflower) or pod (lotus): golden-angle seeds
    float r = v;
    float a = u * 3.1416;
    vec2 pp = vec2(cos(a), sin(a)) * r;
    float k = r * r * 520.0;
    float ang = k * 2.39996;
    float seed = 0.5 + 0.5 * cos(ang - a * 1.0 + floor(k) * 0.0);
    float cells = noise(pp * 60.0) * 0.5 + 0.5 * seed;
    col = mix(u_heart * 0.6, u_heart * 1.4, cells);
    col = mix(col, u_mid * 0.9, smoothstep(0.82, 1.0, r));
    ao *= 0.7 + 0.3 * smoothstep(0.0, 0.6, r);
    sheen = 0.1; trans = 0.0;
  } else if (u_shape > 6.5 && u_shape < 7.5) {
    col = mix(u_mid, u_base, 0.4 + 0.3 * noise(vec2(u * 3.0, v * 40.0)));
    sheen = 0.25; trans = 0.0;
  } else if (u_shape > 5.5) {
    col = u_mid; sheen = 0.2; trans = 0.0;
  } else {
    float g = smoothstep(0.0, 0.5, v);
    col = mix(u_base, u_mid, g);
    col = mix(col, u_tip, smoothstep(0.55, 1.0, v) * (0.6 + 0.4 * abs(u)));
    col = mix(col, u_heart, (1.0 - smoothstep(0.0, 0.25, v)) * 0.6);
    // veins: fine streaks fanning out from the base, and a darker mid rib on leaves
    float vein = sin(u * (u_shape > 3.5 && u_shape < 4.5 ? 18.0 : 46.0) / (0.25 + v) + noise(vec2(u * 6.0, v * 3.0) + u_seed) * 2.0);
    col *= 0.95 + 0.05 * vein;
    if (u_shape > 3.5 && u_shape < 4.5) col *= 1.0 - 0.25 * exp(-pow(u * 14.0, 2.0)) * (1.0 - v * 0.5);
    float mott = noise(vec2(u * 2.5, v * 4.0) + u_seed * 7.0);
    col *= 0.9 + 0.2 * mott;
    if (!front) col = mix(u_back, u_back * (0.85 + 0.3 * mott), 0.5);
    // the very edge catches light (thin and see-through)
    float rim = smoothstep(0.8, 1.0, abs(u)) + smoothstep(0.9, 1.0, v);
    col = mix(col, u_tip * 1.15, clamp(rim, 0.0, 1.0) * u_look.w);
    ao *= 0.22 + 0.78 * smoothstep(0.0, 0.65, v);
  }
  vec3 c = lin(col);
  float ndl = dot(n, L);
  float diff = max(0.0, (ndl + 0.35) / 1.35);
  float back = max(0.0, -ndl) * trans;
  float fres = pow(1.0 - max(0.0, dot(n, V)), 2.5);
  vec3 sky = vec3(0.55, 0.62, 0.75);
  vec3 sun = vec3(1.0, 0.92, 0.78);
  vec3 h = normalize(L + V);
  float spec = pow(max(0.0, dot(n, h)), 24.0) * 0.12;
  vec3 lit = c * (sun * diff * 1.05 + sky * 0.2) * ao;
  lit += c * sun * back * 0.9 * (0.6 + 0.4 * ao);
  lit += (c * 1.6 + vec3(0.04)) * fres * sheen * 0.5 * ao;
  lit += sun * spec * ao;
  // soft filmic curve back to screen colours
  lit = lit / (1.0 + lit * 0.35);
  vec3 outc = sqrt(max(lit * 1.18, 0.0));
  gl_FragColor = vec4(outc * u_alpha, u_alpha);
}`

// ---------- GL state ----------
interface GL {
  cv: Canvas
  gl: WebGLRenderingContext
  prog: WebGLProgram
  loc: Record<string, WebGLUniformLocation | null>
  petal: { buf: WebGLBuffer; idx: WebGLBuffer; count: number }
}
let G: GL | null | undefined

function makeCanvas(w: number, h: number): Canvas {
  if (typeof document !== 'undefined') return Object.assign(document.createElement('canvas'), { width: w, height: h })
  return new OffscreenCanvas(w, h)
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn('flower shader', gl.getShaderInfoLog(s)); return null }
  return s
}

function init(): GL | null {
  try {
    const cv = makeCanvas(256, 256)
    const gl = cv.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true }) as WebGLRenderingContext | null
    if (!gl) return null
    const vs = compile(gl, gl.VERTEX_SHADER, VS), fs = compile(gl, gl.FRAGMENT_SHADER, FS)
    if (!vs || !fs) return null
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs); gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'a_uv')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('flower link', gl.getProgramInfoLog(prog)); return null }
    const names = ['u_shape', 'u_geo', 'u_bend', 'u_more', 'u_rot', 'u_place', 'u_depth', 'u_base', 'u_mid', 'u_tip', 'u_back', 'u_heart', 'u_look', 'u_light', 'u_seed', 'u_alpha']
    const loc: GL['loc'] = {}
    for (const n of names) loc[n] = gl.getUniformLocation(prog, n)
    // one grid used for every surface: u -1..1 across, v 0..1 along
    const NU = 14, NV = 22
    const verts: number[] = []
    for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
      const v = j / NV
      verts.push((i / NU) * 2 - 1, Math.min(0.999, v * v * 0.35 + v * 0.65)) // more rows near the base
    }
    const idx: number[] = []
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1
      idx.push(a, b, d, a, d, c)
    }
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW)
    const ib = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW)
    return { cv, gl, prog, loc, petal: { buf, idx: ib, count: idx.length } }
  } catch (e) {
    console.warn('flower gl', e)
    return null
  }
}
const get = () => (G === undefined ? (G = init()) : G)
/** True when real 3D flowers can be drawn on this device. */
export const flowersGL = () => !!get()

// ---------- maths ----------
type M3 = number[]
const rotY = (a: number): M3 => [Math.cos(a), 0, -Math.sin(a), 0, 1, 0, Math.sin(a), 0, Math.cos(a)]
const rotX = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a)]
const rotZ = (a: number): M3 => [Math.cos(a), Math.sin(a), 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 1]
/** Column-major 3×3 multiply (a then b applied: b·a). */
function mul(b: M3, a: M3): M3 {
  const r = new Array(9).fill(0)
  for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) {
    let s = 0
    for (let k = 0; k < 3; k++) s += b[k * 3 + rr] * a[c * 3 + k]
    r[c * 3 + rr] = s
  }
  return r
}
const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x) }
const lerp = (a: number, b: number, f: number) => a + (b - a) * f
const rnd = (i: number, k: number) => { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x) }

// ---------- drawing ----------
/** One flower to draw. Positions are in pixels of the target picture. */
export interface FlowerItem {
  kind: FlowerKind
  color: string | null
  open: number // 0 bud .. 1 fully open
  x: number; y: number // where the flower's heart is, px
  r: number // px from the heart to a fully open petal tip
  pitch: number // 0 = seen from the side, PI/2 = from straight above
  yaw: number
  roll?: number // lean of the flower head, radians
  stem?: number // stem length in r units (0 = none)
  stemBend?: number
  leaves?: number // leaves on the stem
  seed?: number
  alpha?: number
  bush?: number // >0: only a clump of this many leaves (no flower)
  stemColor?: 'green' | 'wood'
}

function setPal(gl: WebGLRenderingContext, loc: GL['loc'], p: Pal) {
  gl.uniform3fv(loc.u_base, p.base); gl.uniform3fv(loc.u_mid, p.mid); gl.uniform3fv(loc.u_tip, p.tip)
  gl.uniform3fv(loc.u_back, p.back); gl.uniform3fv(loc.u_heart, p.heart)
}

function drawSurface(g: GL, shape: number, geo: number[], bend: number[], more: number[], look: number[], seed: number) {
  const { gl, loc } = g
  gl.uniform1f(loc.u_shape, shape)
  gl.uniform4fv(loc.u_geo, geo)
  gl.uniform4fv(loc.u_bend, bend)
  gl.uniform4fv(loc.u_more, more)
  gl.uniform4fv(loc.u_look, look)
  gl.uniform1f(loc.u_seed, seed)
  gl.drawElements(gl.TRIANGLES, g.petal.count, gl.UNSIGNED_SHORT, 0)
}

/** How far ring `ri` of a flower has opened when the whole flower is `open`. */
const ringOpen = (r: Ring, open: number) => smooth((open - r.delay) / Math.max(0.3, 1 - r.delay * 1.2))

function drawOne(g: GL, it: FlowerItem, W: number, H: number, depth: number) {
  const { gl, loc } = g
  const spec = SPECS[it.kind]
  const seed = it.seed ?? 0
  const rot = mul(rotX(it.pitch), mul(rotZ(it.roll ?? 0), rotY(it.yaw)))
  gl.uniformMatrix3fv(loc.u_rot, false, rot)
  const sc = (2 * it.r) / H
  gl.uniform4f(loc.u_place, (it.x / W) * 2 - 1, 1 - (it.y / H) * 2, sc, W / H)
  gl.uniform2f(loc.u_depth, depth, 0.18)
  gl.uniform1f(loc.u_alpha, it.alpha ?? 1)
  const open = clamp01(it.open) * (it.kind === 'rose' ? 0.78 : 1)
  if ((it.bush ?? 0) > 0) {
    setPal(gl, loc, LEAF)
    for (let k = 0; k < it.bush!; k++) {
      const a = rnd(seed * 3 + k, 1)
      const depth = rnd(seed + k, 6)
      drawSurface(g, SH.leaf, [0.26 + 0.16 * rnd(seed + k, 2), 0.55, 0.05 + 0.4 * depth, -0.7 * rnd(seed + k, 7) + 0.2 * depth],
        [0.4 + 1.3 * a, 0.3 + 0.6 * rnd(k, 9), 0.5, -0.1], [k * 2.39996 + seed, 0, 0.5, 0], [0.4 + 0.6 * depth * rnd(k, 8), 0.25, 0.45, 0.05], seed + k)
    }
    return
  }
  // stem and leaves
  if ((it.stem ?? 0) > 0) {
    setPal(gl, loc, it.stemColor === 'wood' ? WOOD : GREEN)
    drawSurface(g, SH.stem, [it.stem!, spec.stemR, 0, -0.06], [0, it.stemBend ?? 0, 0, 0], [0, 0, 0, 0], [1, 0.2, 0, 0], seed)
    setPal(gl, loc, LEAF)
    const nl = it.leaves ?? 0
    for (let k = 0; k < nl; k++) {
      const d = it.stem! * (0.35 + 0.45 * (k / Math.max(1, nl)) + 0.08 * rnd(seed + k, 3))
      const bx = (it.stemBend ?? 0) * d * d
      const az = k * 2.4 + seed
      drawSurface(g, SH.leaf, [0.55 + 0.15 * rnd(seed + k, 4), 0.55, spec.stemR, -d], [1.15 + 0.3 * rnd(k, 5), 0.5, 0.35, -0.1], [az, 0, 0.5, 0], [0.95, 0.35, 0.35, 0.05], seed + k)
      void bx
    }
  }
  // receptacle
  setPal(gl, loc, GREEN)
  drawSurface(g, SH.sphere, [0.07, 0.075 + spec.stemR, 0, -0.07], [0, 0, 0, 0], [0, 0, 0, 0], [0.9, 0.2, 0, 0], seed)
  const pal = palette(it.kind, it.color)
  const budK = spec.bud
  // centre (disc, pod, stamens) shows as the flower opens
  if (spec.center && open > 0.15) {
    const c = spec.center
    const cg = smooth((open - 0.15) / 0.6)
    if (c.kind === 'stamens') {
      gl.uniform3fv(loc.u_base, [0.95, 0.6, 0.7]); gl.uniform3fv(loc.u_mid, [0.98, 0.85, 0.85]); gl.uniform3fv(loc.u_tip, [0.95, 0.75, 0.2])
      gl.uniform3fv(loc.u_back, [0.9, 0.7, 0.7]); gl.uniform3fv(loc.u_heart, [0.7, 0.2, 0.3])
      const n = c.n ?? 16
      for (let k = 0; k < n; k++) {
        drawSurface(g, SH.stamen, [c.r * (0.8 + 0.4 * rnd(k, 8)) * cg, 0.5, 0.01, 0], [0.25 + 0.35 * rnd(k, 9), 0.3, 0, 0], [(k / n) * 6.283 + rnd(k, 10), 0, 0, 0], [0.9, 0.1, 0.5, 0.6], k)
      }
    } else {
      gl.uniform3fv(loc.u_heart, c.kind === 'pod' ? [0.85, 0.75, 0.2] : pal.heart)
      gl.uniform3fv(loc.u_mid, c.kind === 'pod' ? [0.6, 0.7, 0.2] : [0.35, 0.22, 0.06])
      drawSurface(g, SH.disc, [0, c.r * lerp(0.6, 1, cg), 0, c.y], [c.kind === 'pod' ? 0.05 : 0.04, 0, 0, 0], [0, 0, 0, 0], [0.9, 0.1, 0, 0], seed)
      if (c.kind === 'pod') {
        // a fringe of golden stamens round the pod
        gl.uniform3fv(loc.u_base, [0.95, 0.8, 0.3]); gl.uniform3fv(loc.u_mid, [1, 0.85, 0.35]); gl.uniform3fv(loc.u_tip, [1, 0.9, 0.5])
        for (let k = 0; k < 28; k++) drawSurface(g, SH.stamen, [0.14 * cg, 0.6, c.r * 0.95, c.y - 0.03], [0.6 + 0.4 * rnd(k, 11), 0.5, 0, 0], [(k / 28) * 6.283, 0, 0, 0], [0.85, 0.1, 0.4, 0.3], k)
      }
    }
  }
  spec.rings.forEach((rg, ri) => {
    const o = ringOpen(rg, open)
    setPal(gl, loc, rg.green ? GREEN : pal)
    const lenK = rg.green ? 1 : lerp(budK + (1 - budK) * (ri / spec.rings.length) * 0.3, 1, o)
    for (let j = 0; j < rg.n; j++) {
      const jit = (rg.jitter ?? 0.04) * (rnd(seed * 13 + ri * 31 + j, 1) - 0.5) * 2
      const az = (rg.az ?? 0) + (j * Math.PI * 2) / rg.n + jit * 0.5 + (rg.green ? 0 : (1 - o) * 0.35)
      const th = lerp(rg.th[0], rg.th[1], o) * (1 + jit)
      const ps = seed * 7 + ri * 17 + j
      drawSurface(g, rg.shape,
        [rg.len * lenK * (1 + jit * 0.6), rg.wid * (rg.green ? 1 : lerp(0.92, 1, o)), rg.r0, rg.lift ?? 0],
        [th, lerp(rg.bend[0], rg.bend[1], o), lerp(rg.cup[0], rg.cup[1], o), lerp(rg.curl[0], rg.curl[1], o) * (1 + jit)],
        [az, (rg.roll ?? 0) * o, rg.ruffle ?? 0, 0],
        [rg.ao * (rg.green ? 0.85 : 1), rg.green ? 0.3 : spec.sheen, rg.green ? 0.3 : spec.trans, rg.green ? 0 : spec.tipLight], ps)
    }
  })
}

const last = { w: 2, h: 2 }
/** Copies the picture the last renderFlowers call made (top-left W × H of its canvas) onto a 2D canvas. */
export function drawRendered(c: Ctx2, cv: Canvas, dx: number, dy: number, dw: number, dh: number) {
  c.drawImage(cv, 0, 0, last.w, last.h, dx, dy, dw, dh)
}

/**
 * Draws flowers into a transparent W × H picture (back to front, in the order given) and returns the GL canvas,
 * valid until the next call. Null when WebGL is missing.
 */
export function renderFlowers(items: FlowerItem[], W: number, H: number, light: [number, number, number] = [-0.45, 0.75, 0.55]): Canvas | null {
  const g = get()
  if (!g) return null
  const { gl, cv, loc } = g
  W = Math.max(2, Math.min(4096, Math.round(W))); H = Math.max(2, Math.min(4096, Math.round(H)))
  // the canvas only ever grows (resizing a GL canvas is slow); the picture sits in its top-left corner
  if (cv.width < W || cv.height < H) { cv.width = Math.max(cv.width, W); cv.height = Math.max(cv.height, H) }
  gl.viewport(0, cv.height - H, W, H)
  last.w = W; last.h = H
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.useProgram(g.prog)
  gl.bindBuffer(gl.ARRAY_BUFFER, g.petal.buf)
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.petal.idx)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enable(gl.DEPTH_TEST)
  gl.depthFunc(gl.LEQUAL)
  gl.disable(gl.CULL_FACE)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.uniform3fv(loc.u_light, light)
  for (const it of items) {
    gl.clear(gl.DEPTH_BUFFER_BIT)
    drawOne(g, it, W, H, 0)
  }
  return cv
}

/** Draws flowers straight onto a 2D canvas (through the GL canvas). False when WebGL is missing. */
export function paintFlowers(c: Ctx2, items: FlowerItem[], W: number, H: number, light?: [number, number, number]): boolean {
  const cv = renderFlowers(items, W, H, light)
  if (!cv) return false
  drawRendered(c, cv, 0, 0, W, H)
  return true
}

// ---------- loose petals (tumbling sprites) ----------
export const PETAL_FRAMES = 12
const atlases = new Map<string, Canvas | null>()
/**
 * PETAL_FRAMES pictures of one loose petal turning over (a full tumble), each S × S, side by side; the petal's
 * base is at the bottom centre. Null when WebGL is missing.
 */
export function petalAtlas(kind: FlowerKind, color: string | null, S: number): Canvas | null {
  S = Math.max(32, Math.min(256, 1 << Math.ceil(Math.log2(S))))
  const key = `${kind}|${color ?? ''}|${S}`
  if (atlases.has(key)) return atlases.get(key)!
  const g = get()
  if (!g) { atlases.set(key, null); return null }
  const spec = SPECS[kind]
  const ring = spec.rings.find((r) => !r.green)!
  const out = makeCanvas(S * PETAL_FRAMES, S)
  const oc = out.getContext('2d') as Ctx2 | null
  if (!oc) return null
  const { gl, loc } = g
  const pal = palette(kind, color)
  const lenUnit = 1 / (ring.len * 1.25)
  for (let f = 0; f < PETAL_FRAMES; f++) {
    const cv = renderFlowers([], S, S)
    if (!cv) return null
    const a = (f / PETAL_FRAMES) * Math.PI * 2
    // tumble about the petal's long axis, with a little nod
    const rot = mul(rotX(0.35 * Math.sin(a)), rotY(a))
    gl.uniformMatrix3fv(loc.u_rot, false, rot)
    gl.uniform4f(loc.u_place, 0, -0.62, 2 * lenUnit * 0.62, 1)
    gl.uniform2f(loc.u_depth, 0, 0.1)
    gl.uniform1f(loc.u_alpha, 1)
    setPal(gl, loc, pal)
    // a loose petal: a gentle cup, the tip a little rolled, lying flat (no tilt)
    drawSurface(g, ring.shape, [ring.len, ring.wid, 0, 0], [0, 0.25, lerp(ring.cup[0], ring.cup[1], 0.6) * 0.7, ring.curl[1] * 0.6], [0, (ring.roll ?? 0) * 0.6, ring.ruffle ?? 0, 0],
      [1, spec.sheen, spec.trans, spec.tipLight], 3 + f * 0.01)
    drawRendered(oc, cv, f * S, 0, S, S)
  }
  if (atlases.size > 30) atlases.clear()
  atlases.set(key, out)
  return out
}

const softs = new Map<Canvas, Canvas>()
/** The same tumbling petal, out of focus (near the camera). */
function softAtlas(kind: FlowerKind, color: string | null, S: number): Canvas | null {
  const at = petalAtlas(kind, color, S)
  if (!at) return null
  let sf = softs.get(at)
  if (!sf) {
    sf = makeCanvas(at.width, at.height)
    const sc = sf.getContext('2d') as Ctx2
    const px = at.height * 0.045
    if ('filter' in (sc as object)) { sc.filter = `blur(${px.toFixed(1)}px)`; sc.drawImage(at, 0, 0); sc.filter = 'none' } else {
      const sm = makeCanvas(Math.max(2, at.width >> 2), Math.max(2, at.height >> 2))
      ;(sm.getContext('2d') as Ctx2).drawImage(at, 0, 0, sm.width, sm.height)
      sc.drawImage(sm, 0, 0, at.width, at.height)
    }
    if (softs.size > 30) softs.clear()
    softs.set(at, sf)
  }
  return sf
}

/**
 * Draws a loose petal centred at 0,0 of the current transform, `size` px long, at tumble phase `phase` (radians).
 * False when WebGL is missing.
 */
export function drawPetalSprite(c: Ctx2, kind: FlowerKind, color: string | null, size: number, phase: number, soft = false): boolean {
  const at = soft ? softAtlas(kind, color, size * 1.4) : petalAtlas(kind, color, size * 1.4)
  if (!at) return false
  const S = at.height
  const f = ((Math.floor((phase / (Math.PI * 2)) * PETAL_FRAMES) % PETAL_FRAMES) + PETAL_FRAMES) % PETAL_FRAMES
  c.drawImage(at, f * S, 0, S, S, -size / 2, -size / 2, size, size)
  return true
}
