import type { ColorParams } from './filters'
import { TRANSITIONS } from './transitions'
import { EFFECTS, effectShader, type EffectFrame } from './effects'

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() { v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`

const GRADE = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform vec4 u_a; // exposure brightness contrast saturation
uniform vec4 u_b; // vibrance temperature tint hue(rad)
uniform vec4 u_c; // highlights shadows fade vignette
uniform vec4 u_d; // grain sharpen mono sepia
uniform vec4 u_splitS; // shadow tint rgb, amount
uniform vec3 u_splitH;
uniform vec4 u_duoD; // dark rgb, amount
uniform vec3 u_duoL;
uniform vec4 u_key; // key rgb, enabled
uniform vec2 u_keyP; // similarity, smoothness
uniform vec2 u_keyQ; // spill, shrink radius in texels
uniform float u_seed;
uniform float u_ratio;
uniform sampler2D u_curve; // 256 x 1: R, G, B curves (master already in)
uniform float u_curveOn;
uniform vec3 u_hsl[8]; // per colour band: hue shift, saturation, lightness
uniform vec2 u_hslC[8]; // band centre and half width, degrees
uniform float u_hslOn;
uniform sampler2D u_lut; // (n*n) x n atlas, blue slices side by side
uniform vec3 u_lutP; // size, amount, on

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 chroma(vec3 c) { return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }
// 0 = screen colour, 1 = keep. Compared with the key at the pixel's own saturation (down to 70%), so
// darker, shadowed parts of the screen still go. Same maths as keyDistance() in chromakey.ts.
float keyMask(vec3 c) {
  vec2 kc = chroma(u_key.rgb);
  vec2 cc = chroma(c);
  float kl = max(length(kc), 1e-4);
  float d = distance(cc, kc * clamp(length(cc) / kl, 0.7, 1.0));
  return smoothstep(u_keyP.x, u_keyP.x + max(u_keyP.y, 0.001), d);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 lutAt(vec3 c) {
  float n = u_lutP.x;
  float b = c.b * (n - 1.0);
  float b0 = floor(b);
  float b1 = min(b0 + 1.0, n - 1.0);
  float x = (c.r * (n - 1.0) + 0.5) / (n * n);
  float y = (c.g * (n - 1.0) + 0.5) / n;
  return mix(texture2D(u_lut, vec2(x + b0 / n, y)).rgb, texture2D(u_lut, vec2(x + b1 / n, y)).rgb, b - b0);
}

void main() {
  vec4 src = texture2D(u_tex, v_uv);
  vec3 c = src.rgb;
  float alpha = src.a;
  float sharpen = u_d.y;
  if (sharpen != 0.0) {
    vec3 n = texture2D(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb + texture2D(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb
           + texture2D(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb + texture2D(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb;
    c += (c - n * 0.25) * sharpen * 2.0;
  }
  if (u_key.w > 0.5) {
    // matte from the centre and 8 neighbours: the min eats into the edge (shrink), the mean smooths jaggies
    float a0 = keyMask(c);
    vec2 r = u_texel * max(u_keyQ.y, 1.0);
    float n0 = keyMask(texture2D(u_tex, v_uv + vec2(r.x, 0.0)).rgb), n1 = keyMask(texture2D(u_tex, v_uv - vec2(r.x, 0.0)).rgb);
    float n2 = keyMask(texture2D(u_tex, v_uv + vec2(0.0, r.y)).rgb), n3 = keyMask(texture2D(u_tex, v_uv - vec2(0.0, r.y)).rgb);
    float n4 = keyMask(texture2D(u_tex, v_uv + r * 0.7071).rgb), n5 = keyMask(texture2D(u_tex, v_uv - r * 0.7071).rgb);
    float n6 = keyMask(texture2D(u_tex, v_uv + vec2(r.x, -r.y) * 0.7071).rgb), n7 = keyMask(texture2D(u_tex, v_uv + vec2(-r.x, r.y) * 0.7071).rgb);
    float lo = min(min(min(n0, n1), min(n2, n3)), min(min(n4, n5), min(n6, n7)));
    float mean = (a0 + n0 + n1 + n2 + n3 + n4 + n5 + n6 + n7) / 9.0;
    float a = u_keyQ.y > 0.0 ? min(a0, lo) : mix(a0, mean, 0.5);
    alpha *= a;
    // spill: take the screen colour's tint out (most at the see-through edges), keeping brightness
    vec2 kc = chroma(u_key.rgb);
    vec2 kd = kc / max(length(kc), 1e-4);
    vec2 cc = chroma(c);
    float along = max(dot(cc, kd), 0.0);
    cc -= kd * along * clamp(u_keyQ.x * (0.6 + 0.8 * (1.0 - a)), 0.0, 1.0);
    float y = luma(c);
    c = clamp(vec3(y + 1.402 * cc.y, y - 0.344 * cc.x - 0.714 * cc.y, y + 1.772 * cc.x), 0.0, 1.0);
  }
  c *= pow(2.0, u_a.x);
  c += u_a.y * 0.3;
  c.r += u_b.y * 0.12; c.b -= u_b.y * 0.12;
  c.g -= u_b.z * 0.1; c.r += u_b.z * 0.03; c.b += u_b.z * 0.03;
  c = (c - 0.5) * (1.0 + u_a.z) + 0.5;
  float l = luma(c);
  c += u_c.y * 0.3 * (1.0 - smoothstep(0.0, 0.55, l));
  c += u_c.x * 0.3 * smoothstep(0.45, 1.0, l);
  l = luma(c);
  c = mix(vec3(l), c, 1.0 + u_a.w);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  c = mix(vec3(luma(c)), c, 1.0 + u_b.x * (1.0 - (mx - mn)) * 1.5);
  if (u_b.w != 0.0) {
    mat3 toYIQ = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
    mat3 toRGB = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
    vec3 yiq = toYIQ * c;
    float cs = cos(u_b.w), sn = sin(u_b.w);
    yiq.yz = vec2(yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs);
    c = toRGB * yiq;
  }
  if (u_hslOn > 0.5) {
    vec3 hsv = rgb2hsv(clamp(c, 0.0, 1.0));
    float h = hsv.x * 360.0;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float d = abs(mod(h - u_hslC[i].x + 540.0, 360.0) - 180.0);
      acc += u_hsl[i] * max(0.0, 1.0 - d / u_hslC[i].y);
    }
    acc *= smoothstep(0.04, 0.2, hsv.y); // greys and whites keep their colour
    hsv.x = fract(hsv.x + acc.x * 30.0 / 360.0);
    hsv.y = clamp(hsv.y * (1.0 + acc.y), 0.0, 1.0);
    hsv.z = clamp(hsv.z * (1.0 + acc.z * 0.5), 0.0, 1.0);
    c = hsv2rgb(hsv);
  }
  l = clamp(luma(c), 0.0, 1.0);
  c = mix(c, vec3(l), clamp(u_d.z, 0.0, 1.0));
  vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, sep, clamp(u_d.w, 0.0, 1.0));
  c += ((u_splitS.rgb - 0.5) * (1.0 - l) + (u_splitH - 0.5) * l) * u_splitS.w * 0.7;
  c = mix(c, mix(u_duoD.rgb, u_duoL, l), clamp(u_duoD.w, 0.0, 1.0));
  c = u_c.z * 0.15 + c * (1.0 - u_c.z * 0.2);
  c = clamp(c, 0.0, 1.0);
  if (u_curveOn > 0.5) {
    vec3 k = c * (255.0 / 256.0) + 0.5 / 256.0;
    c = vec3(texture2D(u_curve, vec2(k.r, 0.5)).r, texture2D(u_curve, vec2(k.g, 0.5)).g, texture2D(u_curve, vec2(k.b, 0.5)).b);
  }
  if (u_lutP.z > 0.5) c = mix(c, lutAt(c), u_lutP.y);
  if (u_c.w > 0.0) {
    vec2 q = (v_uv - 0.5) * vec2(u_ratio, 1.0) / max(u_ratio, 1.0);
    c *= 1.0 - u_c.w * smoothstep(0.25, 0.75, length(q) * 1.1);
  }
  if (u_d.x > 0.0) c += (rnd(v_uv * 997.0 + u_seed) - 0.5) * u_d.x * 0.18;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), alpha);
}`

const mixShader = (body: string) => `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_from;
uniform sampler2D u_to;
uniform float u_p;
uniform float u_ratio;
uniform float u_seed;
float rnd(vec2 p) { return fract(sin(dot(p + u_seed * 0.0, vec2(12.9898, 78.233))) * 43758.5453); }
vec4 from(vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0, 0.0, 0.0, 1.0) : texture2D(u_from, uv); }
vec4 to(vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0, 0.0, 0.0, 1.0) : texture2D(u_to, uv); }
vec4 transition(vec2 uv, float p, float ratio) { ${body} }
void main() { gl_FragColor = transition(v_uv, clamp(u_p, 0.0, 1.0), u_ratio); }`

// HSL band centres and half widths (degrees): red, orange, yellow, green, aqua, blue, purple, magenta
const HSL_CENTRES = new Float32Array([0, 30, 30, 30, 60, 45, 120, 60, 180, 55, 230, 50, 275, 45, 315, 45])

export interface Chroma { color: [number, number, number]; similarity: number; smoothness: number; spill?: number; shrink?: number }

type GL = WebGLRenderingContext

function compile(gl: GL, vs: string, fs: string) {
  const prog = gl.createProgram()!
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]] as const) {
    const sh = gl.createShader(type)!
    gl.shaderSource(sh, src)
    gl.compileShader(sh)
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('Shader error: ' + gl.getShaderInfoLog(sh))
    gl.attachShader(prog, sh)
  }
  gl.bindAttribLocation(prog, 0, 'a_pos')
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Link error: ' + gl.getProgramInfoLog(prog))
  return prog
}

/** GPU colour grading, chroma key and transitions. Renders into its own canvas. */
export class Grader {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private gl: GL
  private grade: WebGLProgram
  private mixes = new Map<string, WebGLProgram>()
  private effects = new Map<string, WebGLProgram>()
  private srcTex: WebGLTexture[]
  private fbo: { fb: WebGLFramebuffer; tex: WebGLTexture }[] = []
  private w = 0
  private h = 0
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private dataTex = new Map<string, WebGLTexture>() // curve and LUT lookups by content key

  static create(canvas: HTMLCanvasElement | OffscreenCanvas): Grader | null {
    try {
      const gl = canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as GL | null
      return gl ? new Grader(canvas, gl) : null
    } catch {
      return null
    }
  }

  private constructor(canvas: HTMLCanvasElement | OffscreenCanvas, gl: GL) {
    this.canvas = canvas
    this.gl = gl
    this.grade = compile(gl, VERT, GRADE)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    this.srcTex = [this.texture(), this.texture()]
  }

  private texture() {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return
    this.w = w; this.h = h
    this.canvas.width = w; this.canvas.height = h
    const gl = this.gl
    for (const f of this.fbo) { gl.deleteFramebuffer(f.fb); gl.deleteTexture(f.tex) }
    this.fbo = [0, 1, 2].map(() => {
      const tex = this.texture()
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fb = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      return { fb, tex }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private loc(prog: WebGLProgram, name: string) {
    let m = this.uniforms.get(prog)
    if (!m) this.uniforms.set(prog, (m = new Map()))
    if (!m.has(name)) m.set(name, this.gl.getUniformLocation(prog, name))
    return m.get(name)!
  }

  private upload(i: number, src: TexImageSource) {
    const gl = this.gl
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex[i])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  }

  /** A lookup texture (curves, LUT) uploaded once per content key. */
  private lookup(key: string, w: number, h: number, data: Uint8Array) {
    let t = this.dataTex.get(key)
    if (!t) {
      const gl = this.gl
      if (this.dataTex.size > 24) { for (const x of this.dataTex.values()) gl.deleteTexture(x); this.dataTex.clear() }
      t = this.texture()
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
      this.dataTex.set(key, t)
    }
    return t
  }

  private runGrade(tex: WebGLTexture, p: ColorParams, target: WebGLFramebuffer | null, seed: number, chroma?: Chroma) {
    const gl = this.gl
    const prog = this.grade
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.viewport(0, 0, this.w, this.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const u = (n: string) => this.loc(prog, n)
    gl.uniform1i(u('u_tex'), 0)
    gl.uniform2f(u('u_texel'), 1 / this.w, 1 / this.h)
    gl.uniform4f(u('u_a'), p.exposure, p.brightness, p.contrast, p.saturation)
    gl.uniform4f(u('u_b'), p.vibrance, p.temperature, p.tint, (p.hue * Math.PI) / 180)
    gl.uniform4f(u('u_c'), p.highlights, p.shadows, p.fade, p.vignette)
    gl.uniform4f(u('u_d'), p.grain, p.sharpen, p.mono, p.sepia)
    gl.uniform4f(u('u_splitS'), ...p.splitShadow, p.split)
    gl.uniform3f(u('u_splitH'), ...p.splitHighlight)
    gl.uniform4f(u('u_duoD'), ...p.duoDark, p.duo)
    gl.uniform3f(u('u_duoL'), ...p.duoLight)
    gl.uniform4f(u('u_key'), ...(chroma?.color ?? [0, 1, 0]), chroma ? 1 : 0)
    gl.uniform2f(u('u_keyP'), chroma?.similarity ?? 0, chroma?.smoothness ?? 0)
    // shrink 1 = 6 px at 1080p, the same share of the picture at any size
    gl.uniform2f(u('u_keyQ'), chroma?.spill ?? 0.5, ((chroma?.shrink ?? 0) * Math.min(this.w, this.h)) / 180)
    gl.uniform1f(u('u_seed'), seed)
    gl.uniform1f(u('u_ratio'), this.w / this.h)
    const g = p.gpu
    gl.uniform1f(u('u_curveOn'), g?.curve ? 1 : 0)
    if (g?.curve) {
      gl.activeTexture(gl.TEXTURE2)
      gl.bindTexture(gl.TEXTURE_2D, this.lookup(`c:${g.curve.key}`, 256, 1, g.curve.data))
    }
    gl.uniform1i(u('u_curve'), 2)
    gl.uniform1f(u('u_hslOn'), g?.hsl ? 1 : 0)
    if (g?.hsl) {
      gl.uniform3fv(u('u_hsl'), g.hsl)
      gl.uniform2fv(u('u_hslC'), HSL_CENTRES)
    }
    gl.uniform3f(u('u_lutP'), g?.lut?.size ?? 2, g?.lut?.amount ?? 0, g?.lut ? 1 : 0)
    if (g?.lut) {
      gl.activeTexture(gl.TEXTURE3)
      gl.bindTexture(gl.TEXTURE_2D, this.lookup(`l:${g.lut.key}`, g.lut.size * g.lut.size, g.lut.size, g.lut.data))
    }
    gl.uniform1i(u('u_lut'), 3)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Runs a video effect over a texture into `target`. */
  private runEffect(tex: WebGLTexture, fx: EffectFrame, target: WebGLFramebuffer | null) {
    const gl = this.gl
    const prog = this.effectProgram(fx.id)
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target)
    gl.viewport(0, 0, this.w, this.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const u = (n: string) => this.loc(prog, n)
    gl.uniform1i(u('u_tex'), 0)
    gl.uniform2f(u('u_texel'), 1 / this.w, 1 / this.h)
    gl.uniform1f(u('u_time'), fx.time)
    gl.uniform1f(u('u_amt'), fx.amount)
    gl.uniform1f(u('u_ratio'), this.w / this.h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Grades a texture into `target`, with the video effect (if any) on top. */
  private gradeInto(tex: WebGLTexture, p: ColorParams, target: WebGLFramebuffer | null, seed: number, chroma?: Chroma, fx?: EffectFrame | null) {
    if (!fx) return this.runGrade(tex, p, target, seed, chroma)
    this.runGrade(tex, p, this.fbo[2].fb, seed, chroma)
    this.runEffect(this.fbo[2].tex, fx, target)
  }

  /** Grades one image into the canvas (sized to w x h), with an optional video effect. */
  drawGraded(src: TexImageSource, p: ColorParams, seed = 0, chroma?: Chroma, fx?: EffectFrame | null) {
    this.upload(0, src)
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gradeInto(this.srcTex[0], p, null, seed, chroma, fx)
  }

  /** Grades two images (each with its own video effect) and blends them with a transition. */
  drawTransition(a: TexImageSource, pa: ColorParams, b: TexImageSource, pb: ColorParams, type: string, progress: number, seed = 0, fxA?: EffectFrame | null, fxB?: EffectFrame | null) {
    const gl = this.gl
    this.upload(0, a)
    this.gradeInto(this.srcTex[0], pa, this.fbo[0].fb, seed, undefined, fxA)
    this.upload(1, b)
    this.gradeInto(this.srcTex[1], pb, this.fbo[1].fb, seed, undefined, fxB)
    const prog = this.mixProgram(type)
    gl.useProgram(prog)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.w, this.h)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fbo[0].tex)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.fbo[1].tex)
    gl.uniform1i(this.loc(prog, 'u_from'), 0)
    gl.uniform1i(this.loc(prog, 'u_to'), 1)
    gl.uniform1f(this.loc(prog, 'u_p'), progress)
    gl.uniform1f(this.loc(prog, 'u_ratio'), this.w / this.h)
    gl.uniform1f(this.loc(prog, 'u_seed'), seed)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
  }

  private effectProgram(id: string) {
    let p = this.effects.get(id)
    if (!p) {
      const def = EFFECTS.find((e) => e.id === id) ?? EFFECTS[0]
      p = compile(this.gl, VERT, effectShader(def.glsl))
      this.effects.set(id, p)
    }
    return p
  }

  private mixProgram(type: string) {
    let p = this.mixes.get(type)
    if (!p) {
      const def = TRANSITIONS.find((t) => t.id === type) ?? TRANSITIONS[0]
      p = compile(this.gl, VERT, mixShader(def.glsl))
      this.mixes.set(type, p)
    }
    return p
  }

  /** Compiles every transition (used by tests to catch shader errors). */
  compileAll() {
    const failed: string[] = []
    for (const t of TRANSITIONS) {
      try { this.mixProgram(t.id) } catch (e) { failed.push(`${t.id}: ${(e as Error).message}`) }
    }
    for (const fx of EFFECTS) {
      try { this.effectProgram(fx.id) } catch (e) { failed.push(`effect ${fx.id}: ${(e as Error).message}`) }
    }
    return failed
  }
}
