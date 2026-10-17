// The pearl orb and night background shared by 003 (vortex), 004 (lens intro) and 005 (liquid contact).
// GLSL chunk + matching uniforms. Coordinates: q = point / orb radius (center 0, edge 1), y up.

import { Vector3 } from 'three'

export const ORB = {
  // palette sampled from the Engaged videos
  page: '#0b0830',
  pageDeep: '#030023',
  rim: '#c6d2fd', // outer glow
  center: '#3a60a7', // the middle is the darkest, light gathers toward the edges
  top: '#94aef0',
  topLeft: '#b4c6f0',
  left: '#5c62ae',
  right: '#3f9ed6',
  aqua: '#55d6e2', // aurora crescent, lower right
  mint: '#7be3c4',
  edgeLow: '#3f4386',
  sheen: '#c9bdfb', // reflection arc just inside the upper-right edge
  colorDrift: 0.12, // slow color motion inside the orb
  iridescence: 0.45, // pearl thin-film tint, stronger toward the edge
  rimGradient: 0.65, // colored rim band strength
  sparkles: 7, // glints inside the orb (max 12)
  stars: 0.9,
}

export const hex = (h: string) => {
  const n = parseInt(h.slice(1), 16)
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

export function orbUniforms(o = ORB) {
  return {
    uPage: { value: hex(o.page) },
    uPageDeep: { value: hex(o.pageDeep) },
    uRim: { value: hex(o.rim) },
    uCenter: { value: hex(o.center) },
    uTop: { value: hex(o.top) },
    uTopLeft: { value: hex(o.topLeft) },
    uLeft: { value: hex(o.left) },
    uRight: { value: hex(o.right) },
    uAqua: { value: hex(o.aqua) },
    uMint: { value: hex(o.mint) },
    uEdgeLow: { value: hex(o.edgeLow) },
    uSheen: { value: hex(o.sheen) },
    uDrift: { value: o.colorDrift },
    uIri: { value: o.iridescence },
    uRimGrad: { value: o.rimGradient },
    uSparkles: { value: o.sparkles },
    uStars: { value: o.stars },
  }
}

export const orbGlsl = /* glsl */ `
  uniform vec3 uPage, uPageDeep, uRim;
  uniform vec3 uCenter, uTop, uTopLeft, uLeft, uRight, uAqua, uMint, uEdgeLow, uSheen;
  uniform float uDrift, uIri, uRimGrad, uStars;
  uniform int uSparkles;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }

  vec3 rainbow(float x) { return 0.5 + 0.5 * cos(6.2832 * (x + vec3(0.0, 0.33, 0.67))); }

  // deep navy with a faint violet haze and twinkling stars; p in viewport-height units, center 0
  vec3 nightSky(vec2 p, float time) {
    vec3 col = mix(uPageDeep, uPage, smoothstep(1.2, 0.0, length(p)) * 0.9);
    col += vec3(0.16, 0.1, 0.35) * 0.25 * fbm(p * 1.5 + time * 0.03);
    vec2 g = p * 38.0;
    vec2 cell = floor(g);
    vec2 star = cell + 0.2 + 0.6 * vec2(hash(cell), hash(cell + 7.1));
    float tw = 0.5 + 0.5 * sin(time * 1.5 + hash(cell) * 30.0);
    col += uStars * step(0.9, hash(cell + 3.3)) * smoothstep(0.08, 0.0, length(g - star)) * tw * vec3(0.8, 0.85, 1.0);
    return col;
  }

  // body colors of the orb
  vec3 orbColor(vec2 q, float time) {
    vec2 d = vec2(fbm(q * 1.3 + time * 0.06), fbm(q * 1.3 - time * 0.05 + 4.0)) - 0.5;
    vec2 s = q + d * uDrift * 3.0;
    float r = length(s);
    vec3 c = uCenter;
    c = mix(c, uRight, smoothstep(0.0, 0.95, s.x) * 0.9);
    c = mix(c, uLeft, smoothstep(0.0, 0.9, -s.x) * 0.8);
    c = mix(c, uTop, smoothstep(-0.1, 0.95, s.y) * 0.9);
    c = mix(c, uTopLeft, smoothstep(0.25, 1.15, dot(s, vec2(-0.707, 0.707))));
    // aurora crescent following the curvature, lower right; mint toward its left end
    float arc = exp(-pow((r - 0.6 - 0.04 * sin(time * 0.3)) / 0.26, 2.0)) * 0.9;
    float side = smoothstep(0.25, -0.6, s.y) * smoothstep(-0.9, 0.2, s.x);
    c = mix(c, mix(uAqua, uMint, smoothstep(0.3, -0.4, s.x)), arc * side);
    c = mix(c, uEdgeLow, smoothstep(0.72, 0.98, r) * smoothstep(-0.1, -0.7, s.y) * 0.8);
    return c;
  }

  // pearl film, gradient rim, reflection arc, sheen and glints on top of a body color.
  // rr = |q| clamped to 1, n = sphere normal, calm = highlight strength (0..1)
  vec3 orbFinish(vec3 orb, vec2 q, float rr, vec3 n, float time, float calm) {
    float fres = pow(1.0 - n.z, 2.0);
    float qa = atan(q.y, q.x);
    vec3 film = rainbow(fres * 1.3 + qa * 0.16 + time * 0.04 + fbm(q * 2.0 + time * 0.05) * 0.6);
    film = mix(vec3(0.92, 0.92, 1.0), film, 0.5);
    orb = mix(orb, film, uIri * (0.12 + 0.55 * fres));

    // gradient rim: color runs around the edge (lavender top-right, sky right, mint low, violet left)
    float rimBand = smoothstep(0.84, 0.99, rr);
    vec3 rimCol = mix(uSheen, uRight * 1.3, smoothstep(0.9, -0.2, sin(qa)));
    rimCol = mix(rimCol, uMint, smoothstep(-0.3, -0.95, sin(qa)) * 0.7);
    rimCol = mix(rimCol, uTopLeft, smoothstep(0.2, -0.9, cos(qa)) * smoothstep(-0.5, 0.5, sin(qa)));
    rimCol = mix(rimCol, film, 0.35);
    orb = mix(orb, rimCol, rimBand * uRimGrad);

    // reflection arc just inside the upper-right edge
    float cres = exp(-pow((rr - 0.9) / 0.045, 2.0)) * smoothstep(0.1, 0.85, dot(q / max(rr, 1e-3), vec2(0.6, 0.8)));
    orb += uSheen * 0.35 * cres * calm;
    // soft sheen, top left
    orb += vec3(0.85, 0.88, 1.0) * 0.16 * smoothstep(0.75, 0.0, length(q - vec2(-0.45, 0.5))) * calm;
    // glints floating inside
    for (int i = 0; i < 12; i++) {
      if (i >= uSparkles) break;
      float fi = float(i);
      vec2 sp = (vec2(hash(vec2(fi, 1.3)), hash(vec2(fi, 7.9))) * 2.0 - 1.0) * 0.72;
      sp += 0.04 * vec2(sin(time * 0.23 + fi), cos(time * 0.19 + fi * 1.7));
      float dd = length(q - sp);
      float tw = 0.55 + 0.45 * sin(time * (0.8 + hash(vec2(fi, 3.1))) + fi * 2.0);
      float big = step(0.75, hash(vec2(fi, 5.5)));
      orb += vec3(0.95, 0.97, 1.0) * tw * calm * (0.8 * smoothstep(0.01 + big * 0.006, 0.0, dd) + 0.16 * exp(-dd / (0.02 + big * 0.02)));
    }
    return orb;
  }

  // soft light around the orb; r = distance from center, R = radius (same units)
  vec3 orbGlow(float r, float R) {
    float edge = r - R;
    return uRim * 0.16 * exp(-max(edge, 0.0) / (0.06 + R * 0.1)) * smoothstep(-0.02, 0.0, edge);
  }
`
