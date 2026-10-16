/**
 * Transitions run on the GPU in the same shader for preview and export, so what you
 * see is what you get. Each entry is a GLSL body that returns a colour using
 * from(uv), to(uv), p (progress 0..1), ratio (width/height) and rnd(vec2).
 */
export interface TransitionDef { id: string; name: string; group: string; glsl: string }

const T: [string, string, string, string][] = [
  // id, name, group, glsl
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
