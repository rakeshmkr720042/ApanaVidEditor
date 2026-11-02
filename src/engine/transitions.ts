/**
 * Transitions run on the GPU in the same shader for preview and export, so what you
 * see is what you get. Each entry is a GLSL body that returns a colour using
 * from(uv), to(uv), p (progress 0..1), ratio (width/height) and rnd(vec2).
 */
export interface TransitionDef { id: string; name: string; group: string; glsl: string }

// value noise (fbm) of a point, inline because GLSL ES can't nest functions; leaves the result in `name`
const fbm = (name: string, at: string, oct = 4) => `float ${name} = 0.0; { float amp = 0.5; vec2 nx = ${at};
    for (int o = 0; o < ${oct}; o++) { vec2 ni = floor(nx), nf = fract(nx); nf = nf*nf*(3.0-2.0*nf);
      ${name} += amp*mix(mix(rnd(ni), rnd(ni+vec2(1.0,0.0)), nf.x), mix(rnd(ni+vec2(0.0,1.0)), rnd(ni+vec2(1.0,1.0)), nf.x), nf.y);
      nx = nx*2.03 + vec2(3.1, 1.7); amp *= 0.5; } }`

/** Whip pan: the picture flies off with a strong blur along the move and the next one flies in. */
const whip = (dx: number, dy: number) => `float e = p*p*(3.0-2.0*p); e = e*e*(3.0-2.0*e);
    float b = sin(p*3.14159); b = b*b*0.35; vec2 D = vec2(${dx.toFixed(1)}, ${dy.toFixed(1)}); vec4 c = vec4(0.0);
    for (int i = 0; i < 20; i++) { float k = clamp(e + (float(i)/19.0 - 0.5)*b, 0.0, 1.0); vec2 q = uv + D*k;
      c += (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? to(fract(q)) : from(q); }
    return c/20.0;`

/**
 * Cube turning on its upright axis: the clip leaves on one face and the next comes in on the side face, with
 * perspective. `m` = -1 mirrors it (turns the other way).
 */
const cube = (m: number) => `float hw = 0.5*ratio; float D = 3.0*hw; float a = p*1.5707963; float c = cos(a), s = sin(a);
    float X = (uv.x-0.5)*ratio*${m.toFixed(1)}, Y = uv.y-0.5;
    // corners: left of the clip's face, shared edge, right of the next face (x, z; viewer at -z)
    vec2 L = vec2(-hw*c - hw*s, hw*s - hw*c), S = vec2(hw*c - hw*s, -hw*s - hw*c), R = vec2(hw*c + hw*s, -hw*s + hw*c);
    float zoom = 1.0 + 0.25*sin(p*3.14159); // step back a little mid-turn, like a camera on a cube
    float k0 = (D - hw);
    X *= zoom; Y *= zoom;
    // which face: project the shared edge
    float xs = S.x*k0/(D + S.y);
    bool first = X < xs;
    vec2 A = first ? L : S, B = first ? S : R; vec2 d = B - A;
    // solve X = (A.x + t d.x)*k0/(D + A.y + t d.y) for t, how far along the face
    float t = (k0*A.x - X*(D + A.y)) / (X*d.y - k0*d.x);
    if (t < 0.0 || t > 1.0) return vec4(0.0, 0.0, 0.0, 1.0);
    float z = A.y + t*d.y; float hh = 0.5*k0/(D + z);
    if (abs(Y) > hh) return vec4(0.0, 0.0, 0.0, 1.0);
    float u = ${m < 0 ? '1.0 - t' : 't'}; float v = Y/(2.0*hh) + 0.5;
    float shade = first ? mix(1.0, 0.5, s*s) : mix(0.5, 1.0, 1.0 - c*c);
    vec4 col = first ? from(vec2(u, v)) : to(vec2(u, v));
    return vec4(col.rgb*shade, 1.0);`

/** A card that flips over on its upright (or flat) axis: the clip on the front, the next one on the back. */
const flip = (vertical: boolean) => {
  const [U, V, R] = vertical ? ['uv.y', 'uv.x', '1.0'] : ['uv.x', 'uv.y', 'ratio']
  return `float hw = 0.5*${R}; float D = 3.0*hw; float a = p*3.14159265; bool back = a > 1.5707963; if (back) a = 3.14159265 - a;
    float c = cos(a), s = back ? -sin(a) : sin(a); /* the back comes round from the other side */ float X = (${U}-0.5)*${R}*(1.0 + 0.3*sin(p*3.14159)), Y = (${V}-0.5)*${vertical ? 'ratio' : '1.0'}*(1.0 + 0.3*sin(p*3.14159));
    float den = D*c - X*s; if (den <= 0.0) return vec4(0.0, 0.0, 0.0, 1.0);
    float x = X*D/den; float k = D/(D + x*s); float hh = 0.5*${vertical ? 'ratio' : '1.0'}*k;
    if (abs(x) > hw || abs(Y) > hh) return vec4(0.0, 0.0, 0.0, 1.0);
    float u = x/(2.0*hw) + 0.5; float w = Y/(2.0*hh) + 0.5;
    vec2 q = ${vertical ? 'vec2(w, u)' : 'vec2(u, w)'};
    vec4 col = back ? to(q) : from(q); return vec4(col.rgb*(0.6 + 0.4*c), 1.0);`
}

const TRENDING: [string, string, string, string][] = [
  ['whipleft', 'Whip pan left', 'Trending', whip(1, 0)],
  ['whipright', 'Whip pan right', 'Trending', whip(-1, 0)],
  ['whipup', 'Whip pan up', 'Trending', whip(0, -1)],
  ['whipdown', 'Whip pan down', 'Trending', whip(0, 1)],
  ['filmburn', 'Film burn', 'Trending', `${fbm('n', 'uv*vec2(ratio,1.0)*2.5 + vec2(floor(p*12.0)*0.07, 0.0)')}
    float s = sin(p*3.14159); s *= 0.9 + 0.1*rnd(vec2(floor(p*24.0), 2.0));
    float g = smoothstep(1.05 - s*1.25, 1.45 - s*1.25, n + uv.x*0.45);
    vec3 hot = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.5, 0.14), smoothstep(0.2, 0.9, g));
    vec4 base = mix(from(uv), to(uv), smoothstep(0.42, 0.58, p));
    vec3 col = mix(base.rgb, base.rgb*0.35 + hot, g*0.85); col += vec3(1.0, 0.85, 0.6)*pow(g, 6.0)*0.25;
    return vec4(min(col, 1.0), 1.0);`],
  ['leak', 'Light leak', 'Trending', `float s = sin(p*3.14159);
    vec2 A = (uv - vec2(-0.3 + p*1.6, 0.35))*vec2(ratio, 1.0), B = (uv - vec2(1.3 - p*1.5, 0.7))*vec2(ratio, 1.0);
    vec3 leak = vec3(1.0, 0.45, 0.12)*exp(-dot(A, A)*1.6) + vec3(1.0, 0.25, 0.5)*exp(-dot(B, B)*2.2);
    leak = clamp(leak*s*1.25, 0.0, 1.0);
    vec4 base = mix(from(uv), to(uv), smoothstep(0.35, 0.65, p));
    vec3 col = 1.0 - (1.0 - base.rgb)*(1.0 - leak); return vec4(col, 1.0);`],
  ['pageturn', 'Page turn', 'Trending', `vec2 x = uv*vec2(ratio, 1.0); vec2 n = normalize(vec2(1.0, 0.35));
    float far = dot(vec2(ratio, 1.0), n) + 0.05; float d0 = mix(far, -0.6, p);
    float dist = dot(x, n) - d0;
    if (dist > 0.0) { float sh = 1.0 - 0.55*exp(-dist*14.0)*step(0.001, p); return vec4(to(uv).rgb*sh, 1.0); }
    // the folded flap lies over the page: the point of the page that folded onto here
    vec2 m = x - 2.0*dist*n; vec2 mu = m/vec2(ratio, 1.0);
    if (mu.x >= 0.0 && mu.y >= 0.0 && mu.x <= 1.0 && mu.y <= 1.0) {
      vec3 backside = mix(from(mu).rgb, vec3(0.97, 0.95, 0.9), 0.82); float lit = 0.8 + 0.2*smoothstep(0.0, 0.35, -dist);
      return vec4(backside*lit, 1.0); }
    float sh = 1.0 - 0.35*exp(-(-dist)*10.0)*step(0.001, p); return vec4(from(uv).rgb*sh, 1.0);`],
  ['paperrip', 'Paper rip', 'Trending', `float y1 = uv.y*9.0, y2 = uv.y*48.0;
    float j = mix(rnd(vec2(floor(y1), 3.0)), rnd(vec2(floor(y1)+1.0, 3.0)), fract(y1)) - 0.5;
    j += (mix(rnd(vec2(floor(y2), 7.0)), rnd(vec2(floor(y2)+1.0, 7.0)), fract(y2)) - 0.5)*0.4;
    float edge = 0.5 + j*0.09; float e = p*p*(3.0-2.0*p); float s = e*0.62;
    float fib = 0.006 + 0.01*rnd(vec2(floor(uv.y*160.0), 9.0));
    float xl = uv.x + s; float tilt = s*0.12;
    if (xl < edge) { vec2 q = vec2(xl, uv.y + tilt*(uv.x - 0.5)); return edge - xl < fib ? vec4(0.96, 0.94, 0.9, 1.0) : from(q); }
    float xr = uv.x - s;
    if (xr > edge) { vec2 q = vec2(xr, uv.y - tilt*(uv.x - 0.5)); return xr - edge < fib ? vec4(0.96, 0.94, 0.9, 1.0) : from(q); }
    float sh = smoothstep(0.0, 0.06, min(edge - xr, xl - edge) + 0.0);
    return vec4(to(uv).rgb*(0.6 + 0.4*sh), 1.0);`],
  ['cubeleft', 'Cube left', 'Trending', cube(1)],
  ['cuberight', 'Cube right', 'Trending', cube(-1)],
  ['flip', 'Flip', 'Trending', flip(false)],
  ['flipup', 'Flip up', 'Trending', flip(true)],
  ['ink', 'Ink spread', 'Trending', `${fbm('n', 'uv*vec2(ratio,1.0)*3.0')}
    float r = length((uv - 0.5)*vec2(ratio, 1.0))/length(vec2(ratio, 1.0)*0.5);
    float v = r*0.75 + n*0.55; float edge = p*1.45 - 0.05;
    float m = smoothstep(edge, edge - 0.02, v); float ring = smoothstep(0.05, 0.0, abs(v - edge))*step(0.01, p)*step(p, 0.99);
    vec4 c = mix(from(uv), to(uv), m); return vec4(mix(c.rgb, vec3(0.02), ring*0.85), 1.0);`],
  ['brush', 'Brush strokes', 'Trending', `float rows = 5.0; float row = floor(uv.y*rows); float fy = fract(uv.y*rows);
    float dir = mod(row, 2.0) < 0.5 ? 1.0 : -1.0; float x = dir > 0.0 ? uv.x : 1.0 - uv.x;
    float start = row/rows*0.45; float q = clamp((p - start)/0.55, 0.0, 1.0); q = q*q*(3.0-2.0*q);
    ${fbm('n', 'vec2(uv.x*6.0*ratio, uv.y*30.0)', 3)}
    float rough = (n - 0.5)*0.12; float bristle = smoothstep(0.0, 0.08, fy + rough*0.5)*smoothstep(1.0, 0.92, fy - rough*0.5);
    float m = step(x, q*1.15 - 0.1 + rough)*max(bristle, smoothstep(0.75, 0.97, p));
    return mix(from(uv), to(uv), clamp(m + step(0.97, p), 0.0, 1.0));`],
  ['spinblur', 'Spin blur', 'Trending', `float e = p*p*(3.0-2.0*p); float a = e*6.2831853; float b = sin(p*3.14159)*0.9;
    vec2 o = (uv - 0.5)*vec2(ratio, 1.0); vec4 c = vec4(0.0);
    for (int i = 0; i < 16; i++) { float k = a + (float(i)/15.0 - 0.5)*b; vec2 q = mat2(cos(k), -sin(k), sin(k), cos(k))*o;
      q = q/vec2(ratio, 1.0) + 0.5; q = 1.0 - abs(1.0 - abs(q)); /* mirror at the edges: no black corners */
      c += p < 0.5 ? from(q) : to(q); }
    return c/16.0;`],
  ['zoompunch', 'Zoom punch', 'Trending', `float e = p < 0.5 ? p*2.0 : (p - 0.5)*2.0; float s = sin(p*3.14159); vec4 c = vec4(0.0);
    float z = p < 0.5 ? 1.0 - e*e*0.7 : 1.0 - (1.0 - e)*(1.0 - e)*0.7;
    for (int i = 0; i < 12; i++) { vec2 q = (uv - 0.5)*z*(1.0 - s*0.12*float(i)/11.0) + 0.5; c += p < 0.5 ? from(q) : to(q); }
    c /= 12.0; return mix(c, vec4(1.0), pow(s, 8.0)*0.6);`],
]


const T: [string, string, string, string][] = [
  // id, name, group, glsl
  ...TRENDING,

  ['fade', 'Fade', 'Basic', 'return mix(from(uv), to(uv), p);'],
  ['fadeblack', 'Dip to black', 'Basic', 'return p < 0.5 ? mix(from(uv), vec4(0,0,0,1), p*2.0) : mix(vec4(0,0,0,1), to(uv), p*2.0-1.0);'],
  ['fadewhite', 'Dip to white', 'Basic', 'return p < 0.5 ? mix(from(uv), vec4(1), p*2.0) : mix(vec4(1), to(uv), p*2.0-1.0);'],
  ['fadegrays', 'Fade grey', 'Basic', `vec4 a = from(uv), b = to(uv);
    vec4 ga = vec4(vec3(dot(a.rgb, vec3(.299,.587,.114))), 1.0), gb = vec4(vec3(dot(b.rgb, vec3(.299,.587,.114))), 1.0);
    if (p < 0.33) return mix(a, ga, p*3.0); if (p < 0.66) return mix(ga, gb, (p-0.33)*3.0); return mix(gb, b, (p-0.66)*3.0);`],
  ['dissolve', 'Dissolve', 'Basic', 'float n = rnd(floor(uv*vec2(400.0*ratio,400.0))); return n < p ? to(uv) : from(uv);'],
  ['flash', 'Flash', 'Basic', 'float f = 1.0 - abs(p*2.0-1.0); vec4 c = p < 0.5 ? from(uv) : to(uv); return mix(c, vec4(1), pow(f, 2.0));'],
  ['luma', 'Burn', 'Basic', 'vec4 a = from(uv); float l = dot(a.rgb, vec3(.299,.587,.114)); return mix(a, to(uv), smoothstep(l-0.1, l+0.1, p*1.2-0.1));'],

  ['wipeleft', 'Wipe left', 'Wipe', 'return uv.x > 1.0-p ? to(uv) : from(uv);'],
  ['wiperight', 'Wipe right', 'Wipe', 'return uv.x < p ? to(uv) : from(uv);'],
  ['wipeup', 'Wipe up', 'Wipe', 'return uv.y < p ? to(uv) : from(uv);'],
  ['wipedown', 'Wipe down', 'Wipe', 'return uv.y > 1.0-p ? to(uv) : from(uv);'],
  ['wipetl', 'Wipe top-left', 'Wipe', 'return (uv.x < p && uv.y > 1.0-p) ? to(uv) : from(uv);'],
  ['wipetr', 'Wipe top-right', 'Wipe', 'return (uv.x > 1.0-p && uv.y > 1.0-p) ? to(uv) : from(uv);'],
  ['wipebl', 'Wipe bottom-left', 'Wipe', 'return (uv.x < p && uv.y < p) ? to(uv) : from(uv);'],
  ['wipebr', 'Wipe bottom-right', 'Wipe', 'return (uv.x > 1.0-p && uv.y < p) ? to(uv) : from(uv);'],
  ['smoothleft', 'Smooth left', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.2, 0.0, uv.x - 1.2 + p*1.2));'],
  ['smoothright', 'Smooth right', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.2, 0.0, -uv.x + p*1.2 - 0.2));'],
  ['smoothup', 'Smooth up', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.2, 0.0, -uv.y + p*1.2 - 0.2));'],
  ['smoothdown', 'Smooth down', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.2, 0.0, uv.y - 1.2 + p*1.2));'],
  ['diagtl', 'Diagonal TL', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.1, 0.1, (uv.x + 1.0 - uv.y)*0.5 - 1.1 + p*1.2));'],
  ['diagtr', 'Diagonal TR', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.1, 0.1, (2.0 - uv.x - uv.y)*0.5 - 1.1 + p*1.2));'],
  ['diagbl', 'Diagonal BL', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.1, 0.1, (uv.x + uv.y)*0.5 - 1.1 + p*1.2));'],
  ['diagbr', 'Diagonal BR', 'Wipe', 'return mix(from(uv), to(uv), smoothstep(-0.1, 0.1, (1.0 - uv.x + uv.y)*0.5 - 1.1 + p*1.2));'],
  ['radial', 'Clock', 'Wipe', `float a = atan(uv.x-0.5, uv.y-0.5); float t = (a + 3.14159265) / 6.2831853;
    return mix(from(uv), to(uv), smoothstep(-0.01, 0.01, p - t));`],

  ['slideleft', 'Slide left', 'Slide', 'return uv.x < 1.0-p ? from(uv + vec2(p, 0.0)) : to(uv - vec2(1.0-p, 0.0));'],
  ['slideright', 'Slide right', 'Slide', 'return uv.x > p ? from(uv - vec2(p, 0.0)) : to(uv + vec2(1.0-p, 0.0));'],
  ['slideup', 'Slide up', 'Slide', 'return uv.y > p ? from(uv - vec2(0.0, p)) : to(uv + vec2(0.0, 1.0-p));'],
  ['slidedown', 'Slide down', 'Slide', 'return uv.y < 1.0-p ? from(uv + vec2(0.0, p)) : to(uv - vec2(0.0, 1.0-p));'],
  ['pushzoom', 'Push zoom', 'Slide', `float e = p*p*(3.0-2.0*p);
    vec2 a = (uv - 0.5) / (1.0 - 0.3*e) + 0.5 + vec2(e, 0.0); vec2 b = (uv - 0.5) / (0.7 + 0.3*e) + 0.5 - vec2(1.0-e, 0.0);
    return uv.x < 1.0-e ? from(a) : to(b);`],
  ['cover', 'Cover', 'Slide', 'return uv.x > 1.0-p ? to(uv - vec2(1.0-p, 0.0)) : from(uv);'],
  ['reveal', 'Reveal', 'Slide', 'return uv.x < 1.0-p ? from(uv + vec2(p, 0.0)) : to(uv);'],
  ['doorway', 'Doors', 'Slide', `if (uv.x < 0.5 - p*0.5) return from(uv + vec2(p*0.5, 0.0));
    if (uv.x > 0.5 + p*0.5) return from(uv - vec2(p*0.5, 0.0)); return to((uv-0.5)*(1.0-0.2*(1.0-p))+0.5);`],

  ['circleopen', 'Circle open', 'Shape', `vec2 d = (uv-0.5)*vec2(ratio,1.0); float r = p*length(vec2(ratio,1.0))*0.5;
    return mix(from(uv), to(uv), smoothstep(r+0.01, r-0.01, length(d)));`],
  ['circleclose', 'Circle close', 'Shape', `vec2 d = (uv-0.5)*vec2(ratio,1.0); float r = (1.0-p)*length(vec2(ratio,1.0))*0.5;
    return mix(to(uv), from(uv), smoothstep(r+0.01, r-0.01, length(d)));`],
  ['circlecrop', 'Circle crop', 'Shape', `vec2 d = (uv-0.5)*vec2(ratio,1.0); float r = abs(p*2.0-1.0)*length(vec2(ratio,1.0))*0.5;
    return length(d) < r ? (p < 0.5 ? from(uv) : to(uv)) : vec4(0,0,0,1);`],
  ['rectcrop', 'Rect crop', 'Shape', `vec2 d = abs(uv-0.5); float r = abs(p*2.0-1.0)*0.5;
    return (d.x < r && d.y < r) ? (p < 0.5 ? from(uv) : to(uv)) : vec4(0,0,0,1);`],
  ['vertopen', 'Vertical open', 'Shape', 'return abs(uv.x-0.5) < p*0.5 ? to(uv) : from(uv);'],
  ['vertclose', 'Vertical close', 'Shape', 'return abs(uv.x-0.5) > (1.0-p)*0.5 ? to(uv) : from(uv);'],
  ['horzopen', 'Horizontal open', 'Shape', 'return abs(uv.y-0.5) < p*0.5 ? to(uv) : from(uv);'],
  ['horzclose', 'Horizontal close', 'Shape', 'return abs(uv.y-0.5) > (1.0-p)*0.5 ? to(uv) : from(uv);'],
  ['diamond', 'Diamond', 'Shape', `vec2 d = abs(uv-0.5)*vec2(ratio,1.0); float r = p*(ratio+1.0)*0.5;
    return mix(from(uv), to(uv), smoothstep(r+0.01, r-0.01, d.x+d.y));`],
  ['heart', 'Heart', 'Shape', `vec2 q = (uv - vec2(0.5, 0.42)) * vec2(ratio, 1.0) / max(p*1.6, 0.0001);
    q.y = -q.y; float a = q.x*q.x + pow(q.y*1.2 - sqrt(abs(q.x))*0.6, 2.0);
    return a < 0.18 ? to(uv) : from(uv);`],
  ['checker', 'Checkerboard', 'Shape', `vec2 c = floor(uv*vec2(8.0*ratio, 8.0)); float o = mod(c.x + c.y, 2.0)*0.5;
    return clamp(p*2.0 - o, 0.0, 1.0) > fract(uv.y*8.0) ? to(uv) : from(uv);`],
  ['blindsh', 'Blinds', 'Shape', 'return fract(uv.y*10.0) < p ? to(uv) : from(uv);'],
  ['blindsv', 'Blinds vertical', 'Shape', 'return fract(uv.x*10.0) < p ? to(uv) : from(uv);'],
  ['hlslice', 'Slice left', 'Shape', `float w = 1.0 - p*1.5; float s = floor(uv.y*10.0)/10.0*0.5;
    return uv.x > w + s ? to(uv) : from(uv);`],
  ['hrslice', 'Slice right', 'Shape', `float w = p*1.5; float s = floor(uv.y*10.0)/10.0*0.5;
    return uv.x < w - s ? to(uv) : from(uv);`],
  ['vuslice', 'Slice up', 'Shape', `float w = p*1.5; float s = floor(uv.x*10.0)/10.0*0.5;
    return uv.y < w - s ? to(uv) : from(uv);`],
  ['vdslice', 'Slice down', 'Shape', `float w = 1.0 - p*1.5; float s = floor(uv.x*10.0)/10.0*0.5;
    return uv.y > w + s ? to(uv) : from(uv);`],

  ['zoomin', 'Zoom in', 'Zoom', `vec4 a = from((uv-0.5)*(1.0-p*0.8)+0.5); return mix(a, to(uv), smoothstep(0.5, 1.0, p));`],
  ['zoomout', 'Zoom out', 'Zoom', `vec4 b = to((uv-0.5)*(1.8-p*0.8)+0.5); return mix(from(uv), b, smoothstep(0.0, 0.5, p));`],
  ['crosszoom', 'Cross zoom', 'Zoom', `float s = sin(p*3.14159); vec2 dir = uv - 0.5; vec4 c = vec4(0.0);
    for (int i = 0; i < 10; i++) { float k = float(i)/10.0; vec2 q = uv - dir*k*s*0.25; c += mix(from(q), to(q), smoothstep(0.35, 0.65, p)); }
    return c/10.0;`],
  ['squeezeh', 'Squeeze', 'Zoom', `if (p < 0.5) { float s = 1.0 - p*2.0; return abs(uv.x-0.5) < s*0.5 ? from(vec2((uv.x-0.5)/max(s,0.001)+0.5, uv.y)) : vec4(0,0,0,1); }
    float s = p*2.0-1.0; return abs(uv.x-0.5) < s*0.5 ? to(vec2((uv.x-0.5)/max(s,0.001)+0.5, uv.y)) : vec4(0,0,0,1);`],
  ['squeezev', 'Squeeze vertical', 'Zoom', `if (p < 0.5) { float s = 1.0 - p*2.0; return abs(uv.y-0.5) < s*0.5 ? from(vec2(uv.x, (uv.y-0.5)/max(s,0.001)+0.5)) : vec4(0,0,0,1); }
    float s = p*2.0-1.0; return abs(uv.y-0.5) < s*0.5 ? to(vec2(uv.x, (uv.y-0.5)/max(s,0.001)+0.5)) : vec4(0,0,0,1);`],
  ['spin', 'Spin', 'Zoom', `float a = p*6.2831853; vec2 q = (uv-0.5)*vec2(ratio,1.0); float s = 1.0 + sin(p*3.14159)*1.5;
    q = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * s; q = q/vec2(ratio,1.0)+0.5;
    return p < 0.5 ? from(q) : to(q);`],
  ['swirl', 'Swirl', 'Zoom', `float r = 0.6; vec2 q = (uv-0.5); float d = length(q); float s = sin(p*3.14159);
    if (d < r) { float k = (r-d)/r; float a = k*k*s*12.0; q = mat2(cos(a), -sin(a), sin(a), cos(a))*q; }
    q += 0.5; return mix(from(q), to(q), p);`],

  ['pixelize', 'Pixelate', 'Effect', `float s = min(p, 1.0-p)*2.0; float n = max(1.0, s*60.0);
    vec2 g = n > 1.0 ? (floor(uv*vec2(ratio,1.0)*80.0/n)+0.5)*n/80.0/vec2(ratio,1.0) : uv;
    return mix(from(g), to(g), smoothstep(0.4, 0.6, p));`],
  ['hblur', 'Blur', 'Effect', `float s = sin(p*3.14159)*0.04; vec4 c = vec4(0.0);
    for (int i = -6; i <= 6; i++) { vec2 q = uv + vec2(float(i)*s/6.0, 0.0); c += mix(from(q), to(q), p); }
    return c/13.0;`],
  ['zoomblur', 'Zoom blur', 'Effect', `float s = sin(p*3.14159)*0.15; vec4 c = vec4(0.0);
    for (int i = 0; i < 12; i++) { vec2 q = (uv-0.5)*(1.0 - s*float(i)/12.0)+0.5; c += mix(from(q), to(q), p); }
    return c/12.0;`],
  ['ripple', 'Ripple', 'Effect', `vec2 d = uv-0.5; float l = length(d); float s = sin(p*3.14159);
    vec2 q = uv + d/l*sin(l*40.0 - p*30.0)*0.02*s; return mix(from(q), to(q), p);`],
  ['dreamy', 'Dreamy', 'Effect', `float s = sin(p*3.14159); vec2 q = uv + vec2(sin(uv.y*20.0+p*10.0), cos(uv.x*20.0+p*10.0))*0.015*s;
    return mix(from(q), to(q), p);`],
  ['glitch', 'Glitch', 'Effect', `float s = sin(p*3.14159); float row = floor(uv.y*24.0);
    float off = (rnd(vec2(row, floor(p*20.0))) - 0.5)*0.25*s*step(0.6, rnd(vec2(row*1.3, floor(p*20.0))));
    vec2 q = vec2(uv.x + off, uv.y); vec4 c = p < 0.5 ? from(q) : to(q);
    vec4 r = p < 0.5 ? from(q + vec2(0.02*s, 0.0)) : to(q + vec2(0.02*s, 0.0));
    return vec4(r.r, c.g, c.b, 1.0);`],
  ['shake', 'Shake', 'Effect', `float s = sin(p*3.14159); vec2 q = uv + vec2(sin(p*90.0), cos(p*70.0))*0.03*s;
    return mix(from(q), to(q), smoothstep(0.4, 0.6, p));`],
  ['colorphase', 'Colour phase', 'Effect', `vec4 a = from(uv), b = to(uv);
    return mix(a, b, smoothstep(vec4(0.0, 0.2, 0.4, 0.0), vec4(0.6, 0.8, 1.0, 1.0), vec4(p)));`],
  ['windowslice', 'Window slice', 'Effect', `float pr = smoothstep(-0.5, 0.0, uv.x - p*1.5); return mix(from(uv), to(uv), step(pr, fract(uv.x*10.0)));`],
]

export const TRANSITIONS: TransitionDef[] = T.map(([id, name, group, glsl]) => ({ id, name, group, glsl }))
export const TRANSITION_GROUPS = [...new Set(TRANSITIONS.map((t) => t.group))]
export const transitionIndex = (id: string) => Math.max(0, TRANSITIONS.findIndex((t) => t.id === id))
