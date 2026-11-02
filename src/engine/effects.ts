/**
 * Video effects run on the GPU after the colour grade, the same for preview and export. Each entry is a GLSL body
 * that returns a colour, using src(uv) (the graded picture), uv (0..1, y up), t (seconds into the clip),
 * a (amount 0..1), ratio (width/height), and the helpers luma, rnd, noise, blurAt and screen.
 */
export interface EffectDef { id: string; name: string; group: string; glsl: string; amount?: boolean /* false: no strength slider */ }

// sparkles, bokeh, snow… : soft dots on a grid of cells that drifts, one random dot per lit cell
const dots = (o: { scale: number; layers: number; drift: string; keep: number; dot: string; color: string; strength: string }) => `
  vec3 acc = vec3(0.0);
  for (int L = 0; L < ${o.layers}; L++) {
    float fl = float(L);
    float sc = ${o.scale.toFixed(1)} + fl * ${(o.scale * 0.6).toFixed(1)};
    vec2 p = uv * vec2(ratio, 1.0) * sc;
    p += ${o.drift} * sc;
    vec2 id = floor(p);
    vec2 f = fract(p) - 0.5;
    float h = rnd(id + fl * 7.31);
    if (h > ${o.keep.toFixed(2)}) {
      vec2 g = f - (vec2(rnd(id + 1.3), rnd(id + 2.7)) - 0.5) * 0.5;
      float d = length(g);
      float k = rnd(id + 4.1);
      float v = ${o.dot};
      acc += ${o.color} * v * (${o.strength});
    }
  }
  vec4 c = src(uv);
  c.rgb = screen(c.rgb, clamp(acc * a, 0.0, 1.0));
  return c;`

// ---- art styles, beauty and frames

/** Sobel edge strength of the picture's brightness into `e_`, sampled `k` picture heights apart. */
const edges = (k: number) => `float e_ = 0.0; { vec2 px = vec2(${k.toFixed(4)} / ratio, ${k.toFixed(4)});
    float tl = luma(src(uv + vec2(-px.x, px.y)).rgb), tc = luma(src(uv + vec2(0.0, px.y)).rgb), tr = luma(src(uv + px).rgb);
    float ml = luma(src(uv - vec2(px.x, 0.0)).rgb), mr = luma(src(uv + vec2(px.x, 0.0)).rgb);
    float bl = luma(src(uv - px).rgb), bc = luma(src(uv - vec2(0.0, px.y)).rgb), br = luma(src(uv + vec2(px.x, -px.y)).rgb);
    float gx = tr + 2.0 * mr + br - tl - 2.0 * ml - bl, gy = tl + 2.0 * tc + tr - bl - 2.0 * bc - br;
    e_ = length(vec2(gx, gy)); }`

/** Signed distance from point `p` to a box of half size `b` with round corners `r` (all in the same units). */
const rbox = (p: string, b: string, r: string) =>
  `(length(max(abs(${p}) - (${b}) + (${r}), 0.0)) + min(max(abs(${p}).x - (${b}).x + (${r}), abs(${p}).y - (${b}).y + (${r})), 0.0) - (${r}))`

/** Where to read the picture so it fills a window of local position `lq` (0..1) and width/height `r2`, cropping the overflow. */
const coverAt = (lq: string, r2: string) =>
  `(${r2} > ratio ? vec2(${lq}.x, 0.5 + (${lq}.y - 0.5) * ratio / ${r2}) : vec2(0.5 + (${lq}.x - 0.5) * ${r2} / ratio, ${lq}.y))`

/** Smooths skin only: a blur that skips across edges (bilateral), kept to skin colours (YCbCr range). */
const skinSmooth = `vec4 c = src(uv);
    vec3 acc = c.rgb; float wsum = 1.0;
    for (int i = 0; i < 20; i++) {
      float fi = float(i); float an = fi * 2.39996; float d = sqrt((fi + 0.5) / 20.0) * 0.009;
      vec3 s = src(uv + vec2(cos(an) * d / ratio, sin(an) * d)).rgb;
      float w = exp(-dot(s - c.rgb, s - c.rgb) * 90.0);
      acc += s * w; wsum += w;
    }
    vec3 smooth_ = acc / wsum;
    float cb = 128.0 - 37.8 * c.r - 74.2 * c.g + 112.0 * c.b, cr = 128.0 + 112.0 * c.r - 93.8 * c.g - 18.2 * c.b;
    float skin = smoothstep(70.0, 82.0, cb) * smoothstep(132.0, 120.0, cb) * smoothstep(128.0, 138.0, cr) * smoothstep(180.0, 168.0, cr);`

const MORE_EFFECTS: [string, string, string, string, boolean?][] = [
  ['cartoon', 'Cartoon', 'Art', `vec4 c = src(uv);
    vec3 sm = mix(c.rgb, blurAt(uv, 0.005), 0.75);
    ${edges(0.0018)}
    // flat colour areas: steps of brightness, the colour itself kept (stepping each channel makes colour bands)
    float l = luma(sm); vec3 q = sm * (floor(l * 5.0 + 0.5) / 5.0 + 0.06) / max(l, 0.04);
    q = mix(vec3(luma(q)), q, 1.25);
    vec3 o = q * (1.0 - smoothstep(0.18, 0.4, e_) * 0.92);
    return vec4(mix(c.rgb, clamp(o, 0.0, 1.0), a), c.a);`],
  ['anime', 'Anime', 'Art', `vec4 c = src(uv);
    vec3 sm = mix(c.rgb, blurAt(uv, 0.007), 0.8);
    ${edges(0.0014)}
    float l = luma(sm);
    vec3 q = mix(vec3(l), sm, 1.45);
    float band = floor(l * 4.0 + 0.5) / 4.0; q *= mix(1.0, band / max(l, 0.05), 0.55);
    q = mix(q, q * vec3(0.95, 1.0, 1.1) + 0.04, 0.5);
    vec3 o = q * (1.0 - smoothstep(0.22, 0.45, e_) * 0.8);
    return vec4(mix(c.rgb, clamp(o, 0.0, 1.0), a), c.a);`],
  ['sketch', 'Pencil sketch', 'Art', `vec4 c = src(uv);
    float g = luma(c.rgb); float bg = luma(blurAt(uv, 0.006));
    float s = clamp(g / max(bg, 0.02), 0.0, 1.0); s = pow(s, 3.0);
    float paper = 0.96 - noise(uv * vec2(ratio, 1.0) * 300.0) * 0.05;
    float hatch = 1.0 - 0.12 * step(0.5, fract((uv.x * ratio + uv.y) * 160.0)) * smoothstep(0.6, 0.2, g);
    vec3 o = vec3(s * paper * hatch) * vec3(1.0, 0.98, 0.94);
    return vec4(mix(c.rgb, o, a), c.a);`],
  ['comic', 'Comic', 'Art', `vec4 c = src(uv);
    ${edges(0.0022)}
    vec3 sm = mix(c.rgb, blurAt(uv, 0.004), 0.6); float l = luma(sm);
    vec3 q = sm * (floor(l * 4.0 + 0.5) / 4.0 + 0.08) / max(l, 0.04);
    q = mix(vec3(luma(q)), q, 1.5);
    // halftone dots, bigger where it is darker, on a grid turned 45 degrees
    vec2 p = uv * vec2(ratio, 1.0) * 110.0; p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
    float r = sqrt(clamp(1.0 - luma(c.rgb), 0.0, 1.0)) * 0.55;
    float dotm = smoothstep(r + 0.08, r - 0.08, length(fract(p) - 0.5));
    q *= 1.0 - dotm * 0.35;
    vec3 o = q * (1.0 - smoothstep(0.25, 0.5, e_));
    return vec4(mix(c.rgb, clamp(o, 0.0, 1.0), a), c.a);`],
  ['oilpaint', 'Oil paint', 'Art', `vec4 c = src(uv);
    // Kuwahara: of the four squares round the pixel, take the calmest one's average colour
    vec2 px = vec2(0.0025 / ratio, 0.0025);
    vec3 best = c.rgb; float bv = 1e9;
    for (int k = 0; k < 4; k++) {
      vec2 dir = vec2(k == 0 || k == 2 ? -1.0 : 1.0, k < 2 ? -1.0 : 1.0);
      vec3 m = vec3(0.0), m2 = vec3(0.0);
      for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
        vec3 s = src(uv + dir * vec2(float(i), float(j)) * px).rgb; m += s; m2 += s * s;
      }
      m /= 9.0; vec3 v = m2 / 9.0 - m * m; float vs = v.r + v.g + v.b;
      if (vs < bv) { bv = vs; best = m; }
    }
    best = mix(vec3(luma(best)), best, 1.15);
    return vec4(mix(c.rgb, best, a), c.a);`],

  ['smoothskin', 'Smooth skin', 'Beauty', `${skinSmooth}
    vec3 o = mix(c.rgb, smooth_, skin * 0.9);
    o = mix(o, o * 1.04 + 0.015, skin * 0.6);
    return vec4(mix(c.rgb, o, a), c.a);`],
  ['beautyglow', 'Beauty glow', 'Beauty', `${skinSmooth}
    vec3 o = mix(c.rgb, smooth_, skin * 0.85);
    o = screen(o, max(blurAt(uv, 0.02) - 0.45, 0.0) * 0.9);
    o = o * vec3(1.03, 1.0, 0.98) + 0.03;
    return vec4(mix(c.rgb, clamp(o, 0.0, 1.0), a), c.a);`],
  ['enhance', 'Enhance (sharper, clearer)', 'Beauty', `vec4 c = src(uv);
    vec3 fine = c.rgb - blurAt(uv, 0.0018);
    vec3 local = c.rgb - blurAt(uv, 0.02);
    vec3 o = c.rgb + fine * 0.9 * a + local * 0.45 * a;
    o = mix(vec3(luma(o)), o, 1.0 + 0.15 * a);
    return vec4(clamp(o, 0.0, 1.0), c.a);`],

  ['polaroid', 'Polaroid', 'Frame', `vec2 lo = vec2(0.05 / ratio, 0.2), hi = vec2(1.0 - 0.05 / ratio, 0.95);
    vec2 lq = (uv - lo) / (hi - lo); float r2 = (hi.x - lo.x) * ratio / (hi.y - lo.y);
    if (lq.x >= 0.0 && lq.y >= 0.0 && lq.x <= 1.0 && lq.y <= 1.0) {
      vec3 c = src(${coverAt('lq', 'r2')}).rgb;
      float edge = min(min(lq.x * r2, (1.0 - lq.x) * r2), min(lq.y, 1.0 - lq.y));
      return vec4(c * (0.82 + 0.18 * smoothstep(0.0, 0.03, edge)), 1.0);
    }
    float n = noise(uv * vec2(ratio, 1.0) * 220.0);
    return vec4(vec3(0.97, 0.96, 0.93) - n * 0.035, 1.0);`, false],
  ['filmstrip', 'Film strip', 'Frame', `float b = 0.13;
    vec2 lo = vec2(0.0, b), hi = vec2(1.0, 1.0 - b);
    vec2 lq = (uv - lo) / (hi - lo); float r2 = ratio / (1.0 - 2.0 * b);
    if (lq.y >= 0.0 && lq.y <= 1.0) {
      return vec4(src(${coverAt('lq', 'r2')}).rgb, 1.0);
    }
    float yb = uv.y < 0.5 ? uv.y : 1.0 - uv.y;
    vec2 hp = vec2((fract(uv.x * ratio / 0.075) - 0.5) * 0.075, yb - b * 0.5);
    float hole = ${rbox('hp', 'vec2(0.018, 0.024)', '0.006')};
    vec3 base = vec3(0.07, 0.055, 0.04) + noise(uv * 400.0) * 0.03;
    return vec4(hole < 0.0 ? vec3(0.93, 0.91, 0.86) : base, 1.0);`, false],
  ['phone', 'Phone', 'Frame', `vec2 P = (uv - 0.5) * vec2(ratio, 1.0);
    float H = min(0.92, ratio * 0.92 * 19.5 / 9.0 / 1.1); vec2 hb = vec2(H * 9.0 / 19.5, H) * 0.5;
    vec2 hs = hb - vec2(0.012);
    float scr = ${rbox('P', 'hs', '0.045 * H')};
    float body = ${rbox('P', 'hb', '0.055 * H')};
    if (scr < 0.0) {
      vec2 lq = (P + hs) / (2.0 * hs); float r2 = hs.x / hs.y;
      vec2 np = P - vec2(0.0, hs.y - 0.03 * H);
      float notch = ${rbox('np', 'vec2(0.11 * hb.x * 2.0, 0.012 * H)', '0.012 * H')};
      return notch < 0.0 ? vec4(0.0, 0.0, 0.0, 1.0) : vec4(src(${coverAt('lq', 'r2')}).rgb, 1.0);
    }
    if (body < 0.0) return vec4(vec3(0.07) + 0.12 * smoothstep(-0.004, 0.0, body), 1.0);
    vec3 bg = blurAt(uv, 0.05) * 0.35;
    float sh = smoothstep(0.0, 0.04, body);
    return vec4(bg * (0.4 + 0.6 * sh), 1.0);`, false],
  ['camrec', 'Camera REC', 'Frame', `vec4 c = src(uv);
    vec2 S = vec2(ratio, 1.0); vec2 P = uv * S;
    float m = 0.06, L = 0.07, w = 0.005;
    vec2 d = min(P, S - P);
    float br = max(step(abs(d.x - m), w) * step(m - w, d.y) * step(d.y, m + L), step(abs(d.y - m), w) * step(m - w, d.x) * step(d.x, m + L));
    vec2 dp = P - vec2(m + 0.04, 1.0 - m - 0.04);
    float rec = smoothstep(0.019, 0.015, length(dp)) * step(0.45, fract(t * 0.9));
    vec2 bp = P - vec2(ratio - m - 0.13, 1.0 - m - 0.04);
    float bo = ${rbox('bp', 'vec2(0.032, 0.015)', '0.003')};
    vec2 cp = bp - vec2(0.036, 0.0);
    float batt = step(abs(bo), 0.0028) + step(bo, -0.0065) * step(bp.x, 0.012) + step(abs(cp.x), 0.003) * step(abs(cp.y), 0.006);
    vec2 xp = P - S * 0.5;
    float xh = step(abs(xp.x), 0.0022) * step(abs(xp.y), 0.025) + step(abs(xp.y), 0.0022) * step(abs(xp.x), 0.025);
    c.rgb *= 1.0 - smoothstep(0.45, 1.1, length((uv - 0.5) * S) / max(ratio, 1.0) * 1.4) * 0.35;
    c.rgb = mix(c.rgb, vec3(1.0), clamp(br + batt + xh, 0.0, 1.0) * 0.92);
    c.rgb = mix(c.rgb, vec3(1.0, 0.12, 0.1), rec);
    return c;`, false],
]

const E: [string, string, string, string, boolean?][] = [
  // id, name, group, glsl, has amount slider (default yes)
  ['glow', 'Dreamy glow', 'Dreamy', `vec4 c = src(uv);
    vec3 b = blurAt(uv, 0.02 + 0.03 * a);
    c.rgb = screen(c.rgb, max(b - 0.4, 0.0) * 1.6 * a);
    return c;`],
  ['softfocus', 'Soft focus', 'Dreamy', `vec4 c = src(uv);
    vec3 b = blurAt(uv, 0.012 + 0.02 * a);
    c.rgb = mix(c.rgb, mix(b, screen(c.rgb, b), 0.45), 0.7 * a);
    return c;`],
  ['whiteedge', 'White edges', 'Dreamy', `vec4 c = src(uv);
    vec2 q = (uv - 0.5) * vec2(ratio, 1.0) / max(ratio, 1.0);
    float v = smoothstep(0.22, 0.75, length(q) * 1.1);
    c.rgb = mix(c.rgb, mix(blurAt(uv, 0.03), vec3(1.0), 0.65), v * a);
    return c;`],
  ['heart', 'Heart frame', 'Dreamy', `vec4 c = src(uv);
    // heart distance (Inigo Quilez), point at y = 0, top near 1.1
    float s = min(0.8, ratio * 0.72);
    vec2 p = (uv - 0.5) * vec2(ratio, 1.0) / s + vec2(0.0, 0.52);
    p.x = abs(p.x);
    float d;
    if (p.y + p.x > 1.0) d = length(p - vec2(0.25, 0.75)) - 0.35355;
    else {
      vec2 e = p - 0.5 * max(p.x + p.y, 0.0);
      vec2 f = p - vec2(0.0, 1.0);
      d = sqrt(min(dot(f, f), dot(e, e))) * sign(p.x - p.y);
    }
    float m = smoothstep(-0.01, 0.07, d);
    vec3 o = mix(blurAt(uv, 0.03), vec3(1.0, 0.86, 0.9), 0.6);
    c.rgb = mix(c.rgb, o, m * a);
    return c;`],
  ['blur', 'Blur', 'Dreamy', 'vec4 c = src(uv); c.rgb = blurAt(uv, 0.004 + 0.035 * a); return c;'],

  ['lightleak', 'Light leak', 'Light', `vec4 c = src(uv);
    vec2 p = uv * vec2(ratio, 1.0);
    float m = smoothstep(0.95, 0.0, distance(p, vec2(ratio * (0.08 + 0.1 * sin(t * 0.5)), 0.85 + 0.12 * cos(t * 0.4))));
    m += 0.8 * smoothstep(0.85, 0.0, distance(p, vec2(ratio * (0.96 + 0.05 * cos(t * 0.3)), 0.15 + 0.2 * sin(t * 0.6))));
    m *= 0.55 + 0.45 * noise(p * 2.5 + t * 0.35);
    vec3 col = mix(vec3(1.0, 0.3, 0.08), vec3(1.0, 0.8, 0.35), uv.y);
    c.rgb = screen(c.rgb, col * clamp(m, 0.0, 1.0) * a);
    return c;`],
  ['rays', 'Light rays', 'Light', `vec4 c = src(uv);
    vec2 d = uv - vec2(0.18, 1.15);
    d.x *= ratio;
    float an = atan(d.y, d.x);
    float r = pow(0.5 + 0.5 * sin(an * 23.0 + t * 0.7) * sin(an * 11.0 - t * 0.45), 3.0);
    float fall = smoothstep(1.7, 0.0, length(d));
    c.rgb = screen(c.rgb, vec3(1.0, 0.92, 0.72) * r * fall * a * 0.7);
    return c;`],
  ['bokeh', 'Bokeh lights', 'Light', dots({
    scale: 4, layers: 3, drift: 'vec2(sin(t * 0.2 + fl) * 0.05, -t * (0.05 + fl * 0.03))', keep: 0.5,
    dot: 'smoothstep(0.1 + 0.18 * k, 0.07 + 0.13 * k, d)', color: 'mix(vec3(1.0, 0.78, 0.45), vec3(1.0, 0.55, 0.75), rnd(id + 9.0))',
    strength: '(0.65 + 0.35 * sin(t * 1.5 + h * 30.0)) * (0.55 - fl * 0.12)',
  })],
  ['sparkle', 'Sparkles', 'Light', dots({
    scale: 6, layers: 2, drift: 'vec2(0.0, -t * 0.02)', keep: 0.72,
    dot: 'smoothstep(0.06, 0.0, d) + max(0.0, 1.0 - abs(g.x) * 30.0) * max(0.0, 1.0 - abs(g.y) * 3.5) + max(0.0, 1.0 - abs(g.y) * 30.0) * max(0.0, 1.0 - abs(g.x) * 3.5)',
    color: 'vec3(1.0, 0.96, 0.85)', strength: 'pow(max(0.0, sin(t * 2.5 + h * 40.0)), 3.0)',
  })],
  ['golddust', 'Gold dust', 'Light', dots({
    scale: 14, layers: 3, drift: 'vec2(sin(t * 0.5 + fl * 2.0) * 0.03, t * (0.03 + fl * 0.015))', keep: 0.6,
    dot: 'smoothstep(0.09, 0.0, d)', color: 'mix(vec3(1.0, 0.8, 0.3), vec3(1.0, 0.95, 0.7), k)',
    strength: '0.6 + 0.4 * sin(t * 4.0 + h * 50.0)',
  })],
  ['snow', 'Snow', 'Light', dots({
    scale: 7, layers: 3, drift: 'vec2(sin(t * 0.8 + fl * 3.0) * 0.06, t * (0.12 + fl * 0.06))', keep: 0.45,
    dot: 'smoothstep(0.07 + 0.06 * k, 0.03, d)', color: 'vec3(1.0)', strength: '0.9 - fl * 0.2',
  })],

  ['oldfilm', 'Old film', 'Retro', `float fr = floor(t * 24.0);
    vec4 c = src(uv + vec2(0.0, (rnd(vec2(fr, 9.0)) - 0.5) * 0.004 * a));
    float l = luma(c.rgb);
    c.rgb = mix(c.rgb, vec3(l) * vec3(1.08, 0.97, 0.8), 0.85 * a);
    c.rgb *= 1.0 + (rnd(vec2(fr, 1.0)) - 0.5) * 0.18 * a;
    float sx = rnd(vec2(fr, 3.0));
    c.rgb = mix(c.rgb, vec3(0.92), smoothstep(0.0018, 0.0, abs(uv.x - sx)) * step(0.55, rnd(vec2(fr, 5.0))) * 0.6 * a);
    c.rgb = mix(c.rgb, vec3(0.08), step(0.9986, rnd(floor(uv * vec2(ratio, 1.0) * 260.0) + fr)) * a);
    vec2 q = uv - 0.5;
    c.rgb *= 1.0 - smoothstep(0.3, 0.75, length(q)) * 0.6 * a;
    return c;`],
  ['digicam', 'Digicam', 'Retro', `vec2 d = (uv - 0.5) * 0.008 * a;
    vec4 c = src(uv);
    c.r = src(uv + d).r;
    c.b = src(uv - d).b;
    // the small sensor: bright parts bloom, flat parts get coloured noise and a little banding
    c.rgb = screen(c.rgb, max(blurAt(uv, 0.012) - 0.62, 0.0) * 1.9 * a);
    float fr = floor(t * 15.0);
    c.rgb += (vec3(rnd(uv * 640.0 + fr), rnd(uv * 640.0 + fr + 3.1), rnd(uv * 640.0 + fr + 7.7)) - 0.5) * 0.09 * a;
    c.rgb = mix(c.rgb, floor(c.rgb * 28.0 + 0.5) / 28.0, 0.6 * a);
    vec2 q = uv - 0.5;
    c.rgb *= 1.0 - smoothstep(0.35, 0.8, length(q)) * 0.35 * a;
    return vec4(clamp(c.rgb, 0.0, 1.0), c.a);`],
  ['vhs', 'VHS', 'Retro', `float w = (noise(vec2(uv.y * 9.0, t * 5.0)) - 0.5) * 0.012 * a;
    float sh = 0.006 * a;
    vec4 c = src(uv + vec2(w, 0.0));
    c.r = src(uv + vec2(w + sh, 0.0)).r;
    c.b = src(uv + vec2(w - sh, 0.0)).b;
    c.rgb *= 1.0 - a * 0.18 * (0.5 + 0.5 * sin(uv.y / u_texel.y * 1.6));
    float band = smoothstep(0.04, 0.0, abs(fract(uv.y * 0.7 + t * 0.12) - 0.5));
    c.rgb += (rnd(uv * 600.0 + fract(t)) - 0.5) * (0.06 + 0.25 * band) * a;
    return c;`],
  ['rgbsplit', 'RGB split', 'Retro', `vec2 d = (uv - 0.5) * 0.025 * a;
    vec4 c = src(uv);
    c.r = src(uv + d).r;
    c.b = src(uv - d).b;
    return c;`],
  ['glitch', 'Glitch', 'Retro', `float tt = floor(t * 10.0);
    float on = step(0.5, rnd(vec2(tt, 0.0)));
    float row = floor(uv.y * 14.0);
    float off = (rnd(vec2(row, tt)) - 0.5) * 0.14 * a * on * step(0.55, rnd(vec2(row, tt + 3.0)));
    vec2 u2 = uv + vec2(off, 0.0);
    vec4 c = src(u2);
    c.r = src(u2 + vec2(0.012 * a * on, 0.0)).r;
    c.b = src(u2 - vec2(0.012 * a * on, 0.0)).b;
    return c;`],
  ['colorpop', 'Color pop (keep red)', 'Retro', `vec4 c = src(uv);
    float red = c.r - max(c.g, c.b);
    float keep = smoothstep(0.06, 0.2, red);
    c.rgb = mix(vec3(luma(c.rgb)), c.rgb, max(keep, 1.0 - a));
    return c;`],

  ['shake', 'Shake', 'Motion', `vec2 o = vec2(noise(vec2(t * 9.0, 1.0)), noise(vec2(t * 9.0, 7.0))) - 0.5;
    float z = 1.0 + 0.07 * a;
    return src((uv - 0.5) / z + 0.5 + o * 0.05 * a);`],
  ['heartbeat', 'Heartbeat zoom', 'Motion', `float b = fract(t * 1.1);
    float z = 1.0 + 0.09 * a * (exp(-b * 7.0) + 0.6 * exp(-max(b - 0.18, 0.0) * 9.0) * step(0.18, b));
    return src((uv - 0.5) / z + 0.5);`],
  ['flash', 'Flash beat', 'Motion', `vec4 c = src(uv);
    c.rgb += vec3(exp(-fract(t) * 9.0)) * 0.65 * a;
    return c;`],
  ['zoomblur', 'Zoom blur', 'Motion', `vec3 s = vec3(0.0);
    for (int i = 0; i < 14; i++) s += src((uv - 0.5) * (1.0 - float(i) * 0.008 * a) + 0.5).rgb;
    vec4 c = src(uv);
    c.rgb = s / 14.0;
    return c;`],

  ['letterbox', 'Cinema bars', 'Shape', `float bar = a * max((1.0 - ratio / 2.39) * 0.5, 0.07);
    if (uv.y < bar || uv.y > 1.0 - bar) return vec4(0.0, 0.0, 0.0, 1.0);
    return src(uv);`],
  ['mirror', 'Mirror', 'Shape', 'vec2 u2 = uv; if (u2.x > 0.5) u2.x = 1.0 - u2.x; return src(u2);', false],
  ['mirror4', 'Four mirror', 'Shape', 'vec2 u2 = uv * 2.0; u2 = mix(u2, 2.0 - u2, step(1.0, u2)); return src(u2);', false],
  ['kaleido', 'Kaleidoscope', 'Shape', `vec2 p = (uv - 0.5) * vec2(ratio, 1.0);
    float r = length(p);
    float seg = 6.2831853 / 6.0;
    float an = mod(atan(p.y, p.x) + t * 0.25 * a, seg);
    an = abs(an - seg * 0.5);
    p = vec2(cos(an), sin(an)) * r;
    return src(p / vec2(ratio, 1.0) + 0.5);`],
  ['bulge', 'Bulge', 'Shape', `vec2 p = uv - 0.5;
    float r = length(p * vec2(ratio, 1.0) / max(ratio, 1.0));
    p *= 1.0 - 0.45 * a * (1.0 - smoothstep(0.0, 0.5, r));
    return src(p + 0.5);`],
]

export const EFFECTS: EffectDef[] = [...E, ...MORE_EFFECTS].map(([id, name, group, glsl, amount]) => ({ id, name, group, glsl, amount: amount ?? true }))
export const EFFECT_GROUPS = [...new Set(EFFECTS.map((e) => e.group))]
export const effectById = (id: string | null | undefined) => (id ? EFFECTS.find((e) => e.id === id) ?? null : null)

/** What the GPU needs for one frame of an effect. */
export interface EffectFrame { id: string; amount: number; time: number }

/** The effect of a clip or overlay at `time` seconds into it, or null. */
export function effectFrame(o: { effect?: { id: string; amount: number } | null }, time: number): EffectFrame | null {
  const e = o.effect
  return e && effectById(e.id) ? { id: e.id, amount: e.amount, time } : null
}

export const effectShader = (body: string) => `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_time;
uniform float u_amt;
uniform float u_ratio;
vec4 src(vec2 uv) { return texture2D(u_tex, clamp(uv, 0.0, 1.0)); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rnd(i), rnd(i + vec2(1.0, 0.0)), f.x), mix(rnd(i + vec2(0.0, 1.0)), rnd(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 screen(vec3 c, vec3 l) { return 1.0 - (1.0 - c) * (1.0 - l); }
// soft disc blur, r in picture heights
vec3 blurAt(vec2 uv, float r) {
  vec3 s = src(uv).rgb;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    float an = fi * 2.39996;
    float d = sqrt((fi + 0.5) / 24.0) * r;
    s += src(uv + vec2(cos(an) * d / u_ratio, sin(an) * d)).rgb;
  }
  return s / 25.0;
}
vec4 effect(vec2 uv, float t, float a, float ratio) { ${body} }
void main() { gl_FragColor = effect(v_uv, u_time, clamp(u_amt, 0.0, 1.0), u_ratio); }`
