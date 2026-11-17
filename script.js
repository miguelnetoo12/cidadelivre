(function(){
"use strict";
/* =========================================================
   Cidade Livre — mundo aberto em 3D (WebGL feito à mão)
   CETI Prof. José Amável · 1º ano D · InovaTEC
   ========================================================= */
const $ = id => document.getElementById(id);
const stage = $("stage"), cv = $("cv");
const IS_TOUCH = window.matchMedia ? matchMedia("(pointer: coarse)").matches : false;
if(IS_TOUCH) document.body.classList.add("touch");
const gl = cv.getContext("webgl", { antialias: !IS_TOUCH, alpha: false, powerPreference: "high-performance" }) || cv.getContext("experimental-webgl");
if(!gl){ $("noGL").hidden = false; $("btnPlay").disabled = true; return; }

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = a => Math.atan2(Math.sin(a), Math.cos(a));
const hypot = Math.hypot;
function rng(seed){ return function(){ seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(2026);
const pick = (r, a) => a[Math.floor(r() * a.length)];
function hex(h){ const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
function buzz(ms){ try{ if(IS_TOUCH && navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
function fmt(s){ s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }
const money = v => "R$ " + Math.round(v).toLocaleString("pt-BR");

/* =========================================================
   MATRIZES 4×4 (coluna principal)
   ========================================================= */
function I4(){ const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function mul(a, b){ const o = new Float32Array(16); for(let c = 0; c < 4; c++) for(let r = 0; r < 4; r++){ let s = 0; for(let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; }
function T(x, y, z){ const m = I4(); m[12] = x; m[13] = y; m[14] = z; return m; }
function S(x, y, z){ const m = I4(); m[0] = x; m[5] = y; m[10] = z; return m; }
function RY(a){ const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
function RX(a){ const m = I4(), c = Math.cos(a), s = Math.sin(a); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
function RZ(a){ const m = I4(), c = Math.cos(a), s = Math.sin(a); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
function chain(...ms){ let m = ms[0]; for(let i = 1; i < ms.length; i++) m = mul(m, ms[i]); return m; }
function persp(fovy, asp, n, f){ const m = new Float32Array(16), t = 1 / Math.tan(fovy / 2); m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f); return m; }
function lookAt(e, c, u){
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2]; let l = hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx; l = hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const m = new Float32Array(16);
  m[0] = xx; m[4] = xy; m[8] = xz; m[1] = yx; m[5] = yy; m[9] = yz; m[2] = zx; m[6] = zy; m[10] = zz;
  m[12] = -(xx * e[0] + xy * e[1] + xz * e[2]); m[13] = -(yx * e[0] + yy * e[1] + yz * e[2]); m[14] = -(zx * e[0] + zy * e[1] + zz * e[2]); m[15] = 1;
  return m;
}

/* =========================================================
   SHADERS
   ========================================================= */
const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol; attribute vec2 aUV; attribute float aTint;
uniform mat4 uProj, uView, uModel; uniform vec3 uTint, uLight;
varying vec3 vCol, vW; varying vec2 vUV; varying float vL;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uProj * uView * wp;
  vec3 n = normalize(mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNor);
  vL = 0.56 + 0.44 * max(dot(n, uLight), 0.0) + 0.05 * n.y;
  vCol = mix(aCol, aCol * uTint, aTint);
  vUV = aUV;
  vW = wp.xyz;
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec3 uFogCol, uCam; uniform vec2 uFog; uniform float uEmit, uAlpha;
varying vec3 vCol, vW; varying vec2 vUV; varying float vL;
void main(){
  vec3 c = vCol * texture2D(uTex, vUV).rgb * mix(vL, 1.0, uEmit);
  float f = clamp((distance(vW, uCam) - uFog.x) / (uFog.y - uFog.x), 0.0, 1.0);
  c = mix(c, uFogCol, f * (1.0 - uEmit * 0.6));
  gl_FragColor = vec4(c, uAlpha);
}`;
function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
const prog = gl.createProgram();
gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
gl.useProgram(prog);
const A = {}, U = {};
["aPos", "aNor", "aCol", "aUV", "aTint"].forEach(n => { A[n] = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(A[n]); });
["uProj", "uView", "uModel", "uTint", "uCam", "uLight", "uFog", "uTex", "uFogCol", "uEmit", "uAlpha"].forEach(n => U[n] = gl.getUniformLocation(prog, n));
const SKY = hex("#A9D6F2");
gl.uniform3fv(U.uFogCol, SKY);
gl.uniform3fv(U.uLight, (() => { const v = [0.45, 0.8, 0.35], l = hypot(...v); return v.map(x => x / l); })());
gl.enable(gl.DEPTH_TEST);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

/* ---------- textura com placas e letreiros ---------- */
const atlas = document.createElement("canvas"); atlas.width = 1024; atlas.height = 1024;
const ag = atlas.getContext("2d");
ag.fillStyle = "#fff"; ag.fillRect(0, 0, 16, 16);
const WHITE_UV = [4 / 1024, 4 / 1024];
let shelfX = 20, shelfY = 0, shelfH = 0;
function sign(w, h, draw){
  if(shelfX + w > 1024){ shelfX = 0; shelfY += shelfH + 4; shelfH = 0; }
  const x = shelfX, y = shelfY; shelfX += w + 4; shelfH = Math.max(shelfH, h);
  ag.save(); ag.translate(x, y); draw(ag, w, h); ag.restore();
  return [x / 1024, y / 1024, (x + w) / 1024, (y + h) / 1024];
}
function textSign(text, bg, fg, w, h, font){
  return sign(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    let fs = Math.floor(h * 0.62); g.font = `900 ${fs}px ${font || "Arial Black,Arial,sans-serif"}`;
    while(g.measureText(text).width > w * 0.9 && fs > 8){ fs--; g.font = `900 ${fs}px ${font || "Arial Black,Arial,sans-serif"}`; }
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
const UVS = {
  school: textSign("CETI PROF. JOSÉ AMÁVEL", "#1B3A8C", "#FFFFFF", 512, 64),
  police: textSign("POLÍCIA", "#0E2A6B", "#FFFFFF", 256, 64),
  pizza: textSign("PIZZARIA", "#C8261E", "#FFF4D6", 256, 64),
  posto: textSign("POSTO", "#1E8A45", "#FFFFFF", 256, 64),
  praca: textSign("PRAÇA DA INOVAÇÃO", "#6B3FA0", "#FFFFFF", 512, 64),
  bill1: textSign("NOSSA LÓGICA CONSTRÓI O FUTURO", "#FFC21A", "#1B1B1B", 512, 96),
  bill2: textSign("INOVATEC · 1º ANO D", "#1B3A8C", "#FFFFFF", 512, 96),
  taxi: textSign("TÁXI", "#1B1B1B", "#FFC21A", 128, 48),
  polcar: textSign("POLÍCIA", "#FFFFFF", "#0E2A6B", 256, 48),
  pizcar: textSign("PIZZA", "#FFFFFF", "#C8261E", 256, 64),
  roupas: textSign("MODA CETI · ROUPAS", "#FF5D8F", "#FFFFFF", 512, 64),
  salao: textSign("CABELEIREIRO", "#19C3B0", "#FFFFFF", 512, 64),
  estande: textSign("ESTANDE DE TIRO AO ALVO", "#2B3A55", "#FFC21A", 512, 64),
  alvo: sign(128, 128, (g) => { const c = ["#E23B3B", "#FFFFFF", "#E23B3B", "#FFFFFF", "#E23B3B"]; g.fillStyle = "#F2EAD8"; g.fillRect(0, 0, 128, 128); c.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(64, 64, 60 - i * 12, 0, Math.PI * 2); g.fill(); }); }),
};
const tex = gl.createTexture();
function uploadAtlas(){
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
uploadAtlas();
gl.uniform1i(U.uTex, 0);

/* =========================================================
   GEOMETRIA
   ========================================================= */
class Geo {
  constructor(){ this.a = []; }
  v(p, n, c, uv, t){ this.a.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], uv[0], uv[1], t); }
  quad(p0, p1, p2, p3, n, c, uvr, t){
    t = t || 0;
    const u = uvr ? [[uvr[0], uvr[3]], [uvr[2], uvr[3]], [uvr[2], uvr[1]], [uvr[0], uvr[1]]] : [WHITE_UV, WHITE_UV, WHITE_UV, WHITE_UV];
    this.v(p0, n, c, u[0], t); this.v(p1, n, c, u[1], t); this.v(p2, n, c, u[2], t);
    this.v(p0, n, c, u[0], t); this.v(p2, n, c, u[2], t); this.v(p3, n, c, u[3], t);
  }
  tri(p0, p1, p2, n, c, t){ this.v(p0, n, c, WHITE_UV, t || 0); this.v(p1, n, c, WHITE_UV, t || 0); this.v(p2, n, c, WHITE_UV, t || 0); }
  box(x0, y0, z0, x1, y1, z1, c, o){
    o = o || {}; const t = o.tint ? 1 : 0, top = o.top || c, sd = o.side || c;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], top, null, t);
    if(o.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], c, null, t);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c, o.uvF, t);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c, o.uvB, t);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], sd, o.uvR, t);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], sd, o.uvL, t);
  }
  ground(x0, z0, x1, z1, y, c, uvr){ this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], c, uvr, 0); }
  roofX(x0, z0, x1, z1, y, h, c){   // telhado de duas águas com cumeeira no eixo x
    const zm = (z0 + z1) / 2, d = (z1 - z0) / 2, l = hypot(d, h);
    this.quad([x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm], [0, d / l, h / l], c);
    this.quad([x1, y, z0], [x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], [0, d / l, -h / l], c);
    const wall = c.map(v => v * 0.8);
    this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm], [-1, 0, 0], wall);
    this.tri([x1, y, z1], [x1, y, z0], [x1, y + h, zm], [1, 0, 0], wall);
  }
  cyl(cx, cz, r, y0, y1, seg, c, t, open){
    for(let i = 0; i < seg; i++){
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
      const p = a => [cx + Math.sin(a) * r, cz + Math.cos(a) * r];
      const [x0, z0] = p(a0), [x1, z1] = p(a1);
      this.quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], [Math.sin(am), 0, Math.cos(am)], c, null, t);
      if(!open) this.tri([cx, y1, cz], [x0, y1, z0], [x1, y1, z1], [0, 1, 0], c, t);
    }
  }
  cone(cx, cz, r, y0, y1, seg, c){
    for(let i = 0; i < seg; i++){
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
      this.tri([cx + Math.sin(a0) * r, y0, cz + Math.cos(a0) * r], [cx + Math.sin(a1) * r, y0, cz + Math.cos(a1) * r], [cx, y1, cz], [Math.sin(am) * 0.8, 0.6, Math.cos(am) * 0.8], c);
    }
  }
}
function upload(g){
  const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(g.a), gl.STATIC_DRAW);
  return { b, n: g.a.length / 12 };
}
let curBuf = null;
function shadow(model, a){ gl.enable(gl.BLEND); gl.depthMask(false); draw(SHADOW, model, [0, 0, 0], 1, a); gl.depthMask(true); gl.disable(gl.BLEND); }
const ONE = [1, 1, 1];
function draw(mesh, model, tint, emit, alpha){
  if(curBuf !== mesh.b){
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.b);
    gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 48, 0);
    gl.vertexAttribPointer(A.aNor, 3, gl.FLOAT, false, 48, 12);
    gl.vertexAttribPointer(A.aCol, 3, gl.FLOAT, false, 48, 24);
    gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 48, 36);
    gl.vertexAttribPointer(A.aTint, 1, gl.FLOAT, false, 48, 44);
    curBuf = mesh.b;
  }
  gl.uniformMatrix4fv(U.uModel, false, model);
  gl.uniform3fv(U.uTint, tint || ONE);
  gl.uniform1f(U.uEmit, emit || 0);
  gl.uniform1f(U.uAlpha, alpha == null ? 1 : alpha);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
}

/* =========================================================
   A CIDADE
   ========================================================= */
const NB = 7, BLOCK = 56, ROAD = 16, PITCH = BLOCK + ROAD, SIZE = NB * PITCH + ROAD;
const rc = i => i * PITCH + ROAD / 2;          // centro da rua i
const bx0 = b => b * PITCH + ROAD;             // início do quarteirão b
const LAYOUT = [
  "HHHAHHH",
  "HSRBBTH",
  "HBTTTBH",
  "PBTQTBL",
  "HDTTTZH",
  "HBBGCBH",
  "HHPHHHH"];
const C = {
  grass: hex("#6DAE47"), grass2: hex("#5E9E3E"), asphalt: hex("#43474F"), walk: hex("#C3C6CC"), lot: hex("#D9D3C4"),
  yellow: hex("#F2C230"), white: hex("#F2F2F2"), glass: hex("#5C7C9E"), glass2: hex("#86A9C9"), trunk: hex("#6B4423"),
  leaf: [hex("#3E8E41"), hex("#4CAF50"), hex("#2E7D32"), hex("#5DBB4A")], water: hex("#3C8DBC"), dark: hex("#2A2D33"),
};
const BCOL = ["#E8E0D0", "#D4A373", "#8DA9C4", "#B5838D", "#A3B18A", "#F2CC8F", "#81B29A", "#E07A5F", "#9DB4C0", "#C9ADA7", "#EDE7E3", "#B8C0FF"].map(hex);
const HWALL = ["#F4E1C1", "#F7C59F", "#A8DADC", "#FFD6A5", "#CAFFBF", "#BDB2FF", "#FFADAD", "#FDFFB6"].map(hex);
const HROOF = ["#C1440E", "#8C3A2B", "#5A4A42", "#9C2F2F"].map(hex);

const colliders = [];           // {x0,z0,x1,z1,h}
const CELL = 24, GW = Math.ceil(SIZE / CELL) + 2;
const cgrid = new Map();
function addCol(x0, z0, x1, z1, h){
  const c = { x0, z0, x1, z1, h: h || 3 }; colliders.push(c);
  for(let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) for(let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++){
    const k = gx * 1000 + gz; if(!cgrid.has(k)) cgrid.set(k, []); cgrid.get(k).push(c);
  }
}
function nearCols(x, z){ const out = []; const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL); for(let i = -1; i <= 1; i++) for(let j = -1; j <= 1; j++){ const l = cgrid.get((gx + i) * 1000 + gz + j); if(l) for(const c of l) if(!out.includes(c)) out.push(c); } return out; }

const city = new Geo();
const places = {};               // lugares com nome (para missões)
const parkedSpots = [];          // vagas para carros estacionados
const houseDoors = [];           // portas das casas (entregas)
const starSpots = [];
const lots = [];
const targetSpots = [];

function windows(g, x0, y0, z0, x1, y1, z1, glass){
  const fy = 3.6, cols = (len) => Math.max(1, Math.floor(len / 4.2));
  const floors = Math.floor((y1 - y0 - 2) / fy);
  const faces = [
    { n: [0, 0, 1], a: [x0, z1], b: [x1, z1] }, { n: [0, 0, -1], a: [x1, z0], b: [x0, z0] },
    { n: [1, 0, 0], a: [x1, z1], b: [x1, z0] }, { n: [-1, 0, 0], a: [x0, z0], b: [x0, z1] }];
  for(const f of faces){
    const len = hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), n = cols(len), ux = (f.b[0] - f.a[0]) / len, uz = (f.b[1] - f.a[1]) / len;
    const off = 0.06, ox = f.n[0] * off, oz = f.n[2] * off;
    for(let k = 0; k < floors; k++) for(let i = 0; i < n; i++){
      const s0 = (i + 0.22) * len / n, s1 = (i + 0.78) * len / n, y = y0 + 1.6 + k * fy, yy = y + 2.1;
      const p = s => [f.a[0] + ux * s + ox, f.a[1] + uz * s + oz];
      const [ax, az] = p(s0), [bx, bz] = p(s1);
      g.quad([ax, y, az], [bx, y, bz], [bx, yy, bz], [ax, yy, az], f.n, (k + i) % 5 === 0 ? C.glass2 : glass);
    }
  }
}
function building(x0, z0, x1, z1, h, col){
  city.box(x0, 0.25, z0, x1, h, z1, col, { top: col.map(v => v * 0.8) });
  windows(city, x0, 0.25, z0, x1, h, z1, C.glass);
  city.box(x0 + (x1 - x0) * 0.3, h, z0 + (z1 - z0) * 0.3, x0 + (x1 - x0) * 0.55, h + 2.2, z0 + (z1 - z0) * 0.55, hex("#9AA0A8"));
  addCol(x0, z0, x1, z1, h);
}
function tree(x, z, s){
  s = s || 1;
  city.box(x - 0.3 * s, 0.2, z - 0.3 * s, x + 0.3 * s, 2.6 * s, z + 0.3 * s, C.trunk);
  const lc = pick(R, C.leaf);
  city.box(x - 1.9 * s, 2.3 * s, z - 1.9 * s, x + 1.9 * s, 4.4 * s, z + 1.9 * s, lc);
  city.box(x - 1.2 * s, 4.4 * s, z - 1.2 * s, x + 1.2 * s, 5.6 * s, z + 1.2 * s, lc.map(v => v * 1.08));
  addCol(x - 0.4 * s, z - 0.4 * s, x + 0.4 * s, z + 0.4 * s, 5);
}
function house(x0, z0, x1, z1){
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const hw = 4 + R() * 1.5, hd = 3.5 + R() * 1.2, h = 3.4 + R() * 0.8;
  const col = pick(R, HWALL), roof = pick(R, HROOF);
  city.ground(x0, z0, x1, z1, 0.26, C.grass2);
  city.box(cx - hw, 0.26, cz - hd, cx + hw, 0.26 + h, cz + hd, col);
  city.roofX(cx - hw - 0.4, cz - hd - 0.5, cx + hw + 0.4, cz + hd + 0.5, 0.26 + h, 2.2, roof);
  // porta e janelas (frente para +z e -z)
  for(const sgn of [1, -1]){
    const zf = cz + sgn * (hd + 0.05), n = [0, 0, sgn];
    const q = (a, b, y0, y1, c) => sgn > 0 ? city.quad([a, y0, zf], [b, y0, zf], [b, y1, zf], [a, y1, zf], n, c) : city.quad([b, y0, zf], [a, y0, zf], [a, y1, zf], [b, y1, zf], n, c);
    q(cx - 0.7, cx + 0.7, 0.26, 2.5, hex("#6B4A2E"));
    q(cx - hw + 1, cx - hw + 2.6, 1.3, 2.6, C.glass2);
    q(cx + hw - 2.6, cx + hw - 1, 1.3, 2.6, C.glass2);
  }
  addCol(cx - hw, cz - hd, cx + hw, cz + hd, h + 2);
  if(R() < 0.8) tree(x0 + 2.5, z0 + 2.5, 0.8);
  return { cx, cz, hd };
}

function buildCity(){
  // chão e ruas
  city.ground(-600, -600, SIZE + 600, SIZE + 600, -0.02, C.grass);
  city.ground(0, 0, SIZE, SIZE, 0, C.asphalt);
  // faixas amarelas tracejadas e faixas de pedestre
  for(let i = 0; i <= NB; i++){
    const c = rc(i);
    for(let b = 0; b < NB; b++){
      const s0 = bx0(b);
      for(let s = s0 + 3; s < s0 + BLOCK - 3; s += 6){
        city.ground(s, c - 0.13, s + 3, c + 0.13, 0.02, C.yellow);
        city.ground(c - 0.13, s, c + 0.13, s + 3, 0.02, C.yellow);
      }
      for(let k = -3; k <= 3; k++){
        const off = k * 2;
        city.ground(s0 + 1, c + off - 0.45, s0 + 3.5, c + off + 0.45, 0.02, C.white);
        city.ground(s0 + BLOCK - 3.5, c + off - 0.45, s0 + BLOCK - 1, c + off + 0.45, 0.02, C.white);
        city.ground(c + off - 0.45, s0 + 1, c + off + 0.45, s0 + 3.5, 0.02, C.white);
        city.ground(c + off - 0.45, s0 + BLOCK - 3.5, c + off + 0.45, s0 + BLOCK - 1, 0.02, C.white);
      }
    }
  }
  // borda da cidade
  addCol(-20, -20, SIZE + 20, -1, 10); addCol(-20, SIZE + 1, SIZE + 20, SIZE + 20, 10);
  addCol(-20, -20, -1, SIZE + 20, 10); addCol(SIZE + 1, -20, SIZE + 20, SIZE + 20, 10);
  for(let k = 0; k < SIZE; k += 9){ for(const [x, z] of [[k, -6], [k, SIZE + 6], [-6, k], [SIZE + 6, k]]) { city.box(x - 0.2, 0, z - 0.2, x + 0.2, 1.4, z + 0.2, hex("#8A8F98")); } }
  city.box(-2, 0, -2, SIZE + 2, 0.9, -1.4, hex("#B7BCC4")); city.box(-2, 0, SIZE + 1.4, SIZE + 2, 0.9, SIZE + 2, hex("#B7BCC4"));
  city.box(-2, 0, -2, -1.4, 0.9, SIZE + 2, hex("#B7BCC4")); city.box(SIZE + 1.4, 0, -2, SIZE + 2, 0.9, SIZE + 2, hex("#B7BCC4"));
  for(let k = 0; k < 40; k++){ const a = k / 40 * Math.PI * 2, r = 330 + R() * 60; tree(SIZE / 2 + Math.cos(a) * r, SIZE / 2 + Math.sin(a) * r, 1.6 + R()); }

  for(let bz = 0; bz < NB; bz++) for(let bx = 0; bx < NB; bx++){
    const t = LAYOUT[bz][bx], X0 = bx0(bx), Z0 = bx0(bz), X1 = X0 + BLOCK, Z1 = Z0 + BLOCK;
    city.box(X0, 0, Z0, X1, 0.25, Z1, C.walk);
    const ix0 = X0 + 4, iz0 = Z0 + 4, ix1 = X1 - 4, iz1 = Z1 - 4, mx = (X0 + X1) / 2, mz = (Z0 + Z1) / 2;
    // postes de luz nas esquinas
    for(const [x, z] of [[X0 + 1.5, Z0 + 1.5], [X1 - 1.5, Z0 + 1.5], [X0 + 1.5, Z1 - 1.5], [X1 - 1.5, Z1 - 1.5]]){
      city.box(x - 0.12, 0.25, z - 0.12, x + 0.12, 6, z + 0.12, hex("#5A5F68"));
      city.box(x - 0.4, 6, z - 0.4, x + 0.4, 6.35, z + 0.4, hex("#FFF2B0"));
    }
    if(R() < 0.6) starSpots.push([X0 + 2 + R() * 52, Z0 + 2]);
    const q = [[ix0, iz0, mx - 1, mz - 1], [mx + 1, iz0, ix1, mz - 1], [ix0, mz + 1, mx - 1, iz1], [mx + 1, mz + 1, ix1, iz1]];
    if(t === "H"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      q.forEach((l, k) => { const h = house(...l); houseDoors.push({ x: h.cx, z: k < 2 ? Z0 - 1 : Z1 + 1, side: k < 2 ? -1 : 1 }); });
    } else if(t === "B"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      q.forEach(l => { const m = 1.5 + R() * 2; building(l[0] + m, l[1] + m, l[2] - m, l[3] - m, 10 + R() * 16, pick(R, BCOL)); });
    } else if(t === "T"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      if(R() < 0.5){ building(ix0 + 3, iz0 + 3, ix1 - 3, iz1 - 3, 40 + R() * 30, pick(R, BCOL)); }
      else { building(ix0 + 1, iz0 + 1, mx - 2, iz1 - 1, 30 + R() * 35, pick(R, BCOL)); building(mx + 2, iz0 + 1, ix1 - 1, mz - 2, 25 + R() * 30, pick(R, BCOL)); tree(mx + 10, mz + 10); }
    } else if(t === "R" || t === "C"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      building(ix0 + 2, iz0 + 2, mx - 2, mz - 2, 14 + R() * 10, pick(R, BCOL));
      building(mx + 2, iz0 + 2, ix1 - 2, mz - 2, 12 + R() * 12, pick(R, BCOL));
      const shop = t === "R", wall = shop ? hex("#FFE3EE") : hex("#DFF7F3"), acc = shop ? hex("#FF5D8F") : hex("#19C3B0");
      city.box(ix0 + 4, 0.25, mz + 6, ix1 - 4, 6.5, iz1 - 1, wall, { top: acc });
      city.box(ix0 + 4, 4.4, iz1 - 1, ix1 - 4, 4.8, iz1 + 0.8, acc);
      city.quad([mx - 12, 5, iz1 - 0.9], [mx + 12, 5, iz1 - 0.9], [mx + 12, 6.3, iz1 - 0.9], [mx - 12, 6.3, iz1 - 0.9], [0, 0, 1], ONE, shop ? UVS.roupas : UVS.salao);
      city.quad([mx - 10, 0.3, iz1 - 0.95], [mx - 2, 0.3, iz1 - 0.95], [mx - 2, 3.8, iz1 - 0.95], [mx - 10, 3.8, iz1 - 0.95], [0, 0, 1], C.glass2);
      city.quad([mx + 2, 0.3, iz1 - 0.95], [mx + 10, 0.3, iz1 - 0.95], [mx + 10, 3.8, iz1 - 0.95], [mx + 2, 3.8, iz1 - 0.95], [0, 0, 1], C.glass2);
      city.quad([mx - 1.2, 0.3, iz1 - 0.95], [mx + 1.2, 0.3, iz1 - 0.95], [mx + 1.2, 3, iz1 - 0.95], [mx - 1.2, 3, iz1 - 0.95], [0, 0, 1], hex("#6B4A2E"));
      // manequins na vitrine / cadeira de salão
      for(const x of [mx - 7, mx - 4.5, mx + 4.5, mx + 7]){ city.box(x - 0.3, 0.3, iz1 - 2.2, x + 0.3, 1.9, iz1 - 1.6, shop ? pick(R, BCOL) : hex("#2A2D33")); city.box(x - 0.2, 1.9, iz1 - 2.1, x + 0.2, 2.3, iz1 - 1.7, hex("#E8D5C0")); }
      addCol(ix0 + 4, mz + 6, ix1 - 4, iz1 - 1, 6.5);
      if(shop) places.roupas = { x: mx, z: Z1 + 1, name: "Loja de roupas" }; else places.salao = { x: mx, z: Z1 + 1, name: "Cabeleireiro" };
    } else if(t === "A"){
      city.ground(ix0, iz0, ix1, iz1, 0.26, C.grass2);
      city.box(ix0 + 4, 0.26, iz0 + 3, ix1 - 4, 3.2, iz0 + 5, hex("#B8A27A"));
      addCol(ix0 + 4, iz0 + 3, ix1 - 4, iz0 + 5, 3.2);
      city.ground(ix0 + 4, iz1 - 9, ix1 - 4, iz1 - 8.6, 0.27, C.white);
      city.box(mx - 0.2, 0.26, iz1 - 2, mx + 0.2, 4, iz1 - 1.6, hex("#5A5F68"));
      city.box(mx - 9, 3.6, iz1 - 2, mx + 9, 5.2, iz1 - 1.7, hex("#2B3A55"), { uvF: UVS.estande, uvB: UVS.estande });
      for(let k = 0; k < 6; k++) targetSpots.push({ x: ix0 + 9 + k * 7.6, z: iz0 + 12 + (k % 2) * 6 });
      places.estande = { x: mx, z: Z1 + 1, name: "Estande de tiro" };
      for(const x of [ix0 + 2, ix1 - 2]) tree(x, mz, 0.9);
    } else if(t === "P" || t === "L"){
      city.ground(ix0, iz0, ix1, iz1, 0.26, C.grass2);
      if(t === "L"){
        city.ground(ix0 + 6, iz0 + 6, ix1 - 6, iz1 - 6, 0.28, C.water);
        addCol(ix0 + 6, iz0 + 6, ix1 - 6, iz1 - 6, 0.5);
        places.lago = { x: mx, z: Z0 - 1, name: "Lago" };
        for(let k = 0; k < 10; k++){ const a = k / 10 * Math.PI * 2; tree(mx + Math.cos(a) * 24, mz + Math.sin(a) * 24, 0.9); }
      } else {
        city.ground(mx - 1.5, iz0, mx + 1.5, iz1, 0.27, C.lot); city.ground(ix0, mz - 1.5, ix1, mz + 1.5, 0.27, C.lot);
        for(let k = 0; k < 9; k++) tree(ix0 + 4 + R() * 40, iz0 + 4 + R() * 40, 0.9 + R() * 0.4);
        for(let k = 0; k < 4; k++){ const bxx = mx + (k < 2 ? -6 : 4), bzz = mz + (k % 2 ? 3 : -4); city.box(bxx, 0.26, bzz, bxx + 2, 0.8, bzz + 0.7, hex("#8B5A2B")); }
        if(!places.parque) places.parque = { x: mx, z: Z1 + 1, name: "Parque" };
        starSpots.push([mx + 0.5, mz + 0.5]);
      }
    } else if(t === "Q"){
      city.ground(ix0, iz0, ix1, iz1, 0.26, hex("#E3D9C6"));
      city.cyl(mx, mz, 5, 0.26, 1.1, 16, hex("#B7BCC4")); city.cyl(mx, mz, 4.2, 0.27, 1.12, 16, C.water);
      city.cyl(mx, mz, 0.6, 1, 3.4, 8, hex("#D8DCE2"));
      addCol(mx - 5, mz - 5, mx + 5, mz + 5, 1.2);
      for(let k = 0; k < 8; k++){ const a = k / 8 * Math.PI * 2; tree(mx + Math.cos(a) * 17, mz + Math.sin(a) * 17, 0.85); }
      city.box(mx - 9, 0.26, iz1 - 2, mx - 8.6, 4.5, iz1 - 1.6, hex("#5A5F68")); city.box(mx + 8.6, 0.26, iz1 - 2, mx + 9, 4.5, iz1 - 1.6, hex("#5A5F68"));
      city.box(mx - 9.2, 3, iz1 - 2, mx + 9.2, 4.6, iz1 - 1.7, hex("#6B3FA0"), { uvF: UVS.praca, uvB: UVS.praca });
      places.praca = { x: mx, z: Z1 + 1, name: "Praça" };
      places.taxiStand = { x: mx + 10, z: Z1 + 2 };
      starSpots.push([mx + 7, mz + 7]);
    } else if(t === "S"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      const sz0 = iz1 - 15;
      city.box(ix0 + 2, 0.25, sz0, ix1 - 2, 12, iz1 - 1, hex("#F2EAD8"), { top: hex("#C9C2B2") });
      city.box(ix0 + 2, 0.25, sz0, ix1 - 2, 1.4, iz1 - 0.9, hex("#1B3A8C"));
      windows(city, ix0 + 2, 0.25, sz0, ix1 - 2, 12, iz1 - 1, C.glass);
      city.quad([mx - 16, 8.6, iz1 - 0.9], [mx + 16, 8.6, iz1 - 0.9], [mx + 16, 11.4, iz1 - 0.9], [mx - 16, 11.4, iz1 - 0.9], [0, 0, 1], ONE, UVS.school);
      addCol(ix0 + 2, sz0, ix1 - 2, iz1 - 1, 12);
      // quadra
      city.ground(ix0 + 4, iz0 + 3, ix1 - 4, sz0 - 4, 0.27, hex("#2F7D5B"));
      city.ground(mx - 0.15, iz0 + 3, mx + 0.15, sz0 - 4, 0.28, C.white);
      city.box(ix0 + 4.5, 0.27, (iz0 + sz0) / 2 - 4, ix0 + 5, 3, (iz0 + sz0) / 2 + 4, C.white); city.box(ix1 - 5, 0.27, (iz0 + sz0) / 2 - 4, ix1 - 4.5, 3, (iz0 + sz0) / 2 + 4, C.white);
      city.box(ix0 + 1, 0.27, iz0 + 1, ix0 + 1.25, 11, iz0 + 1.25, hex("#C9CDD3")); city.box(ix0 + 1.25, 8.8, iz0 + 1.12, ix0 + 4.6, 10.8, iz0 + 1.14, hex("#1E8A45"));
      places.escola = { x: mx, z: Z1 + 1, name: "Escola CETI" };
      places.spawn = { x: mx, z: Z1 + 2.5 };
    } else if(t === "D"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, hex("#9AA0A8"));
      city.box(ix0 + 2, 0.25, iz0 + 2, ix1 - 2, 10, iz0 + 18, hex("#E6EBF2"), { top: hex("#B0B8C4") });
      city.box(ix0 + 2, 6.5, iz0 + 2, ix1 - 2, 7.4, iz0 + 18.05, hex("#1B4FD8"));
      windows(city, ix0 + 2, 0.25, iz0 + 2, ix1 - 2, 6.3, iz0 + 18, C.glass);
      city.quad([mx - 8, 7.6, iz0 + 18.1], [mx + 8, 7.6, iz0 + 18.1], [mx + 8, 9.8, iz0 + 18.1], [mx - 8, 9.8, iz0 + 18.1], [0, 0, 1], ONE, UVS.police);
      addCol(ix0 + 2, iz0 + 2, ix1 - 2, iz0 + 18, 10);
      for(let k = 0; k < 5; k++) city.ground(ix0 + 4 + k * 9, iz0 + 22, ix0 + 4.2 + k * 9, iz0 + 30, 0.27, C.white);
      places.delegacia = { x: mx, z: Z1 + 1, name: "Delegacia" };
      places.policeSpot = [{ x: ix0 + 8.5, z: iz0 + 26, h: Math.PI }, { x: ix0 + 17.5, z: iz0 + 26, h: Math.PI }];
      places.policeStart = { x: mx, z: Z1 + 2 };
    } else if(t === "Z"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, C.lot);
      building(ix0 + 2, iz0 + 2, mx - 2, mz - 2, 16 + R() * 8, pick(R, BCOL));
      building(mx + 2, iz0 + 2, ix1 - 2, mz - 2, 12 + R() * 8, pick(R, BCOL));
      city.box(ix0 + 4, 0.25, mz + 6, ix1 - 4, 6, iz1 - 1, hex("#F7E3C6"), { top: hex("#C8261E") });
      city.box(ix0 + 4, 4.2, iz1 - 1, ix1 - 4, 4.6, iz1 + 0.6, hex("#C8261E"));
      city.quad([mx - 9, 4.7, iz1 - 0.9], [mx + 9, 4.7, iz1 - 0.9], [mx + 9, 5.9, iz1 - 0.9], [mx - 9, 5.9, iz1 - 0.9], [0, 0, 1], ONE, UVS.pizza);
      city.quad([mx - 6, 0.3, iz1 - 0.95], [mx + 6, 0.3, iz1 - 0.95], [mx + 6, 3.6, iz1 - 0.95], [mx - 6, 3.6, iz1 - 0.95], [0, 0, 1], C.glass2);
      addCol(ix0 + 4, mz + 6, ix1 - 4, iz1 - 1, 6);
      places.pizzaria = { x: mx, z: Z1 + 1, name: "Pizzaria" };
      places.vanSpot = { x: ix0 + 7, z: mz + 2.5, h: Math.PI / 2 };
    } else if(t === "G"){
      city.ground(ix0, iz0, ix1, iz1, 0.255, hex("#B8BCC4"));
      city.box(mx - 12, 6, mz - 7, mx + 12, 6.8, mz + 7, hex("#1E8A45"), { side: hex("#F2F2F2") });
      for(const [x, z] of [[mx - 10, mz - 5], [mx + 10, mz - 5], [mx - 10, mz + 5], [mx + 10, mz + 5]]){ city.box(x - 0.3, 0.25, z - 0.3, x + 0.3, 6, z + 0.3, hex("#E6E6E6")); addCol(x - 0.3, z - 0.3, x + 0.3, z + 0.3, 6); }
      for(const x of [mx - 4, mx + 4]){ city.box(x - 0.6, 0.25, mz - 0.4, x + 0.6, 1.9, mz + 0.4, hex("#E23B3B")); addCol(x - 0.6, mz - 0.4, x + 0.6, mz + 0.4, 2); }
      city.box(ix0 + 2, 0.25, iz0 + 2, ix0 + 16, 4.5, iz0 + 12, hex("#F2F2F2"), { top: hex("#1E8A45") });
      addCol(ix0 + 2, iz0 + 2, ix0 + 16, iz0 + 12, 4.5);
      city.box(ix1 - 6, 0.25, iz1 - 3, ix1 - 5.6, 9, iz1 - 2.6, hex("#5A5F68"));
      city.box(ix1 - 9, 6.5, iz1 - 2.6, ix1 - 2.6, 9, iz1 - 2.4, hex("#1E8A45"), { uvF: UVS.posto, uvB: UVS.posto });
      places.posto = { x: mx, z: Z1 + 1, name: "Posto" };
      places.raceSpot = { x: mx, z: mz + 9, h: 0 };
    }
    lots.push({ t, X0, Z0, X1, Z1 });
  }
  // outdoors no topo de alguns prédios
  let k = 0;
  for(const c of colliders){ if(c.h > 30 && k < 6){ const uv = k % 2 ? UVS.bill1 : UVS.bill2, cx = (c.x0 + c.x1) / 2; city.box(cx - 0.2, c.h, c.z1 - 1.5, cx + 0.2, c.h + 3, c.z1 - 1.1, hex("#5A5F68")); city.quad([cx - 7, c.h + 3, c.z1 - 1], [cx + 7, c.h + 3, c.z1 - 1], [cx + 7, c.h + 7.5, c.z1 - 1], [cx - 7, c.h + 7.5, c.z1 - 1], [0, 0, 1], ONE, uv); k++; } }
  // vagas de estacionamento na beira das ruas
  for(let n = 0; n < 16; n++){
    const i = 1 + Math.floor(R() * (NB - 1)), b = Math.floor(R() * NB), along = bx0(b) + 10 + R() * 36, side = R() < 0.5 ? -1 : 1, horiz = R() < 0.5;
    parkedSpots.push(horiz ? { x: along, z: rc(i) + side * 6.4, h: side > 0 ? Math.PI / 2 : -Math.PI / 2 } : { x: rc(i) + side * 6.4, z: along, h: side > 0 ? Math.PI : 0 });
  }
}
buildCity();
const cityMesh = upload(city);
city.a = null;

/* ---------- malhas reutilizáveis ---------- */
const cubeG = new Geo(); cubeG.box(-0.5, 0, -0.5, 0.5, 1, 0.5, ONE, { tint: 1, bottom: 1 });
const CUBE = upload(cubeG);
const markG = new Geo(); markG.cyl(0, 0, 1, 0, 1, 24, ONE, 1, true);
const MARK = upload(markG);
const shadowG = new Geo(); shadowG.ground(-0.5, -0.5, 0.5, 0.5, 0.04, ONE);
const SHADOW = upload(shadowG);
const starG = new Geo();
(() => { const pts = []; for(let i = 0; i < 10; i++){ const a = i / 10 * Math.PI * 2, r = i % 2 ? 0.45 : 1; pts.push([Math.sin(a) * r, Math.cos(a) * r]); }
  for(let i = 0; i < 10; i++){ const a = pts[i], b = pts[(i + 1) % 10]; starG.tri([0, 0, 0.18], [a[0], a[1], 0], [b[0], b[1], 0], [0, 0, 1], ONE, 1); starG.tri([0, 0, -0.18], [b[0], b[1], 0], [a[0], a[1], 0], [0, 0, -1], ONE, 1); } })();
const STAR = upload(starG);
const arrowG = new Geo();
arrowG.tri([0, 0, 1.6], [-1, 0, -0.6], [0, 0, -0.1], [0, 1, 0], ONE, 1); arrowG.tri([0, 0, 1.6], [0, 0, -0.1], [1, 0, -0.6], [0, 1, 0], ONE, 1);
arrowG.tri([0, 0, 1.6], [0, 0, -0.1], [-1, 0, -0.6], [0, -1, 0], ONE, 1); arrowG.tri([0, 0, 1.6], [1, 0, -0.6], [0, 0, -0.1], [0, -1, 0], ONE, 1);
const ARROW = upload(arrowG);
const targetG = new Geo();
targetG.box(-0.08, 0, -0.08, 0.08, 1.2, 0.08, hex("#6B4423"));
targetG.box(-0.75, 1.2, -0.08, 0.75, 2.7, 0.04, hex("#C9B48A"));
targetG.quad([-0.7, 1.25, 0.05], [0.7, 1.25, 0.05], [0.7, 2.65, 0.05], [-0.7, 2.65, 0.05], [0, 0, 1], ONE, UVS.alvo);
const TARGET = upload(targetG);

function carMesh(type){
  const g = new Geo(), W = 1.0, L = 2.25;
  const dark = hex("#1C1F24"), glass = hex("#22303F"), lamp = hex("#FFF2B0"), red = hex("#D11A2A");
  const van = type === "van", sport = type === "sport";
  g.box(-W, 0.35, -L, W, van ? 1.2 : 1.0, L, ONE, { tint: 1 });
  if(van){ g.box(-0.98, 1.2, -L, 0.98, 2.5, 1.1, ONE, { tint: 1 }); g.box(-0.9, 1.2, 1.1, 0.9, 2.1, 1.25, glass); }
  else if(sport){ g.box(-0.8, 1.0, -1.1, 0.8, 1.5, 0.7, ONE, { tint: 1 }); g.box(-0.95, 1.2, -2.25, 0.95, 1.3, -1.95, dark); g.box(-0.85, 1.0, -2.2, -0.75, 1.2, -2.0, dark); g.box(0.75, 1.0, -2.2, 0.85, 1.2, -2.0, dark); }
  else g.box(-0.85, 1.0, -1.2, 0.85, 1.7, 1.0, ONE, { tint: 1 });
  // vidros
  const cy0 = van ? 1.35 : 1.06, cy1 = van ? 2.1 : sport ? 1.45 : 1.64, cz0 = van ? -2.0 : sport ? -1.05 : -1.15, cz1 = van ? 1.05 : sport ? 0.65 : 0.95, cw = van ? 0.99 : sport ? 0.81 : 0.86;
  g.quad([-cw + 0.08, cy0, cz1 + 0.02], [cw - 0.08, cy0, cz1 + 0.02], [cw - 0.08, cy1, cz1 + 0.02], [-cw + 0.08, cy1, cz1 + 0.02], [0, 0, 1], glass);
  if(!van) g.quad([cw - 0.08, cy0, cz0 - 0.02], [-cw + 0.08, cy0, cz0 - 0.02], [-cw + 0.08, cy1, cz0 - 0.02], [cw - 0.08, cy1, cz0 - 0.02], [0, 0, -1], glass);
  for(const sx of [1, -1]){ const x = sx * (cw + 0.01); const a = sx > 0 ? [[x, cy0, cz1 - 0.1], [x, cy0, cz0 + 0.1]] : [[x, cy0, cz0 + 0.1], [x, cy0, cz1 - 0.1]]; g.quad(a[0], a[1], [a[1][0], cy1, a[1][2]], [a[0][0], cy1, a[0][2]], [sx, 0, 0], glass); }
  // rodas
  for(const [x, z] of [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]]) g.box(x - 0.18, 0, z - 0.38, x + 0.18, 0.72, z + 0.38, dark);
  // faróis e lanternas
  g.quad([-0.9, 0.6, L + 0.02], [-0.5, 0.6, L + 0.02], [-0.5, 0.85, L + 0.02], [-0.9, 0.85, L + 0.02], [0, 0, 1], lamp);
  g.quad([0.5, 0.6, L + 0.02], [0.9, 0.6, L + 0.02], [0.9, 0.85, L + 0.02], [0.5, 0.85, L + 0.02], [0, 0, 1], lamp);
  g.quad([0.9, 0.6, -L - 0.02], [0.5, 0.6, -L - 0.02], [0.5, 0.85, -L - 0.02], [0.9, 0.85, -L - 0.02], [0, 0, -1], red);
  g.quad([-0.5, 0.6, -L - 0.02], [-0.9, 0.6, -L - 0.02], [-0.9, 0.85, -L - 0.02], [-0.5, 0.85, -L - 0.02], [0, 0, -1], red);
  g.box(-W - 0.02, 0.3, L - 0.1, W + 0.02, 0.5, L + 0.08, dark); g.box(-W - 0.02, 0.3, -L - 0.08, W + 0.02, 0.5, -L + 0.1, dark);
  if(type === "taxi"){ g.box(-0.35, 1.7, -0.25, 0.35, 2.0, 0.25, hex("#1B1B1B"), { uvF: UVS.taxi, uvB: UVS.taxi }); }
  if(type === "police"){
    for(const sx of [1, -1]){ const x = sx * (W + 0.015); const a = sx > 0 ? [[x, 0.45, 1.6], [x, 0.45, -1.6]] : [[x, 0.45, -1.6], [x, 0.45, 1.6]]; g.quad(a[0], a[1], [a[1][0], 0.95, a[1][2]], [a[0][0], 0.95, a[0][2]], [sx, 0, 0], ONE, UVS.polcar); }
    g.box(-0.6, 1.7, -0.15, 0.6, 1.78, 0.15, dark);
  }
  if(van){ for(const sx of [1, -1]){ const x = sx * 0.99; const a = sx > 0 ? [[x, 1.45, 0.6], [x, 1.45, -1.9]] : [[x, 1.45, -1.9], [x, 1.45, 0.6]]; g.quad(a[0], a[1], [a[1][0], 2.25, a[1][2]], [a[0][0], 2.25, a[0][2]], [sx, 0, 0], ONE, UVS.pizcar); } }
  return upload(g);
}
const CARM = { sedan: carMesh("sedan"), taxi: carMesh("taxi"), police: carMesh("police"), van: carMesh("van"), sport: carMesh("sport") };
uploadAtlas();

/* =========================================================
   VEÍCULOS, TRÂNSITO E PEDESTRES
   ========================================================= */
const CAR_COLS = ["#E23B3B", "#2E66FF", "#F2F2F2", "#1C1F24", "#2EB872", "#FF8A1F", "#8A5CFF", "#9AA3B2", "#00B3B3", "#C2185B"].map(hex);
const TYPES = {
  sedan: { max: 29, acc: 10, grip: 8, steer: 1.9 },
  taxi: { max: 29, acc: 10, grip: 8, steer: 1.9 },
  police: { max: 36, acc: 13, grip: 9, steer: 2.0 },
  van: { max: 25, acc: 8, grip: 7, steer: 1.7 },
  sport: { max: 42, acc: 15, grip: 10, steer: 2.1 },
};
const cars = [];
function makeCar(type, x, z, h, col, ai){ const c = { type, x, z, h, vx: 0, vz: 0, col: col || pick(R, CAR_COLS), ai: ai || null, mesh: CARM[type], siren: false, stun: 0, home: { x, z, h } }; cars.push(c); return c; }
const fwd = h => [Math.sin(h), Math.cos(h)];
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const dirAng = d => Math.atan2(DIRS[d][0], DIRS[d][1]);
// trânsito: anda pelas faixas da direita de um cruzamento a outro
function lanePt(ix, iz, d, edge){ const [fx, fz] = DIRS[d], rx = -fz, rz = fx; return [rc(ix) + fx * edge + rx * 3.5, rc(iz) + fz * edge + rz * 3.5]; }
function validDirs(ix, iz){ return [0, 1, 2, 3].filter(d => { const nx = ix + DIRS[d][0], nz = iz + DIRS[d][1]; return nx >= 0 && nz >= 0 && nx <= NB && nz <= NB; }); }
function setLine(c){ const p0 = lanePt(c.ix, c.iz, c.d, 8), nx = c.ix + DIRS[c.d][0], nz = c.iz + DIRS[c.d][1], p1 = lanePt(nx, nz, (c.d + 2) % 4, 8); const p1b = [p1[0] + DIRS[(c.d + 2) % 4][0] * 0, p1[1]]; c.piece = { t: "L", p0, p1: lanePt(nx, nz, c.d, -8), len: 0 }; c.piece.len = hypot(c.piece.p1[0] - p0[0], c.piece.p1[1] - p0[1]); c.s = 0; c.ix = nx; c.iz = nz; }
function chooseTurn(c, prefer){
  const opts = validDirs(c.ix, c.iz).filter(d => d !== (c.d + 2) % 4);
  let nd = opts.length ? pick(Math.random, opts) : (c.d + 2) % 4;
  if(prefer) nd = prefer(opts) ?? nd;
  const p0 = c.piece.p1, p1 = lanePt(c.ix, c.iz, nd, 8);
  const [fx, fz] = DIRS[c.d], [nfx, nfz] = DIRS[nd];
  let ctrl;
  if(nd === c.d) ctrl = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
  else if(nd === (c.d + 2) % 4) ctrl = [rc(c.ix) + fx * 10, rc(c.iz) + fz * 10];
  else ctrl = [rc(c.ix) + (-fz) * 3.5 + (-nfz) * 3.5, rc(c.iz) + fx * 3.5 + nfx * 3.5];
  let len = 0, px = p0[0], pz = p0[1];
  for(let k = 1; k <= 8; k++){ const t = k / 8, q = bez(p0, ctrl, p1, t); len += hypot(q[0] - px, q[1] - pz); px = q[0]; pz = q[1]; }
  c.piece = { t: "C", p0, c: ctrl, p1, len }; c.s = 0; c.d = nd;
}
function bez(a, c, b, t){ const u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; }
function piecePos(p, s){
  const t = clamp(s / p.len, 0, 1);
  if(p.t === "L") return [lerp(p.p0[0], p.p1[0], t), lerp(p.p0[1], p.p1[1], t), Math.atan2(p.p1[0] - p.p0[0], p.p1[1] - p.p0[1])];
  const a = bez(p.p0, p.c, p.p1, t), b = bez(p.p0, p.c, p.p1, Math.min(1, t + 0.02)), a2 = t > 0.98 ? bez(p.p0, p.c, p.p1, t - 0.02) : a;
  return [a[0], a[1], t > 0.98 ? Math.atan2(a[0] - a2[0], a[1] - a2[1]) : Math.atan2(b[0] - a[0], b[1] - a[1])];
}
function spawnTraffic(c){
  c.ix = Math.floor(Math.random() * (NB + 1)); c.iz = Math.floor(Math.random() * (NB + 1));
  const opts = validDirs(c.ix, c.iz); c.d = pick(Math.random, opts);
  setLine(c); c.s = Math.random() * c.piece.len * 0.8; c.v = 0; c.target = 9 + Math.random() * 4;
  const p = piecePos(c.piece, c.s); c.x = p[0]; c.z = p[1]; c.h = p[2];
}
function aiStep(c, dt, speedT, prefer){
  // obstáculos à frente
  const [fx, fz] = fwd(c.h);
  let limit = speedT;
  const check = (x, z, r) => { const dx = x - c.x, dz = z - c.z, along = dx * fx + dz * fz, side = Math.abs(-dx * fz + dz * fx); if(along > 0 && along < 14 && side < r) limit = Math.min(limit, Math.max(0, (along - 5.5) * 1.6)); };
  if(c.ai === "traffic"){
    for(const o of cars) if(o !== c && (o.ai || o === player.car)) check(o.x, o.z, 2.4);
    if(!player.car) check(player.x, player.z, 1.6);
    for(const p of peds) check(p.x, p.z, 1.4);
  }
  if(c.piece.t === "C") limit = Math.min(limit, c.ai === "bandit" ? 14 : 6.5);
  if(c.stun > 0){ c.stun -= dt; limit = 0; }
  c.v += clamp(limit - c.v, -18 * dt, (c.ai === "bandit" ? 14 : 6) * dt);
  c.s += c.v * dt;
  while(c.s >= c.piece.len){
    const rest = c.s - c.piece.len;
    if(c.piece.t === "L") chooseTurn(c, prefer); else setLine(c);
    c.s = rest;
  }
  const p = piecePos(c.piece, c.s);
  c.vx = (p[0] - c.x) / dt; c.vz = (p[1] - c.z) / dt;
  c.x = p[0]; c.z = p[1]; c.h = p[2];
}

const peds = [];
const SHIRTS = ["#E23B3B", "#2E66FF", "#FFC21A", "#2EB872", "#FF8A1F", "#8A5CFF", "#F2F2F2", "#00B3B3", "#FF5D8F"].map(hex);
const SKINS = ["#F1C27D", "#C68642", "#8D5524", "#E0AC69", "#FFDBAC"].map(hex);
function makePed(){
  const lot = lots[Math.floor(Math.random() * lots.length)];
  const p = { lot, s: Math.random() * 208, dir: Math.random() < 0.5 ? 1 : -1, sp: 1.2 + Math.random() * 0.5, shirt: pick(Math.random, SHIRTS), skin: pick(Math.random, SKINS), pants: pick(Math.random, ["#2B3A55", "#3B3B3B", "#5A4632", "#1F4E79"].map(hex)), off: 0, jump: 0, anim: Math.random() * 6, x: 0, z: 0, h: 0,
    hair: pick(Math.random, ["curto", "curto", "comprido", "careca", "black", "topete", "comprido"]), hairCol: pick(Math.random, ["#1A1410", "#3A2414", "#5A3A22", "#C9A35A", "#8A8A8A"].map(hex)), hat: Math.random() < 0.2 ? "bone" : null, hatCol: pick(Math.random, SHIRTS) };
  pedPos(p); peds.push(p);
}
function pedPos(p){
  const L0 = p.lot, x0 = L0.X0 + 2, z0 = L0.Z0 + 2, w = 52; let s = ((p.s % 208) + 208) % 208, x, z, h;
  if(s < w){ x = x0 + s; z = z0; h = Math.PI / 2; } else if(s < 2 * w){ x = x0 + w; z = z0 + (s - w); h = 0; } else if(s < 3 * w){ x = x0 + w - (s - 2 * w); z = z0 + w; h = -Math.PI / 2; } else { x = x0; z = z0 + w - (s - 3 * w); h = Math.PI; }
  if(p.dir < 0) h += Math.PI;
  // desvio para dentro do quarteirão
  const cx = L0.X0 + 28, cz = L0.Z0 + 28, dx = cx - x, dz = cz - z, l = hypot(dx, dz) || 1;
  p.x = x + dx / l * p.off; p.z = z + dz / l * p.off; p.h = h;
}

/* =========================================================
   JOGADOR
   ========================================================= */
const player = { x: 0, z: 0, y: 0, vy: 0, h: 0, car: null, anim: 0, moving: 0, gunT: 0 };
const targets = [], tracers = [];
let fireCD = 0, mouseHold = false, tFireDown = false, targetHits = 0;
let camYaw = 0, camPitch = 0.32, camLookT = 0, camDist = 6;
const stars = [];
let state = "start", paused = false, cash = 0, starsGot = 0, time = 0;
let best = { cash: 0, race: null };
try{ best = Object.assign(best, JSON.parse(localStorage.getItem("cidade-livre-v1") || "{}")); }catch(e){}
function saveBest(){ try{ localStorage.setItem("cidade-livre-v1", JSON.stringify(best)); }catch(e){} }

function setupWorld(){
  cars.length = 0; peds.length = 0; stars.length = 0;
  for(const s of parkedSpots) makeCar("sedan", s.x, s.z, s.h);
  for(const s of places.policeSpot) makeCar("police", s.x, s.z, s.h, hex("#F4F6FA")).mission = "police";
  const tx = makeCar("taxi", places.taxiStand.x, places.taxiStand.z, Math.PI / 2, hex("#FFC21A")); tx.mission = "taxi";
  const vn = makeCar("van", places.vanSpot.x, places.vanSpot.z, places.vanSpot.h, hex("#F2F2F2")); vn.mission = "pizza";
  const sp = makeCar("sport", places.raceSpot.x, places.raceSpot.z, places.raceSpot.h, hex("#E8202A")); sp.mission = "race";
  const nTraffic = IS_TOUCH ? 16 : 22;
  for(let k = 0; k < nTraffic; k++){ const c = makeCar(pick(Math.random, ["sedan", "sedan", "sedan", "taxi", "van"]), 0, 0, 0, null, "traffic"); if(c.type === "taxi") c.col = hex("#FFC21A"); spawnTraffic(c); }
  for(let k = 0; k < (IS_TOUCH ? 20 : 30); k++) makePed();
  const used = new Set();
  const r2 = rng(77);
  while(stars.length < 12 && used.size < starSpots.length){ const i = Math.floor(r2() * starSpots.length); if(used.has(i)) continue; used.add(i); stars.push({ x: starSpots[i][0], z: starSpots[i][1], got: false }); }
  targets.length = 0; for(const t of targetSpots) targets.push({ x: t.x, z: t.z, down: 0 });
  player.x = places.spawn.x; player.z = places.spawn.z; player.h = 0; player.car = null; player.y = 0; player.vy = 0; player.gunT = 0;
  camYaw = 0; cash = 200; starsGot = 0; mission = null; time = 0;
}

/* =========================================================
   MISSÕES
   ========================================================= */
const MARKERS = [
  { id: "police", label: "P", col: "#2E7BFF", place: () => places.delegacia, title: "Perseguição", tag: "Missão da polícia",
    text: "Bandidos fugiram de carro! Você é o policial: entre na viatura e alcance o carro preto. Bata nele 5 vezes, ou saia da viatura e atire nos pneus (3 tiros contam como 1 batida), antes que o tempo acabe." },
  { id: "taxi", label: "T", col: "#FFC21A", place: () => places.praca, title: "Táxi", tag: "Trabalho",
    text: "Pegue 3 passageiros e leve cada um ao destino antes que o tempo acabe. Pare perto do passageiro para ele entrar." },
  { id: "pizza", label: "E", col: "#FF6A1A", place: () => places.pizzaria, title: "Entregas", tag: "Trabalho",
    text: "Entregue 3 pizzas nas casas do bairro antes que esfriem. Siga a seta e pare em frente à casa marcada." },
  { id: "race", label: "C", col: "#B44CFF", place: () => places.posto, title: "Corrida", tag: "Desafio",
    text: "Passe pelos 8 pontos de controle roxos pelas ruas da cidade antes que o tempo acabe. Bata o seu recorde!" },
];
MARKERS.push(
  { id: "roupas", label: "L", col: "#FF5D8F", place: () => places.roupas, title: "Moda CETI", tag: "Loja de roupas", shop: true },
  { id: "salao", label: "✂", col: "#19C3B0", place: () => places.salao, title: "Cabeleireiro", tag: "Salão", shop: true },
  { id: "estande", label: "A", col: "#2B3A55", place: () => places.estande, title: "Estande de tiro", tag: "Diversão", info: true });
MARKERS.forEach(m => { m.c = hex(m.col); });
let mission = null, briefFor = null, blockMarker = null;

function near(a, b, r){ return hypot(a.x - b.x, a.z - b.z) < r; }
function playerPos(){ return player.car ? { x: player.car.x, z: player.car.z } : { x: player.x, z: player.z }; }
function streetSpot(minD, from){
  for(let k = 0; k < 60; k++){
    const i = Math.floor(Math.random() * (NB + 1)), b = Math.floor(Math.random() * NB), along = bx0(b) + 10 + Math.random() * 36, side = Math.random() < 0.5 ? -1 : 1;
    const p = Math.random() < 0.5 ? { x: along, z: rc(i) + side * 7.6 } : { x: rc(i) + side * 7.6, z: along };
    if(p.x < 4 || p.z < 4 || p.x > SIZE - 4 || p.z > SIZE - 4) continue;
    if(!from || hypot(p.x - from.x, p.z - from.z) > minD) return p;
  }
  return { x: rc(3), z: rc(3) + 7.6 };
}
function namedSpot(from){
  const list = ["escola", "delegacia", "pizzaria", "posto", "praca", "lago", "parque"].map(k => places[k]).filter(p => p && hypot(p.x - from.x, p.z - from.z) > 120);
  return list.length ? pick(Math.random, list) : places.praca;
}
function putInCar(c, x, z, h){
  if(player.car && player.car !== c) { player.car.vx = player.car.vz = 0; }
  c.x = x; c.z = z; c.h = h; c.vx = c.vz = 0; c.ai = null;
  player.car = c; camYaw = h;
}
function startMission(id){
  const m = MARKERS.find(k => k.id === id);
  const pl = m.place();
  if(id === "police"){
    const c = cars.find(k => k.mission === "police");
    putInCar(c, rc(1) + 3.5, pl.z + 6, Math.PI / 2); c.x = places.policeStart.x; c.z = rc(5) + 3.5; c.h = Math.PI / 2;
    c.siren = true;
    const b = makeCar("sport", 0, 0, 0, hex("#15161A"), "bandit");
    b.ix = Math.floor(c.x / PITCH) + 2; b.iz = 5; if(b.ix > NB) b.ix = NB - 1; b.d = 0; setLine(b); b.s = 4; b.v = 10; b.dmg = 0; b.hitCD = 0;
    const p = piecePos(b.piece, b.s); b.x = p[0]; b.z = p[1]; b.h = p[2];
    mission = { id, title: "Perseguição", t: 120, bandit: b, far: 0 };
  } else if(id === "taxi"){
    const c = cars.find(k => k.mission === "taxi");
    putInCar(c, places.taxiStand.x, places.taxiStand.z, Math.PI / 2);
    mission = { id, title: "Táxi", t: 45, n: 0, stage: "pick", target: streetSpot(80, playerPos()), earned: 0 };
  } else if(id === "pizza"){
    const c = cars.find(k => k.mission === "pizza");
    putInCar(c, pl.x, pl.z + 3.5, Math.PI / 2);
    const homes = []; const pool = houseDoors.slice().sort(() => Math.random() - 0.5);
    for(const h of pool){ if(homes.length >= 3) break; const p = { x: h.x, z: h.z + h.side * 0.5 }; if(hypot(p.x - pl.x, p.z - pl.z) > 70 && homes.every(o => hypot(o.x - p.x, o.z - p.z) > 60)) homes.push(p); }
    mission = { id, title: "Entregas", t: 150, n: 0, homes, target: homes[0], earned: 0 };
  } else if(id === "race"){
    const c = cars.find(k => k.mission === "race");
    putInCar(c, rc(3) + 3.5, places.posto.z + 6, 0); c.x = rc(3) + 3.5; c.z = rc(6) - 12; c.h = Math.PI;
    let ix = 3, iz = 5, d = 3; const cps = []; let len = 0, lx = c.x, lz = c.z;
    while(cps.length < 8){
      const opts = validDirs(ix, iz).filter(k => k !== (d + 2) % 4); d = pick(Math.random, opts);
      const steps = 1 + Math.floor(Math.random() * 2);
      for(let s = 0; s < steps; s++){ const nx = ix + DIRS[d][0], nz = iz + DIRS[d][1]; if(nx < 0 || nz < 0 || nx > NB || nz > NB) break; ix = nx; iz = nz; }
      const p = { x: rc(ix), z: rc(iz) }; if(cps.some(o => o.x === p.x && o.z === p.z)) continue;
      len += hypot(p.x - lx, p.z - lz); lx = p.x; lz = p.z; cps.push(p);
    }
    mission = { id, title: "Corrida", t: Math.round(len / 15 + 12), total: 0, cps, n: 0, target: cps[0] };
  }
  showMsg(m.title.toUpperCase(), id === "police" ? "Siga a seta vermelha!" : "Siga a seta amarela!", "", 2);
  sfx("start");
}
function endMission(ok, big, small){
  if(mission && mission.bandit){ const b = mission.bandit; b.ai = "busted"; setTimeout(() => { const i = cars.indexOf(b); if(i >= 0) cars.splice(i, 1); }, 6000); }
  if(player.car && player.car.siren) player.car.siren = false;
  mission = null; showMsg(big, small, ok ? "good" : "fail", 3);
  sfx(ok ? "win" : "fail");
  if(cash > best.cash){ best.cash = cash; saveBest(); }
}
function pay(v){ cash += v; sfx("cash"); }
function updateMission(dt){
  if(!mission) return;
  const m = mission, pp = playerPos();
  m.t -= dt;
  if(m.id === "police"){
    const b = m.bandit;
    let d = hypot(b.x - pp.x, b.z - pp.z);
    if(b.ai === "bandit"){
      aiStep(b, dt, 21, (opts) => { let bestD = -1, bd = null; for(const d of opts){ const nx = rc(b.ix + DIRS[d][0]), nz = rc(b.iz + DIRS[d][1]); const dd = hypot(nx - pp.x, nz - pp.z) + Math.random() * 40; if(dd > bestD){ bestD = dd; bd = d; } } return bd; });
      b.hitCD -= dt;
      d = hypot(b.x - pp.x, b.z - pp.z);
      if(player.car && d < 4.4 && b.hitCD <= 0){
        const rel = hypot(player.car.vx - b.vx, player.car.vz - b.vz);
        if(rel > 3){ b.dmg++; b.hitCD = 0.8; b.stun = 0.4; sfx("crash"); buzz(80); shake = 0.6; showMsg(b.dmg >= 5 ? "" : "BATIDA " + b.dmg + "/5", "", "good", 0.9); }
      }
      m.far = d > 260 ? m.far + dt : 0;
      if(b.dmg >= 5){ b.ai = "busted"; pay(500 + Math.round(m.t) * 5); endMission(true, "BANDIDOS PRESOS!", "+" + money(500 + Math.round(Math.max(0, m.t)) * 5)); return; }
      if(m.far > 6){ endMission(false, "ELES ESCAPARAM!", "Chegue mais perto da próxima vez"); return; }
    }
    m.target = b;
    setMission("Perseguição", `Bata no carro preto: ${b.dmg}/5 · distância ${Math.round(d)} m`, m.t);
  } else if(m.id === "taxi"){
    if(m.stage === "pick"){
      if(player.car && near(pp, m.target, 7) && carSpeed(player.car) < 4){ m.stage = "drop"; m.dest = namedSpot(pp); m.target = m.dest; m.t = Math.round(hypot(m.dest.x - pp.x, m.dest.z - pp.z) / 11 + 18); showMsg("PASSAGEIRO A BORDO", "Me leva para: " + m.dest.name + "!", "", 2); sfx("start"); }
      setMission("Táxi " + (m.n + 1) + "/3", "Busque o passageiro (seta amarela)", m.t);
    } else {
      if(player.car && near(pp, m.target, 9) && carSpeed(player.car) < 5){
        const v = 120 + Math.round(m.t) * 4; m.earned += v; pay(v); m.n++;
        if(m.n >= 3){ endMission(true, "TURNO DE TÁXI ENCERRADO!", "Você ganhou " + money(m.earned)); return; }
        m.stage = "pick"; m.target = streetSpot(80, pp); m.t = 45; showMsg("CORRIDA PAGA!", "+" + money(v), "good", 1.6);
      }
      setMission("Táxi " + (m.n + 1) + "/3", "Leve o passageiro para: " + m.dest.name, m.t);
    }
    if(m.t <= 0){ endMission(m.n > 0, m.n > 0 ? "FIM DO TURNO" : "O PASSAGEIRO DESISTIU", m.n > 0 ? "Você ganhou " + money(m.earned) : "Tente ser mais rápido"); return; }
  } else if(m.id === "pizza"){
    if(player.car && near(pp, m.target, 8) && carSpeed(player.car) < 5){
      const v = 100 + Math.round(m.t); m.earned += v; pay(v); m.n++;
      if(m.n >= 3){ endMission(true, "PIZZAS ENTREGUES!", "Você ganhou " + money(m.earned)); return; }
      m.target = m.homes[m.n]; showMsg("PIZZA ENTREGUE!", "+" + money(v), "good", 1.4);
    }
    setMission("Entregas " + (m.n + 1) + "/3", "Leve a pizza até a casa marcada", m.t);
    if(m.t <= 0){ endMission(m.n > 0, "AS PIZZAS ESFRIARAM", m.n > 0 ? "Você ganhou " + money(m.earned) : "Tente de novo"); return; }
  } else if(m.id === "race"){
    m.total += dt;
    if(near(pp, m.target, 9)){
      m.n++; sfx("check");
      if(m.n >= m.cps.length){
        const t = m.total, rec = best.race == null || t < best.race; if(rec){ best.race = t; saveBest(); }
        pay(300); endMission(true, rec ? "NOVO RECORDE!" : "CORRIDA COMPLETA!", "Tempo: " + t.toFixed(1) + " s · +" + money(300)); return;
      }
      m.target = m.cps[m.n]; m.t += 3;
    }
    setMission("Corrida " + m.n + "/" + m.cps.length, "Passe pelo ponto roxo" + (best.race ? " · recorde " + best.race.toFixed(1) + " s" : ""), m.t);
    if(m.t <= 0){ endMission(false, "TEMPO ESGOTADO!", "Tente de novo"); return; }
  }
  if(mission && mission.id === "police" && m.t <= 0){ endMission(false, "ELES ESCAPARAM!", "O tempo acabou"); return; }
  if(mission && !player.car) $("mText").textContent = mission.id === "police" ? "Atire no carro preto (3 tiros = 1 batida) ou volte para a viatura" : "Volte para o veículo!";
}
const carSpeed = c => hypot(c.vx, c.vz);
let mCache = "";
function setMission(title, text, t){
  const k = title + "|" + text + "|" + Math.ceil(t);
  if(k === mCache) return; mCache = k;
  $("mission").hidden = false; $("mTitle").textContent = title; $("mText").textContent = text; $("mTime").textContent = fmt(t); $("mTime").classList.toggle("low", t < 10);
}

/* =========================================================
   FÍSICA
   ========================================================= */
let shake = 0;
function shoot(){
  if(state !== "play" || paused || player.car || fireCD > 0) return;
  fireCD = 0.3; player.gunT = 4; player.h = camYaw;
  const [fx, fz] = fwd(camYaw), ox = player.x + fx * 0.6, oz = player.z + fz * 0.6;
  let hitD = 80, hit = null, kind = null;
  for(let s = 0.5; s < 80; s += 0.5){ const x = ox + fx * s, z = oz + fz * s; if(nearCols(x, z).some(c => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1 && c.h > 1.2)){ hitD = s; break; } }
  const ray = (x, z, r) => { const dx = x - ox, dz = z - oz, along = dx * fx + dz * fz; if(along < 0 || along > hitD) return -1; return Math.abs(-dx * fz + dz * fx) < r ? along : -1; };
  for(const t of targets){ if(t.down > 0) continue; const d = ray(t.x, t.z, 0.75); if(d >= 0){ hitD = d; hit = t; kind = "alvo"; } }
  for(const c of cars){ const d = ray(c.x, c.z, 1.7); if(d >= 0 && d < hitD){ hitD = d; hit = c; kind = "carro"; } }
  tracers.push({ x0: ox, z0: oz, x1: ox + fx * hitD, z1: oz + fz * hitD, t: 0.06 });
  sfx("shot"); buzz(12);
  // ninguém se machuca: as pessoas por perto só se assustam e pulam para o lado
  for(const p of peds) if(hypot(p.x - player.x, p.z - player.z) < 22){ p.jump = 0.7; p.dir = -p.dir; }
  if(kind === "alvo"){ hit.down = 3; targetHits++; pay(10); sfx("ding"); showMsg("", "Na mosca! +" + money(10) + " · acertos: " + targetHits, "good", 0.9); }
  else if(kind === "carro"){
    if(mission && mission.bandit === hit && hit.ai === "bandit"){
      hit.dmgF = (hit.dmgF || 0) + 0.34;
      if(hit.dmgF >= 1){ hit.dmgF -= 1; hit.dmg++; hit.stun = 0.6; sfx("crash"); if(hit.dmg < 5) showMsg("PNEU FURADO " + hit.dmg + "/5", "", "good", 0.9); }
      else sfx("clank");
    } else { if(hit.ai === "traffic"){ hit.stun = 2; honk(); } sfx("clank"); }
  }
}
function pushOut(o, r){
  let hit = false, nx = 0, nz = 0;
  for(const c of nearCols(o.x, o.z)){
    const qx = clamp(o.x, c.x0, c.x1), qz = clamp(o.z, c.z0, c.z1), dx = o.x - qx, dz = o.z - qz, d = hypot(dx, dz);
    if(d < r){
      if(d > 0.0001){ o.x = qx + dx / d * r; o.z = qz + dz / d * r; nx = dx / d; nz = dz / d; }
      else { const l = [o.x - c.x0, c.x1 - o.x, o.z - c.z0, c.z1 - o.z], i = l.indexOf(Math.min(...l)); if(i === 0){ o.x = c.x0 - r; nx = -1; } else if(i === 1){ o.x = c.x1 + r; nx = 1; } else if(i === 2){ o.z = c.z0 - r; nz = -1; } else { o.z = c.z1 + r; nz = 1; } }
      hit = true;
    }
  }
  return hit ? [nx, nz] : null;
}
function input(){
  const k = keys, j = joy.active ? joy : null;
  let fx = 0, fz = 0;
  if(k.w || k.arrowup) fz += 1; if(k.s || k.arrowdown) fz -= 1; if(k.a || k.arrowleft && player.car) fx -= 1; if(k.d || k.arrowright && player.car) fx += 1;
  if(j){ fx += j.x; fz += -j.y; }
  return { fx: clamp(fx, -1, 1), fz: clamp(fz, -1, 1), sprint: !!k.shift || (j && j.mag > 0.95), hb: !!k[" "] || tBrakeDown };
}
function updatePlayer(dt){
  const inp = input();
  if(!player.car){
    const cy = camYaw, [cfx, cfz] = fwd(cy), rx = -cfz, rz = cfx;
    let mx = cfx * inp.fz + rx * inp.fx, mz = cfz * inp.fz + rz * inp.fx; const m = hypot(mx, mz);
    const sp = (inp.sprint ? 8 : 4.6) * Math.min(1, m);
    if(player.gunT > 0) player.h += angDiff(camYaw - player.h) * Math.min(1, dt * 18);
    if(m > 0.08){ mx /= m; mz /= m; if(player.gunT <= 0) player.h += angDiff(Math.atan2(mx, mz) - player.h) * Math.min(1, dt * 12); player.x += mx * sp * dt; player.z += mz * sp * dt; player.anim += dt * sp * 2.2; }
    player.moving = m > 0.08 ? sp : 0;
    if(keys[" "] && player.y <= 0){ player.vy = 6; keys[" "] = false; }
    player.vy -= 18 * dt; player.y = Math.max(0, player.y + player.vy * dt); if(player.y <= 0) player.vy = 0;
    pushOut(player, 0.45);
    if(keys.arrowleft) camYaw += 2.2 * dt; if(keys.arrowright) camYaw -= 2.2 * dt;
  } else {
    const c = player.car, T0 = TYPES[c.type];
    const [fx, fz] = fwd(c.h), rx = -fz, rz = fx;
    let vF = c.vx * fx + c.vz * fz, vR = c.vx * rx + c.vz * rz;
    const thr = inp.fz;
    if(thr > 0.05){ vF += (vF < -0.5 ? 20 : T0.acc) * thr * dt; }
    else if(thr < -0.05){ vF += (vF > 0.5 ? -22 : -6) * -thr * dt; vF = Math.max(vF, -9); }
    else vF -= vF * 0.5 * dt;
    if(inp.hb) vF -= vF * 1.6 * dt;
    vF = Math.min(vF, T0.max);
    vF -= vF * 0.04 * dt;
    const st = inp.fx, sf = clamp(vF / 5, -1, 1) * (1 - 0.35 * Math.min(1, Math.abs(vF) / T0.max));
    c.h -= st * T0.steer * sf * dt;
    vR *= Math.exp(-(inp.hb ? 1.4 : T0.grip) * dt);
    c.vx = fx * vF + rx * vR; c.vz = fz * vF + rz * vR;
    c.x += c.vx * dt; c.z += c.vz * dt;
    const hit = pushOut(c, 1.7);
    if(hit){ const into = c.vx * hit[0] + c.vz * hit[1]; if(into < 0){ c.vx -= hit[0] * into * 1.4; c.vz -= hit[1] * into * 1.4; if(-into > 6){ sfx("crash"); shake = Math.min(0.8, -into / 25); buzz(60); } c.vx *= 0.8; c.vz *= 0.8; } }
    player.x = c.x; player.z = c.z;
    if(Math.abs(vF) > 26 && Math.abs(st) > 0.5 && Math.random() < 0.2) skid = 0.2;
  }
}
let skid = 0;
function carCollisions(){
  const pc = player.car;
  for(let i = 0; i < cars.length; i++){
    const a = cars[i];
    for(let j = i + 1; j < cars.length; j++){
      const b = cars[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = hypot(dx, dz);
      if(d < 3.6 && d > 0.001){
        const nx = dx / d, nz = dz / d, pen = 3.6 - d;
        const aDyn = a === pc || (!a.ai), bDyn = b === pc || (!b.ai);
        if(a === pc || b === pc){
          const me = a === pc ? a : b, other = a === pc ? b : a, s = a === pc ? -1 : 1;
          me.x += nx * pen * s; me.z += nz * pen * s;
          const vn = (me.vx - (other.ai ? other.vx : 0)) * nx * -s + (me.vz - (other.ai ? other.vz : 0)) * nz * -s;
          if(vn > 0){ me.vx -= nx * -s * vn * 1.3; me.vz -= nz * -s * vn * 1.3; if(vn > 5){ sfx("crash"); shake = Math.min(0.7, vn / 25); buzz(50); } }
          if(other.ai === "traffic"){ other.stun = 1.2; if(vn > 2) honk(); }
          if(!other.ai){ other.x -= nx * -s * pen * 0.5; other.z -= nz * -s * pen * 0.5; other.vx += nx * -s * -vn * 0.4; other.vz += nz * -s * -vn * 0.4; }
        } else if(aDyn !== bDyn){ const st = aDyn ? a : b, sg = aDyn ? -1 : 1; st.x += nx * pen * sg; st.z += nz * pen * sg; }
      }
    }
  }
  // carros parados que foram empurrados
  for(const c of cars) if(!c.ai && c !== pc && (c.vx || c.vz)){ c.x += c.vx * 0.016; c.z += c.vz * 0.016; c.vx *= 0.9; c.vz *= 0.9; if(Math.abs(c.vx) + Math.abs(c.vz) < 0.05) c.vx = c.vz = 0; pushOut(c, 1.7); }
}
let honkT = 0;
function honk(){ if(honkT <= 0){ sfx("honk"); honkT = 1.5; } }
function updatePeds(dt){
  for(const p of peds){
    p.s += p.sp * p.dir * dt; p.anim += dt * p.sp * 3;
    // pular para longe dos carros que vêm rápido
    let danger = false;
    for(const c of cars){ const sp = carSpeed(c); if(sp < 4) continue; const dx = p.x - c.x, dz = p.z - c.z, d = hypot(dx, dz); if(d < 9 && (dx * c.vx + dz * c.vz) > 0){ danger = true; break; } }
    if(danger){ p.jump = 0.7; }
    if(p.jump > 0){ p.jump -= dt; p.off = Math.min(6, p.off + dt * 14); }
    else p.off = Math.max(0, p.off - dt * 1.5);
    pedPos(p);
  }
}

/* =========================================================
   SOM
   ========================================================= */
let muted = false;
try{ muted = localStorage.getItem("cl-mute") === "1"; }catch(e){}
let ac = null, eng = null, sir = null;
function audioOn(){
  try{
    if(!ac){
      ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(); o.type = "sawtooth"; f.type = "lowpass"; f.frequency.value = 500; g.gain.value = 0;
      o.connect(f); f.connect(g); g.connect(ac.destination); o.start(); eng = { o, f, g };
      const so = ac.createOscillator(), sg = ac.createGain(); so.type = "square"; sg.gain.value = 0; so.connect(sg); sg.connect(ac.destination); so.start(); sir = { o: so, g: sg };
    }
    if(ac.state === "suspended") ac.resume();
  }catch(e){}
}
function tone(type, f0, f1, dur, vol, delay){
  if(muted || !ac) return;
  const t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
}
let nb = null;
function noise(dur, vol, f0, f1){
  if(muted || !ac) return;
  if(!nb){ nb = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nb.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = nb; f.type = "lowpass"; f.frequency.setValueAtTime(f0, t); f.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur + 0.02);
}
function sfx(k){
  switch(k){
    case "crash": noise(0.35, 0.4, 1200, 120); break;
    case "honk": tone("square", 420, 410, 0.25, 0.05); tone("square", 530, 520, 0.25, 0.04); break;
    case "cash": [880, 1320].forEach((f, i) => tone("triangle", f, f, 0.15, 0.1, i * 0.08)); break;
    case "check": tone("triangle", 700, 1400, 0.18, 0.1); break;
    case "star": [660, 880, 1320].forEach((f, i) => tone("triangle", f, f, 0.14, 0.09, i * 0.07)); break;
    case "start": [523, 659, 784].forEach((f, i) => tone("triangle", f, f, 0.16, 0.09, i * 0.09)); break;
    case "win": [523, 659, 784, 1046].forEach((f, i) => tone("triangle", f, f, 0.22, 0.11, i * 0.12)); break;
    case "fail": tone("sawtooth", 300, 90, 0.7, 0.08); break;
    case "door": noise(0.12, 0.2, 800, 300); break;
    case "shot": noise(0.12, 0.35, 2600, 300); tone("square", 220, 70, 0.08, 0.05); break;
    case "clank": tone("square", 1400, 900, 0.06, 0.05); break;
    case "ding": tone("triangle", 1320, 1320, 0.12, 0.1); tone("triangle", 1760, 1760, 0.15, 0.08, 0.08); break;
    case "buy": [660, 990].forEach((f, i) => tone("triangle", f, f, 0.12, 0.09, i * 0.07)); break;
  }
}
function audioTick(){
  if(!eng) return;
  const t = ac.currentTime, c = player.car, on = c && state === "play" && !paused && !muted;
  const sp = c ? carSpeed(c) : 0;
  eng.o.frequency.setTargetAtTime(50 + sp * 4.5 + (sp % 8) * 3, t, 0.05);
  eng.f.frequency.setTargetAtTime(300 + sp * 30, t, 0.1);
  eng.g.gain.setTargetAtTime(on ? 0.035 + sp * 0.0012 : 0, t, 0.1);
  const sOn = on && c.siren;
  sir.o.frequency.setTargetAtTime(Math.sin(t * 5) > 0 ? 960 : 720, t, 0.02);
  sir.g.gain.setTargetAtTime(sOn ? 0.018 : 0, t, 0.05);
}
function setMuteUI(){ $("btnSound").textContent = muted ? "🔇" : "🔊"; $("btnSound").setAttribute("aria-label", muted ? "Som desligado" : "Som ligado"); }

/* =========================================================
   DESENHO
   ========================================================= */
let W = 1, H = 1, DPR = 1, LOW = false;
function resize(){
  const r = stage.getBoundingClientRect();
  DPR = Math.min(window.devicePixelRatio || 1, LOW ? 1 : IS_TOUCH ? 1.5 : 2);
  W = Math.max(1, Math.round(r.width * DPR)); H = Math.max(1, Math.round(r.height * DPR));
  cv.width = W; cv.height = H; gl.viewport(0, 0, W, H);
  sizeRadar();
}
function drawPerson(x, y, z, h, anim, moving, L, aim){
  const base = chain(T(x, y, z), RY(h));
  const sw = moving ? Math.sin(anim) * 0.7 : 0;
  const box = (tx, ty, tz, sx, sy, sz, col, e) => draw(CUBE, chain(base, T(tx, ty, tz), S(sx, sy, sz)), col, e);
  shadow(chain(T(x, 0.27, z), S(1.1, 1, 1.1)), 0.25);
  for(const sx of [-1, 1]){
    draw(CUBE, chain(base, T(sx * 0.16, 0.92, 0), RX(sw * sx), T(0, -0.92, 0), S(0.26, 0.92, 0.3)), L.pants);
    const ar = aim && sx < 0 ? -Math.PI / 2 : -sw * sx * 0.8;
    const arm = chain(base, T(sx * 0.42, 1.62, 0), RX(ar));
    draw(CUBE, chain(arm, T(0, -0.66, 0), S(0.18, 0.66, 0.22)), L.shirt);
    if(aim && sx < 0){
      draw(CUBE, chain(arm, T(0, -0.78, 0), S(0.16, 0.14, 0.16)), L.skin);
      draw(CUBE, chain(arm, T(0, -1.08, 0.04), S(0.11, 0.34, 0.15)), [0.12, 0.12, 0.14]);
      draw(CUBE, chain(arm, T(0, -0.86, -0.1), S(0.1, 0.12, 0.12)), [0.12, 0.12, 0.14]);
      if(fireCD > 0.2) draw(CUBE, chain(arm, T(0, -1.32, 0.04), S(0.22, 0.12, 0.22)), [1, 0.85, 0.3], 1);
    }
  }
  box(0, 0.9, 0, 0.62, 0.78, 0.36, L.shirt);
  box(0, 1.7, 0, 0.4, 0.42, 0.4, L.skin);
  // cabelo
  const hc = L.hairCol || [0.15, 0.1, 0.08], st = L.hair || "curto";
  if(st === "curto"){ box(0, 2.06, 0, 0.43, 0.12, 0.43, hc); box(0, 1.8, -0.2, 0.43, 0.3, 0.06, hc); }
  else if(st === "moicano"){ box(0, 2.08, 0, 0.1, 0.24, 0.44, hc); }
  else if(st === "black"){ box(0, 1.88, -0.03, 0.66, 0.44, 0.6, hc); }
  else if(st === "topete"){ box(0, 2.06, 0, 0.43, 0.1, 0.43, hc); box(0, 2.1, 0.12, 0.43, 0.2, 0.2, hc); box(0, 1.8, -0.2, 0.43, 0.3, 0.06, hc); }
  else if(st === "comprido"){ box(0, 2.06, 0, 0.45, 0.12, 0.45, hc); box(0, 1.46, -0.22, 0.46, 0.66, 0.08, hc); box(0.22, 1.66, -0.04, 0.06, 0.44, 0.32, hc); box(-0.22, 1.66, -0.04, 0.06, 0.44, 0.32, hc); }
  // boné / chapéu / quepe
  const hy = st === "black" ? 2.3 : 2.1, hcol = L.hatCol || [0.1, 0.2, 0.5];
  if(L.hat === "bone"){ box(0, hy - 0.04, 0, 0.45, 0.14, 0.45, hcol); box(0, hy - 0.04, 0.3, 0.4, 0.04, 0.26, hcol); }
  else if(L.hat === "chapeu"){ box(0, hy - 0.02, 0, 0.82, 0.05, 0.82, hcol); box(0, hy, 0, 0.44, 0.26, 0.44, hcol); }
  else if(L.hat === "policia"){ box(0, hy - 0.04, 0, 0.47, 0.18, 0.47, hcol); box(0, hy - 0.04, 0.3, 0.42, 0.04, 0.24, [0.05, 0.05, 0.06]); box(0, hy + 0.02, 0.235, 0.1, 0.09, 0.02, [1, 0.82, 0.25], 1); }
}
function drawCar(c, t){
  const m = chain(T(c.x, 0, c.z), RY(c.h));
  shadow(chain(T(c.x, 0.03, c.z), RY(c.h), S(2.6, 1, 5.2)), 0.3);
  draw(c.mesh, m, c.col);
  if(c.type === "police"){
    const on = c.siren && Math.floor(t * 6) % 2 === 0;
    draw(CUBE, chain(m, T(-0.3, 1.78, 0), S(0.55, 0.22, 0.32)), on ? [0.3, 0.5, 1] : [0.15, 0.2, 0.5], on ? 1 : 0);
    draw(CUBE, chain(m, T(0.3, 1.78, 0), S(0.55, 0.22, 0.32)), !on && c.siren ? [1, 0.2, 0.2] : [0.5, 0.12, 0.12], !on && c.siren ? 1 : 0);
  }
}
let view, proj, camPos = [0, 10, 0], aimBlend = 0;
const LOOK_DEF = { shirt: "#E8202A", pants: "#1F3A6B", skin: "#C68642", hair: "curto", hairCol: "#2A1A10", hat: "bone", hatCol: "#1B3A8C" };
let look = Object.assign({}, LOOK_DEF);
try{ Object.assign(look, JSON.parse(localStorage.getItem("cidade-livre-look") || "{}")); }catch(e){}
let ME = null;
function applyLook(){ ME = { shirt: hex(look.shirt), pants: hex(look.pants), skin: hex(look.skin), hair: look.hair, hairCol: hex(look.hairCol), hat: look.hat, hatCol: hex(look.hatCol) }; try{ localStorage.setItem("cidade-livre-look", JSON.stringify(look)); }catch(e){} }
applyLook();
function updateCamera(dt){
  const pc = player.car;
  const tx = player.x, tz = player.z, ty = pc ? 1.2 : player.y + 1.5;
  if(pc){
    camLookT -= dt;
    if(camLookT <= 0){ const sp = carSpeed(pc); const target = sp > 2 && (pc.vx * Math.sin(pc.h) + pc.vz * Math.cos(pc.h)) < -1 ? pc.h : pc.h; camYaw += angDiff(target - camYaw) * Math.min(1, dt * 3.2); }
  }
  const menu = state === "start";
  const portrait = H > W * 1.1;
  const dist = (menu ? 70 : pc ? 9.5 + carSpeed(pc) * 0.06 : camDist) * (portrait && !menu ? 1.45 : 1), pitch = menu ? 0.45 : pc ? 0.26 + (portrait ? 0.06 : 0) : camPitch;
  const [fx, fz] = fwd(camYaw);
  let cx = tx - fx * dist * Math.cos(pitch), cz = tz - fz * dist * Math.cos(pitch), cy = ty + dist * Math.sin(pitch) + (pc ? 1.2 : 0.3);
  // não deixa a câmera entrar nos prédios
  const steps = 14;
  for(let i = 1; i <= (menu ? 0 : steps); i++){
    const f = i / steps, x = lerp(tx, cx, f), z = lerp(tz, cz, f), y = lerp(ty, cy, f);
    let inside = false;
    for(const c of nearCols(x, z)) if(x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3 && y < c.h + 0.5){ inside = true; break; }
    if(inside){ const g = Math.max(0.12, (i - 1.5) / steps); cx = lerp(tx, cx, g); cz = lerp(tz, cz, g); cy = lerp(ty, cy, g) + 0.6; break; }
  }
  const sh = shake > 0 ? [(Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake] : [0, 0];
  if(!pc && player.gunT > 0 && state === "play"){
    aimBlend = Math.min(1, aimBlend + dt * 6);
  } else aimBlend = Math.max(0, aimBlend - dt * 6);
  let look = [tx, ty + (pc ? 0.8 : 0.3), tz];
  if(aimBlend > 0){
    const rx = -fz, rz = fx, d = portrait ? 5 : 4, a = aimBlend;
    const ax = tx - fx * d + rx * 0.9, az = tz - fz * d + rz * 0.9, ay = ty + 0.7;
    cx = lerp(cx, ax, a); cz = lerp(cz, az, a); cy = lerp(cy, ay, a);
    look = [lerp(look[0], tx + fx * 25, a), lerp(look[1], ty + 0.1, a), lerp(look[2], tz + fz * 25, a)];
  }
  camPos = [cx + sh[0], cy + sh[1], cz];
  view = lookAt(camPos, look, [0, 1, 0]);
  const fov = ((pc ? 62 + Math.min(14, carSpeed(pc) * 0.35) : 60) + (portrait ? 12 : 0)) * Math.PI / 180;
  proj = persp(fov, W / H, 0.2, 700);
}
function render(t){
  gl.clearColor(SKY[0], SKY[1], SKY[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(U.uProj, false, proj); gl.uniformMatrix4fv(U.uView, false, view);
  gl.uniform3fv(U.uCam, camPos);
  gl.uniform2f(U.uFog, LOW ? 90 : 140, LOW ? 300 : 430);
  draw(cityMesh, I4());
  const vis = (x, z, r) => hypot(x - camPos[0], z - camPos[2]) < (LOW ? 300 : 430) + r;
  for(const c of cars) if(vis(c.x, c.z, 5)) drawCar(c, t);
  if(!player.car) drawPerson(player.x, player.y, player.z, player.h, player.anim, player.moving, ME, player.gunT > 0 && state === "play");
  for(const p of peds) if(vis(p.x, p.z, 2) && hypot(p.x - camPos[0], p.z - camPos[2]) < 160) drawPerson(p.x, p.jump > 0 ? Math.sin((0.7 - p.jump) / 0.7 * Math.PI) * 0.6 : 0, p.z, p.h, p.anim, 1, p);
  for(const tg of targets){ const m = chain(T(tg.x, 0.26, tg.z), tg.down > 0 ? RX(-1.35) : I4()); draw(TARGET, m); }
  for(const tr of tracers){ const dx = tr.x1 - tr.x0, dz = tr.z1 - tr.z0, l = hypot(dx, dz); draw(CUBE, chain(T((tr.x0 + tr.x1) / 2, 1.42, (tr.z0 + tr.z1) / 2), RY(Math.atan2(dx, dz)), S(0.05, 0.05, l)), [1, 0.9, 0.4], 1); }
  for(const s of stars) if(!s.got) draw(STAR, chain(T(s.x, 1.6 + Math.sin(t * 2 + s.x) * 0.25, s.z), RY(t * 2), S(0.8, 0.8, 0.8)), [1, 0.82, 0.2], 1);
  // marcadores e setas (transparentes)
  gl.enable(gl.BLEND); gl.depthMask(false);
  if(!mission) for(const m of MARKERS){ const p = m.place(); if(p) draw(MARK, chain(T(p.x, 0.26, p.z), S(2.4, 1.3 + Math.sin(t * 3) * 0.15, 2.4)), m.c, 1, 0.5); }
  if(mission && mission.target && mission.id !== "police"){
    const tg = mission.target, col = mission.id === "race" ? [0.7, 0.3, 1] : mission.id === "pizza" ? [1, 0.42, 0.1] : mission.stage === "pick" ? [0.4, 1, 0.4] : [1, 0.76, 0.1];
    draw(MARK, chain(T(tg.x, 0.05, tg.z), S(mission.id === "race" ? 6 : 4, 9, mission.id === "race" ? 6 : 4)), col, 1, 0.35);
    if(mission.id === "race" && mission.cps[mission.n + 1]){ const n2 = mission.cps[mission.n + 1]; draw(MARK, chain(T(n2.x, 0.05, n2.z), S(6, 6, 6)), col, 1, 0.12); }
  }
  gl.depthMask(true); gl.disable(gl.BLEND);
  if(mission && mission.target && aimBlend < 0.5){
    const tg = mission.target, a = Math.atan2(tg.x - player.x, tg.z - player.z), y = (player.car ? 2.9 : 2.7) + Math.sin(t * 4) * 0.12;
    const col = mission.id === "police" ? [1, 0.25, 0.25] : [1, 0.85, 0.2], base = chain(T(player.x, y, player.z), RY(a), RX(-0.35));
    const k = player.car ? 1 : 0.55;
    for(const sg of [-1, 1]) draw(CUBE, chain(base, S(k, k, k), T(sg * 0.42, 0, 0.35), RY(sg * 0.8), T(0, 0, -0.55), S(0.34, 0.3, 1.3)), col, 1);
  }
  // pista: estrela mais perto pisca um pouquinho
}

/* ---------- radar ---------- */
const radar = $("radar"), rg = radar.getContext("2d");
let RW = 150, rDPR = 1;
const MAPS = 2;
const mapC = document.createElement("canvas"); mapC.width = SIZE * MAPS; mapC.height = SIZE * MAPS;
(() => {
  const g = mapC.getContext("2d"); g.scale(MAPS, MAPS);
  g.fillStyle = "#4A4F57"; g.fillRect(0, 0, SIZE, SIZE);
  const col = { A: "#7FBF5A", R: "#F2A7C3", C: "#9EE3D8", H: "#8FBF6A", B: "#B9B2A3", T: "#9C9486", P: "#5FA845", L: "#5FA845", Q: "#D9CCB0", S: "#7FA7E6", D: "#6E8BD8", Z: "#E8A27A", G: "#9CD6A8" };
  for(const l of lots){ g.fillStyle = "#C3C6CC"; g.fillRect(l.X0, l.Z0, BLOCK, BLOCK); g.fillStyle = col[l.t] || "#B9B2A3"; g.fillRect(l.X0 + 3, l.Z0 + 3, BLOCK - 6, BLOCK - 6); if(l.t === "L"){ g.fillStyle = "#3C8DBC"; g.fillRect(l.X0 + 10, l.Z0 + 10, BLOCK - 20, BLOCK - 20); } }
  g.fillStyle = "rgba(60,60,60,.35)"; for(const c of colliders) if(c.h > 5 && c.x1 - c.x0 < 80) g.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0);
})();
function sizeRadar(){ const r = radar.getBoundingClientRect(); rDPR = Math.min(window.devicePixelRatio || 1, 2); RW = Math.max(60, Math.round(r.width * rDPR)); radar.width = RW; radar.height = RW; }
function drawRadar(t){
  const g = rg, r = RW / 2, scale = RW / 170;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, RW, RW);
  g.save(); g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.clip();
  g.fillStyle = "#5E9E3E"; g.fillRect(0, 0, RW, RW);
  g.translate(r, r); g.rotate(camYaw + Math.PI); g.scale(scale, scale); g.translate(-player.x, -player.z);
  g.drawImage(mapC, 0, 0, SIZE, SIZE);
  const blip = (x, z, col, rad, letter) => {
    const dx = x - player.x, dz = z - player.z, d = hypot(dx, dz), maxD = 80;
    let bx = x, bz = z; if(d > maxD){ bx = player.x + dx / d * maxD; bz = player.z + dz / d * maxD; }
    g.save(); g.translate(bx, bz); g.rotate(-(camYaw + Math.PI));
    g.fillStyle = "#000"; g.beginPath(); g.arc(0, 0, rad + 1.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.fill();
    if(letter){ g.fillStyle = "#fff"; g.font = `800 ${rad * 1.3}px Arial`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(letter, 0, 0.3); }
    g.restore();
  };
  if(!mission) for(const m of MARKERS){ const p = m.place(); blip(p.x, p.z, m.col, 5, m.label); }
  if(mission && mission.target){ const tg = mission.target; blip(tg.x, tg.z, mission.id === "police" ? "#FF3B3B" : mission.id === "race" ? "#B44CFF" : "#FFC21A", 4.5 + Math.sin(t * 6) * 0.8); }
  // jogador
  g.translate(player.x, player.z); g.rotate(-(player.car ? player.car.h : player.h) + Math.PI);
  g.fillStyle = "#fff"; g.strokeStyle = "#000"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, -5); g.lineTo(3.6, 4); g.lineTo(0, 2.2); g.lineTo(-3.6, 4); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.strokeStyle = "rgba(255,255,255,.6)"; g.lineWidth = 2 * rDPR; g.beginPath(); g.arc(r, r, r - rDPR, 0, Math.PI * 2); g.stroke();
}

/* =========================================================
   HUD E MENSAGENS
   ========================================================= */
let msgT = 0;
function showMsg(big, small, cls, dur){ $("msgBig").textContent = big; $("msgSmall").textContent = small || ""; $("msg").className = "msg show " + (cls || ""); msgT = dur || 2; }
const hc = {};
function setT(id, v){ if(hc[id] !== v){ hc[id] = v; $(id).textContent = v; } }
let nearCar = null;
function updateHUD(){
  setT("hMoney", money(cash));
  setT("hStars", "★ " + starsGot + "/" + stars.length);
  const pc = player.car;
  $("speed").hidden = !pc;
  if(pc) setT("hSpeed", String(Math.round(carSpeed(pc) * 3.6)));
  if(!mission){ if(!$("mission").hidden){ $("mission").hidden = true; mCache = ""; } }
  // carro mais perto para entrar
  nearCar = null;
  if(!pc){ let bd = 3.8; for(const c of cars){ if(c.ai) continue; const d = hypot(c.x - player.x, c.z - player.z); if(d < bd){ bd = d; nearCar = c; } } }
  const pr = $("prompt");
  const txt = pc ? (IS_TOUCH ? "" : "E: sair do carro" + (pc.type === "police" ? " · H: sirene" : "")) : nearCar ? (IS_TOUCH ? "Toque em ENTRAR" : "Aperte E para entrar no carro") : (!IS_TOUCH && time < 14 ? "Clique na tela para mirar · clique ou F atira · Q guarda a arma" : "");
  if(hc.pr !== txt){ hc.pr = txt; pr.textContent = txt; pr.hidden = !txt || (pc && time > 8); }
  if(pc && time > 8 && !pr.hidden) pr.hidden = true;
  const act = $("tAct"); const at = pc ? "SAIR" : "ENTRAR";
  if(hc.act !== at){ hc.act = at; act.textContent = at; }
  act.style.opacity = pc || nearCar ? "1" : "0.45";
  $("tFire").hidden = !!pc;
  const aiming = !pc && player.gunT > 0; if(hc.cross !== aiming){ hc.cross = aiming; $("cross").hidden = !aiming; }
  $("tBrake").hidden = !pc; $("tHorn").textContent = pc && pc.type === "police" ? "SIRENE" : "BUZINA"; $("tHorn").hidden = !pc;
}
function toggleCar(){
  if(state !== "play") return;
  if(player.car){
    const c = player.car;
    if(carSpeed(c) > 6) { showMsg("", "Pare o carro para sair", "", 1); return; }
    const [fx, fz] = fwd(c.h), rx = -fz, rz = fx;
    player.x = c.x - rx * 2.2; player.z = c.z - rz * 2.2; player.h = c.h; player.car = null; c.vx = c.vz = 0;
    pushOut(player, 0.5); sfx("door");
  } else if(nearCar){
    player.car = nearCar; nearCar.ai = null; camYaw = nearCar.h; sfx("door"); buzz(20);
  }
}


/* =========================================================
   LOJA DE ROUPAS E CABELEIREIRO
   ========================================================= */
const CAT = {
  roupas: [
    { name: "Camiseta", price: 30, key: "shirt", opts: [["Vermelha", "#E8202A"], ["Azul", "#2E66FF"], ["Verde", "#2EB872"], ["Amarela", "#FFC21A"], ["Preta", "#1C1F24"], ["Branca", "#F2F2F2"], ["Roxa", "#8A5CFF"], ["Rosa", "#FF5D8F"], ["Laranja", "#FF8A1F"]] },
    { name: "Calça", price: 30, key: "pants", opts: [["Jeans", "#1F3A6B"], ["Preta", "#1C1F24"], ["Bege", "#C8B08A"], ["Cinza", "#7A808A"], ["Verde", "#3E5A3A"], ["Branca", "#E8E8E8"]] },
    { name: "Boné ou chapéu", price: 20, key: "hat", opts: [["Sem nada", null], ["Boné", "bone"], ["Chapéu", "chapeu"]] },
    { name: "Cor do boné/chapéu", price: 15, key: "hatCol", opts: [["Azul", "#1B3A8C"], ["Vermelho", "#C8261E"], ["Preto", "#1C1F24"], ["Branco", "#F2F2F2"], ["Amarelo", "#FFC21A"], ["Verde", "#2EB872"]] },
    { name: "Farda de policial", price: 80, key: "farda", opts: [["Vestir farda", "farda"]] },
  ],
  salao: [
    { name: "Corte de cabelo", price: 25, key: "hair", opts: [["Curto", "curto"], ["Careca", "careca"], ["Moicano", "moicano"], ["Black power", "black"], ["Topete", "topete"], ["Comprido", "comprido"]] },
    { name: "Cor do cabelo", price: 15, key: "hairCol", opts: [["Preto", "#1A1410"], ["Castanho", "#5A3A22"], ["Loiro", "#E6C46A"], ["Ruivo", "#B8462A"], ["Azul", "#2E66FF"], ["Rosa", "#FF5D8F"], ["Verde", "#2EB872"], ["Branco", "#EDEDED"]] },
  ],
};
let shopOpen = null;
function openShop(m){
  shopOpen = m; state = "shop";
  for(const k in keys) keys[k] = false; joy.active = false; mouseHold = false; tFireDown = false; player.gunT = 0;
  if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  $("shTag").textContent = m.tag; $("shTitle").textContent = m.title;
  $("tbtns").hidden = true; $("joy").hidden = true;
  buildShop(); $("shop").hidden = false;
  sfx("door");
}
function buildShop(){
  const body = $("shBody"); body.innerHTML = "";
  $("shCash").textContent = money(cash);
  for(const cat of CAT[shopOpen.id]){
    const sec = document.createElement("div"); sec.className = "shsec";
    const h = document.createElement("h3"); h.textContent = cat.name + " · " + money(cat.price); sec.appendChild(h);
    const row = document.createElement("div"); row.className = "shrow";
    for(const [label, val] of cat.opts){
      const b = document.createElement("button"); b.type = "button"; b.className = "opt";
      const cur = cat.key === "farda" ? look.hat === "policia" : look[cat.key] === val;
      if(cur) b.classList.add("on");
      if(typeof val === "string" && val[0] === "#"){ const sw = document.createElement("i"); sw.style.background = val; b.appendChild(sw); }
      b.append(label);
      b.addEventListener("click", () => buy(cat, val));
      row.appendChild(b);
    }
    sec.appendChild(row); body.appendChild(sec);
  }
}
function buy(cat, val){
  const cur = cat.key === "farda" ? look.hat === "policia" : look[cat.key] === val;
  if(cur) return;
  if(cash < cat.price){ showMsg("", "Dinheiro insuficiente: faça missões para ganhar mais!", "fail", 2); sfx("fail"); return; }
  cash -= cat.price;
  if(cat.key === "farda"){ look.shirt = "#1D3B8C"; look.pants = "#1A2238"; look.hat = "policia"; look.hatCol = "#1A2238"; }
  else { look[cat.key] = val; if(cat.key === "hatCol" && !look.hat) look.hat = "bone"; if(cat.key === "hat" && look.hat !== "policia" && val === null) look.hat = null; }
  applyLook(); sfx("buy"); buildShop();
}
$("shExit").addEventListener("click", () => {
  if(!shopOpen) return;
  blockMarker = shopOpen; shopOpen = null; state = "play"; $("shop").hidden = true; $("tbtns").hidden = !IS_TOUCH;
  player.h = 0; camYaw = 0; last = performance.now();
});

/* =========================================================
   LAÇO
   ========================================================= */
function step(dt){
  time += dt; honkT -= dt; fireCD -= dt;
  if(player.car) player.gunT = 0; else if(player.gunT > 0 && player.gunT < 900) player.gunT -= dt;
  if(mouseHold || keys.f || tFireDown) shoot();
  for(const t of targets) if(t.down > 0) t.down -= dt;
  for(let i = tracers.length - 1; i >= 0; i--){ tracers[i].t -= dt; if(tracers[i].t <= 0) tracers.splice(i, 1); }
  updatePlayer(dt);
  for(const c of cars) if(c.ai === "traffic") aiStep(c, dt, c.target);
  carCollisions();
  updatePeds(dt);
  updateMission(dt);
  // estrelas
  for(const s of stars) if(!s.got && hypot(s.x - player.x, s.z - player.z) < (player.car ? 3 : 1.8)){ s.got = true; starsGot++; pay(50); sfx("star"); showMsg("★ ESTRELA " + starsGot + "/" + stars.length, "+" + money(50), "good", 1.4); if(starsGot === stars.length){ pay(500); showMsg("TODAS AS ESTRELAS!", "+" + money(500) + " de bônus", "good", 3); } }
  // marcadores de missão
  if(!mission && !briefFor){
    const pp = playerPos();
    let inside = null;
    for(const m of MARKERS){ const p = m.place(); if(hypot(p.x - pp.x, p.z - pp.z) < 3.2) inside = m; }
    if(inside && inside !== blockMarker && (!player.car || carSpeed(player.car) < 6)){
      if(inside.info){ blockMarker = inside; showMsg("ESTANDE DE TIRO", IS_TOUCH ? "Mire nos alvos e toque em ATIRAR · +R$ 10 por acerto" : "Mire com o mouse nos alvos e clique para atirar · +R$ 10 por acerto", "", 3.5); }
      else if(inside.shop){ if(player.car){ blockMarker = inside; showMsg("", "Saia do carro para entrar na loja", "", 1.8); } else openShop(inside); }
      else openBrief(inside);
    }
    if(!inside) blockMarker = null;
  }
  shake = Math.max(0, shake - dt * 2);
  if(msgT > 0){ msgT -= dt; if(msgT <= 0) $("msg").classList.remove("show"); }
}
function openBrief(m){
  briefFor = m; paused = true;
  $("bTag").textContent = m.tag; $("bTitle").textContent = m.title; $("bText").textContent = m.text;
  $("brief").hidden = false; $("btnGo").focus({ preventScroll: true });
  if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock();
  for(const k in keys) keys[k] = false;
}
$("btnGo").addEventListener("click", () => { const m = briefFor; briefFor = null; $("brief").hidden = true; paused = false; last = performance.now(); audioOn(); startMission(m.id); });
$("btnNo").addEventListener("click", () => { blockMarker = briefFor; briefFor = null; $("brief").hidden = true; paused = false; last = performance.now(); });

const pf = { n: 0, s: 0, done: false };
let last = performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if(state === "play" && !paused){
    step(dt);
    if(!pf.done && !LOW){ pf.s += dt; pf.n++; if(pf.n >= 120){ if(pf.s / pf.n > 0.03){ LOW = true; resize(); for(let k = peds.length - 1; k >= 12; k--) peds.pop(); } pf.done = true; } }
  }
  if(state === "start"){ camYaw += dt * 0.12; player.x = SIZE / 2 + Math.sin(t * 0.05) * 60; player.z = SIZE / 2 + Math.cos(t * 0.05) * 60; for(const c of cars) if(c.ai === "traffic") aiStep(c, dt, c.target); updatePeds(dt); }
  if(paused) return;
  if(state === "shop"){
    const a = player.h + Math.PI + Math.sin(t * 0.7) * 0.7, portrait = H > W * 1.1, d = portrait ? 4.2 : 3.6;
    camPos = [player.x + Math.sin(a) * d, 1.8, player.z + Math.cos(a) * d];
    const lx = portrait ? 0 : 1.7, rx = Math.cos(a), rz = -Math.sin(a);
    view = lookAt(camPos, [player.x + rx * lx, portrait ? 0.55 : 1.2, player.z + rz * lx], [0, 1, 0]);
    proj = persp((portrait ? 70 : 55) * Math.PI / 180, W / H, 0.2, 700);
    player.moving = 0;
    render(t); return;
  }
  updateCamera(dt);
  render(t);
  if(state === "play"){ updateHUD(); drawRadar(t); drawJoy(); }
  audioTick();
}

/* =========================================================
   CONTROLES
   ========================================================= */
const keys = {};
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if(state === "start" && e.key === "Enter"){ start(); return; }
  if(briefFor && e.key === "Enter"){ e.preventDefault(); $("btnGo").click(); return; }
  if(briefFor && e.key === "Escape"){ $("btnNo").click(); return; }
  if((k === "p" || e.key === "Escape") && state === "play" && !briefFor){ togglePause(); return; }
  if(state !== "play" || paused) return;
  audioOn();
  keys[k] = true; keys.shift = e.shiftKey;
  if(e.key === " " || e.key.startsWith("Arrow")) e.preventDefault();
  if(k === "e" && !e.repeat) toggleCar();
  if(k === "q" && !e.repeat && !player.car) player.gunT = player.gunT > 0 ? 0 : 999;
  if(k === "h" && !e.repeat){ if(player.car && player.car.type === "police") player.car.siren = !player.car.siren; else sfx("honk"); }
});
document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; keys.shift = e.shiftKey; });
window.addEventListener("blur", () => { for(const k in keys) keys[k] = false; });

// mouse: arrastar ou travar o ponteiro gira a câmera
let drag = null;
cv.addEventListener("pointerdown", e => {
  if(state !== "play" || paused) return;
  audioOn();
  if(e.pointerType === "mouse"){
    if(cv.requestPointerLock && document.pointerLockElement !== cv){ try{ const p = cv.requestPointerLock(); if(p && p.catch) p.catch(() => {}); }catch(err){} }
    else if(!player.car && e.button === 0){ mouseHold = true; shoot(); }
    return;
  }
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if(x < r.width * 0.45 && !joy.active){ joy.active = true; joy.id = e.pointerId; joy.ox = x; joy.oy = y; joy.x = joy.y = 0; joy.mag = 0; }
  else if(!drag) drag = { id: e.pointerId, x, y };
  try{ cv.setPointerCapture(e.pointerId); }catch(err){}
});
cv.addEventListener("pointermove", e => {
  if(e.pointerType === "mouse"){ if(document.pointerLockElement === cv && state === "play"){ camYaw -= e.movementX * 0.004; camPitch = clamp(camPitch + e.movementY * 0.003, 0.05, 1.1); camLookT = 1.5; } return; }
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if(joy.active && e.pointerId === joy.id){ const dx = x - joy.ox, dy = y - joy.oy, max = 56, m = hypot(dx, dy), k = m > max ? max / m : 1; joy.x = dx * k / max; joy.y = dy * k / max; joy.mag = Math.min(1, m / max); }
  else if(drag && e.pointerId === drag.id){ camYaw -= (x - drag.x) * 0.008; camPitch = clamp(camPitch + (y - drag.y) * 0.005, 0.05, 1.0); drag.x = x; drag.y = y; camLookT = 1.5; }
});
window.addEventListener("pointerup", e => { if(e.pointerType === "mouse") mouseHold = false; });
function endPtr(e){ if(joy.active && e.pointerId === joy.id){ joy.active = false; joy.x = joy.y = 0; } if(drag && e.pointerId === drag.id) drag = null; }
cv.addEventListener("pointerup", endPtr); cv.addEventListener("pointercancel", endPtr);
const joy = { active: false, x: 0, y: 0, mag: 0, ox: 0, oy: 0, id: -1 };
const joyEl = $("joy");
function drawJoy(){
  if(!IS_TOUCH) return;
  joyEl.hidden = !joy.active;
  if(joy.active){ joyEl.style.left = joy.ox + "px"; joyEl.style.top = joy.oy + "px"; joyEl.firstElementChild.style.transform = `translate(${joy.x * 46}px,${joy.y * 46}px)`; }
}
let tBrakeDown = false;
$("tAct").addEventListener("pointerdown", e => { e.preventDefault(); audioOn(); toggleCar(); });
$("tBrake").addEventListener("pointerdown", e => { e.preventDefault(); tBrakeDown = true; $("tBrake").classList.add("down"); });
["pointerup", "pointercancel", "pointerleave"].forEach(ev => $("tBrake").addEventListener(ev, () => { tBrakeDown = false; $("tBrake").classList.remove("down"); }));
$("tFire").addEventListener("pointerdown", e => { e.preventDefault(); audioOn(); tFireDown = true; $("tFire").classList.add("down"); shoot(); });
["pointerup", "pointercancel", "pointerleave"].forEach(ev => $("tFire").addEventListener(ev, () => { tFireDown = false; $("tFire").classList.remove("down"); }));
$("tHorn").addEventListener("pointerdown", e => { e.preventDefault(); if(player.car && player.car.type === "police") player.car.siren = !player.car.siren; else sfx("honk"); });
document.querySelectorAll(".tb").forEach(b => b.addEventListener("contextmenu", e => e.preventDefault()));

function start(){
  audioOn();
  setupWorld();
  state = "play"; paused = false;
  $("startScreen").hidden = true; $("hud").hidden = false; $("tbtns").hidden = !IS_TOUCH;
  sizeRadar();
  showMsg("CIDADE LIVRE", IS_TOUCH ? "Ande até um círculo colorido para começar uma missão" : "Ande até um círculo colorido · E entra nos carros", "", 3.5);
  last = performance.now();
}
function togglePause(){
  if(state !== "play") return;
  paused = !paused; $("pauseScreen").hidden = !paused;
  if(paused){ for(const k in keys) keys[k] = false; joy.active = false; if(document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); }
  last = performance.now();
}
$("btnPlay").addEventListener("click", start);
$("btnPause").addEventListener("click", togglePause);
$("btnResume").addEventListener("click", togglePause);
$("btnQuit").addEventListener("click", () => { paused = false; $("pauseScreen").hidden = true; state = "start"; mission = null; $("hud").hidden = true; $("tbtns").hidden = true; $("startScreen").hidden = false; refreshBest(); });
$("btnSound").addEventListener("click", () => { audioOn(); muted = !muted; setMuteUI(); try{ localStorage.setItem("cl-mute", muted ? "1" : "0"); }catch(e){} });
document.addEventListener("visibilitychange", () => { if(document.hidden && state === "play" && !paused && !briefFor) togglePause(); });
function refreshBest(){ $("bestStart").textContent = best.cash || best.race ? "Recordes: " + money(best.cash) + (best.race ? " · corrida " + best.race.toFixed(1) + " s" : "") : ""; }

/* ---------- início ---------- */
setMuteUI(); refreshBest();
setupWorld(); player.car = null;
new ResizeObserver(() => resize()).observe(stage);
resize();
requestAnimationFrame(loop);
})();
