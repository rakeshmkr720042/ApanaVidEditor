import type { ColorParams } from './filters'
import { TRANSITIONS } from './transitions'

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
uniform float u_seed;
uniform float u_ratio;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 chroma(vec3 c) { return vec2(dot(c, vec3(-0.169, -0.331, 0.5)), dot(c, vec3(0.5, -0.419, -0.081))); }

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
    float d = distance(chroma(c), chroma(u_key.rgb));
    float a = smoothstep(u_keyP.x, u_keyP.x + max(u_keyP.y, 0.001), d);
    alpha *= a;
    // spill suppression: pull the key colour out of semi-transparent edges
    float spill = 1.0 - a;
    c = mix(c, vec3(luma(c)), spill * 0.6);
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
  l = clamp(luma(c), 0.0, 1.0);
  c = mix(c, vec3(l), clamp(u_d.z, 0.0, 1.0));
  vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
  c = mix(c, sep, clamp(u_d.w, 0.0, 1.0));
  c += ((u_splitS.rgb - 0.5) * (1.0 - l) + (u_splitH - 0.5) * l) * u_splitS.w * 0.7;
  c = mix(c, mix(u_duoD.rgb, u_duoL, l), clamp(u_duoD.w, 0.0, 1.0));
  c = u_c.z * 0.15 + c * (1.0 - u_c.z * 0.2);
  c = clamp(c, 0.0, 1.0);
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

export interface Chroma { color: [number, number, number]; similarity: number; smoothness: number }

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
  private srcTex: WebGLTexture[]
  private fbo: { fb: WebGLFramebuffer; tex: WebGLTexture }[] = []
  private w = 0
  private h = 0
  private uniforms = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()

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
    this.fbo = [0, 1].map(() => {
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
    gl.uniform1f(u('u_seed'), seed)
    gl.uniform1f(u('u_ratio'), this.w / this.h)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Grades one image into the canvas (sized to w x h). */
  drawGraded(src: TexImageSource, p: ColorParams, seed = 0, chroma?: Chroma) {
    this.upload(0, src)
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.runGrade(this.srcTex[0], p, null, seed, chroma)
  }

  /** Grades two images and blends them with a transition. */
  drawTransition(a: TexImageSource, pa: ColorParams, b: TexImageSource, pb: ColorParams, type: string, progress: number, seed = 0) {
    const gl = this.gl
    this.upload(0, a)
    this.runGrade(this.srcTex[0], pa, this.fbo[0].fb, seed)
    this.upload(1, b)
    this.runGrade(this.srcTex[1], pb, this.fbo[1].fb, seed)
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
    return failed
  }
}
