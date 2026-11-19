/* chain.js (Claude, 11/19/26): daisy-chain conduit routing for the BESS Yard Planner.
 *
 * Reeves 11/19/26: link the batteries battery-to-battery instead of home-running each one to one spot.
 * Hard rule: no more than 360 degrees of bends between pull points. Each battery is a pull point.
 *   Underground hop: elbow out of the battery (90) + flex (0) + sweep down-to-horizontal (90)
 *                    + horizontal turns + sweep up (90) + elbow into the next battery (90).
 *   So battery to battery underground leaves 0 degrees: the horizontal run must be dead straight.
 * Ends (degrees used at each end of a pull segment) are options so the engineer can change them:
 *   ugUnit 180, ugBcp 90, ugBox 0 (in-grade handhole, conduit enters through the side)
 *   lrUnit 90 (flex lands on the rack), lrBcp 90, lrBox 0 (box on the rack)
 * Methods: 'UG' underground, 'LR' at-grade freestanding conduit rack (not on the fence; the fence goes up last).
 * Units: feet, SW origin, x east, y north. Pure functions, no DOM. Exported as window.BESSCHAIN / module.exports.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BESSCHAIN = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const EPS = 1e-6, BAND = 0.25, FACE_MARGIN = 0.33, ZONE = 3.5;
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DEFAULTS = {
    ugUnit: 180, ugBcp: 90, ugBox: 0,
    lrUnit: 90, lrBcp: 90, lrBox: 0,
    maxPerChain: 0,          // 0 = let the optimizer choose (conductor upsizing is priced in)
    boxCost: 1000, stepCost: 600, detourCost: 6, outsidePourCost: 4, chainCost: 25,
    bandCost: 3,              // per ft for running past another unit's control face inside its 6 in band
    walkRadius: 0.9, cell: 0.25, conduitHalf: 0.25,
    copperCost: 0.18,         // per ft per circuit per relative wire-cost step above #6 (1 unit ~ 1 ft of conduit + trench)
    lugCap: 6                 // Viridi terminals take #8 to #2 (manual p.19): 7+ circuits in one conduit needs #1
  };

  /* ---------- small geometry ---------- */
  const uniq = a => a.slice().sort((p, q) => p - q).filter((v, i, s) => !i || v - s[i - 1] > 1e-4);
  const rectHitsSeg = (r, a, b, pad) => {
    // axis-aligned segment a-b, inflated by pad, vs rect interior (open)
    const x0 = Math.min(a[0], b[0]) - pad, x1 = Math.max(a[0], b[0]) + pad;
    const y0 = Math.min(a[1], b[1]) - pad, y1 = Math.max(a[1], b[1]) + pad;
    return x0 < r.x + r.w - EPS && x1 > r.x + EPS && y0 < r.y + r.h - EPS && y1 > r.y + EPS;
  };
  const inRect = (p, r, m = 0) => p[0] > r.x - m + EPS && p[0] < r.x + r.w + m - EPS && p[1] > r.y - m + EPS && p[1] < r.y + r.h + m - EPS;
  function inPoly(p, poly) {
    let yes = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) yes = !yes;
    }
    return yes;
  }
  function edgeDist(p, poly) {
    let d = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j], b = poly[i], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
      d = Math.min(d, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
    return d;
  }
  const insideFence = (p, l, inset) => inPoly(p, l.fence) && edgeDist(p, l.fence) >= inset - EPS;
  const segLen = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const pathLen = p => p.slice(1).reduce((s, q, i) => s + segLen(p[i], q), 0);
  function simplify(p) {
    const o = [];
    for (const q of p) {
      if (o.length && Math.abs(o.at(-1)[0] - q[0]) < EPS && Math.abs(o.at(-1)[1] - q[1]) < EPS) continue;
      if (o.length >= 2) {
        const a = o.at(-2), b = o.at(-1);
        const col = (Math.abs(a[0] - b[0]) < EPS && Math.abs(b[0] - q[0]) < EPS) || (Math.abs(a[1] - b[1]) < EPS && Math.abs(b[1] - q[1]) < EPS);
        if (col) { o[o.length - 1] = q; continue; }
      }
      o.push(q.slice());
    }
    return o;
  }
  const turnsOf = p => Math.max(0, simplify(p).length - 2);

  /* ---------- faces, bands, zones ---------- */
  function face(u) {
    // the stub-up line just outside the control face; s = slide axis (0 x, 1 y); [lo, hi] slide range
    const m = Math.min(FACE_MARGIN, u.w / 3);
    switch (u.control) {
      case 'S': return {axis: 0, fixed: u.y - BAND, lo: u.x + m, hi: u.x + u.w - m, n: [0, -1]};
      case 'N': return {axis: 0, fixed: u.y + u.h + BAND, lo: u.x + m, hi: u.x + u.w - m, n: [0, 1]};
      case 'W': return {axis: 1, fixed: u.x - BAND, lo: u.y + m, hi: u.y + u.h - m, n: [-1, 0]};
      default:  return {axis: 1, fixed: u.x + u.w + BAND, lo: u.y + m, hi: u.y + u.h - m, n: [1, 0]};
    }
  }
  function bandRect(u) {
    const d = 2 * BAND;
    return {S: {x: u.x, y: u.y - d, w: u.w, h: d}, N: {x: u.x, y: u.y + u.h, w: u.w, h: d},
      W: {x: u.x - d, y: u.y, w: d, h: u.h}, E: {x: u.x + u.w, y: u.y, w: d, h: u.h}}[u.control];
  }
  function minusBand(z, b) {
    // control zone minus its own 6 in band (band sits on the cabinet side of the zone)
    if (!rectHitsSeg(z, [b.x, b.y], [b.x + b.w, b.y + b.h], 0)) return [z];
    const out = [];
    if (b.y + b.h < z.y + z.h - EPS && Math.abs(b.y - z.y) < EPS) out.push({x: z.x, y: b.y + b.h, w: z.w, h: z.y + z.h - b.y - b.h});
    else if (b.y > z.y + EPS && Math.abs(b.y + b.h - z.y - z.h) < EPS) out.push({x: z.x, y: z.y, w: z.w, h: b.y - z.y});
    else if (b.x + b.w < z.x + z.w - EPS && Math.abs(b.x - z.x) < EPS) out.push({x: b.x + b.w, y: z.y, w: z.x + z.w - b.x - b.w, h: z.h});
    else if (b.x > z.x + EPS && Math.abs(b.x + b.w - z.x - z.w) < EPS) out.push({x: z.x, y: z.y, w: b.x - z.x, h: z.h});
    else out.push(z);
    return out.filter(r => r.w > EPS && r.h > EPS);
  }
  function rackInfo(l) {
    const r = l.rack, side = r.side || 'S';
    const horiz = side === 'S' || side === 'N';
    const work = {S: {x: r.x, y: r.y + r.h, w: r.w, h: ZONE}, N: {x: r.x, y: r.y - ZONE, w: r.w, h: ZONE},
      W: {x: r.x + r.w, y: r.y, w: ZONE, h: r.h}, E: {x: r.x - ZONE, y: r.y, w: ZONE, h: r.h}}[side];
    const src = horiz ? {axis: 0, fixed: r.y + r.h / 2, lo: r.x + 0.5, hi: r.x + r.w - 0.5}
                      : {axis: 1, fixed: r.x + r.w / 2, lo: r.y + 0.5, hi: r.y + r.h - 0.5};
    return {rect: r, side, work, src, center: [r.x + r.w / 2, r.y + r.h / 2]};
  }

  /* ---------- obstacles (for at-grade) ---------- */
  function obstacles(l, ri, gate) {
    const obs = [];
    for (const u of l.units) obs.push({id: 'U' + u.id, r: u, hard: true});
    for (const u of l.units) obs.push({id: 'B' + u.id, r: bandRect(u)});
    for (const z of l.zones) {
      const u = l.units.find(v => v.id === z.unit);
      const parts = z.kind === 'control' && u ? minusBand(z, bandRect(u)) : [z];
      for (const p of parts) obs.push({id: 'Z' + z.unit + z.kind[0], r: p});
    }
    obs.push({id: 'R', r: ri.rect});
    {
      const w = ri.work, e = 0.75, horiz = ri.side === 'S' || ri.side === 'N';
      const ends = horiz ? [{x: w.x, y: w.y, w: e, h: w.h}, {x: w.x + w.w - e, y: w.y, w: e, h: w.h}]
                         : [{x: w.x, y: w.y, w: w.w, h: e}, {x: w.x, y: w.y + w.h - e, w: w.w, h: e}];
      const mid = horiz ? {x: w.x + e, y: w.y, w: w.w - 2 * e, h: w.h} : {x: w.x, y: w.y + e, w: w.w, h: w.h - 2 * e};
      obs.push({id: 'RW', r: mid});
      for (const r of ends) obs.push({id: 'RWE', r});
    }
    if (gate) {
      const g = gateSeg(l, gate);
      if (g) {
        const inward = {S: [0, 1], N: [0, -1], W: [1, 0], E: [-1, 0]}[g.side];
        const p1 = [g.a[0] + g.t[0] * g.len + inward[0] * 2.5, g.a[1] + g.t[1] * g.len + inward[1] * 2.5];
        obs.push({id: 'G', r: {x: Math.min(g.a[0], p1[0]), y: Math.min(g.a[1], p1[1]), w: Math.abs(p1[0] - g.a[0]), h: Math.abs(p1[1] - g.a[1])}});
      }
    }
    return obs;
  }

  /* ---------- the routing grid ---------- */
  function buildGrid(l, ri, method, opt) {
    const xs = [], ys = [];
    const walls = {x: [], y: []};
    for (const p of l.fence) { walls.x.push(p[0]); walls.y.push(p[1]); }
    for (const u of l.units) { walls.x.push(u.x, u.x + u.w); walls.y.push(u.y, u.y + u.h); }
    const r = ri.rect; walls.x.push(r.x, r.x + r.w); walls.y.push(r.y, r.y + r.h);
    for (const z of l.zones) { walls.x.push(z.x, z.x + z.w); walls.y.push(z.y, z.y + z.h); }
    for (const k of ['x', 'y']) {
      const w = uniq(walls[k]), out = k === 'x' ? xs : ys;
      for (let i = 0; i < w.length; i++) {
        out.push(w[i] - BAND, w[i] + BAND, w[i] - 0.5, w[i] + 0.5);
        if (i) out.push((w[i] + w[i - 1]) / 2);
      }
    }
    for (const u of l.units) {
      const f = face(u), arr = f.axis === 0 ? xs : ys;
      arr.push(f.lo, f.hi, (f.lo + f.hi) / 2);
      (f.axis === 0 ? ys : xs).push(f.fixed, f.fixed - 0.2, f.fixed + 0.2);
    }
    const s = ri.src;
    (s.axis === 0 ? xs : ys).push(s.lo, s.hi, (s.lo + s.hi) / 2);
    (s.axis === 0 ? ys : xs).push(s.fixed);
    const X = uniq(xs), Y = uniq(ys), nx = X.length, ny = Y.length;
    const inset = method === 'UG' ? 0.25 : 0.4;
    const ok = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) ok[j * nx + i] = insideFence([X[i], Y[j]], l, inset) ? 1 : 0;
    // horizontal edge (i,j)->(i+1,j) id = j*nx+i ; vertical (i,j)->(i,j+1) id = nx*ny + j*nx + i
    const obs = method === 'LR' ? obstacles(l, ri, opt._gate) : [];
    const block = new Array(2 * nx * ny);
    const walkable = opt._walkCells || null;
    const edgeCost = new Float32Array(2 * nx * ny).fill(Infinity), elen = new Float32Array(2 * nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i;
      for (const v of [0, 1]) {
        const i2 = i + (v ? 0 : 1), j2 = j + (v ? 1 : 0);
        if (i2 >= nx || j2 >= ny) continue;
        const id2 = j2 * nx + i2;
        if (!ok[id] || !ok[id2]) continue;
        const a = [X[i], Y[j]], b = [X[i2], Y[j2]], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        if (!insideFence(mid, l, inset)) continue;
        const e = v ? nx * ny + id : id;
        const bl = [];
        let hard = false;
        for (const o of obs) if (rectHitsSeg(o.r, a, b, o.hard ? opt.conduitHalf * 0.6 : 0.02)) {
          if (o.hard) { hard = true; break; }
          bl.push(o.id);
        }
        if (hard) continue;
        block[e] = bl;
        let c = segLen(a, b);
        if (method === 'LR' && walkable) c += segLen(a, b) * walkable(mid);
        edgeCost[e] = c; elen[e] = segLen(a, b);
      }
    }
    return {X, Y, nx, ny, ok, block, edgeCost, elen, method, bandCost: opt.bandCost};
  }
  const node = (g, i, j) => j * g.nx + i;
  function edgeId(g, i, j, d) {
    // d: 0 +x, 1 +y, 2 -x, 3 -y ; returns [edge, ni, nj] or null
    const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
    if (ni < 0 || nj < 0 || ni >= g.nx || nj >= g.ny) return null;
    let e;
    if (d === 0) e = node(g, i, j); else if (d === 2) e = node(g, ni, nj);
    else if (d === 1) e = g.nx * g.ny + node(g, i, j); else e = g.nx * g.ny + node(g, ni, nj);
    return [e, ni, nj];
  }
  function endpointNodes(g, f) {
    // grid nodes inside the stub zone: across the face [lo,hi], and 0.05-0.45 ft out from it (inside the 6 in band)
    const out = [];
    const A = f.axis === 0 ? g.X : g.Y, B = f.axis === 0 ? g.Y : g.X, depth = f.n ? 0.25 + 1e-4 : 1e-4;
    for (let k = 0; k < B.length; k++) {
      if (Math.abs(B[k] - f.fixed) > depth) continue;
      for (let t = 0; t < A.length; t++) if (A[t] >= f.lo - 1e-4 && A[t] <= f.hi + 1e-4) {
        const i = f.axis === 0 ? t : k, j = f.axis === 0 ? k : t;
        if (g.ok[node(g, i, j)]) out.push(node(g, i, j));
      }
    }
    return out;
  }

  /* Turn-limited Dijkstra. starts: node ids; allowed: Set of soft obstacle ids; maxTurns; returns per-node best {cost, prev chain} */
  function search(g, starts, allowed, maxTurns, turnCost = 0.6) {
    const N = g.nx * g.ny, S = N * 4 * (maxTurns + 1);
    const dist = new Float64Array(S).fill(Infinity), prev = new Int32Array(S).fill(-1);
    const heap = [];
    const push = (s, d) => { heap.push([d, s]); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const sid = (n, d, t) => ((n * 4 + d) * (maxTurns + 1)) + t;
    for (const n of starts) for (let d = 0; d < 4; d++) { const s = sid(n, d, 0); dist[s] = 0; push(s, 0); }
    while (heap.length) {
      const [dd, s] = pop();
      if (dd > dist[s]) continue;
      const t = s % (maxTurns + 1), d = Math.floor(s / (maxTurns + 1)) % 4, n = Math.floor(s / (4 * (maxTurns + 1)));
      const i = n % g.nx, j = Math.floor(n / g.nx);
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const nt = t + (nd === d ? 0 : 1);
        if (nt > maxTurns) continue;
        const ed = edgeId(g, i, j, nd);
        if (!ed) continue;
        const [e, ni, nj] = ed;
        if (!(g.edgeCost[e] < Infinity)) continue;
        const bl = g.block[e];
        let extra = 0, bad = false;
        if (bl && bl.length) for (const b of bl) if (!allowed.has(b)) { bad = true; break; }
        if (bad) continue;
        const ns = sid(node(g, ni, nj), nd, nt), nd2 = dd + g.edgeCost[e] + extra + (nd === d ? 0 : turnCost);
        if (nd2 < dist[ns] - 1e-9) { dist[ns] = nd2; prev[ns] = s; push(ns, nd2); }
      }
    }
    return {dist, prev, maxTurns, sid,
      best(n) { let b = Infinity, bs = -1; for (let d = 0; d < 4; d++) for (let t = 0; t <= maxTurns; t++) { const s = sid(n, d, t); if (dist[s] < b) { b = dist[s]; bs = s; } } return {cost: b, state: bs}; },
      path(s) { const pts = []; while (s >= 0) { const n = Math.floor(s / (4 * (maxTurns + 1))); pts.push([g.X[n % g.nx], g.Y[Math.floor(n / g.nx)]]); s = prev[s]; } return pts.reverse(); }};
  }

  /* ---------- walk analysis (0-1 BFS over a fine grid, conduit at grade = step-over) ---------- */
  function walkModel(l, ri, opt) {
    const c = opt.cell, R = opt.walkRadius;
    const xs = l.fence.map(p => p[0]), ys = l.fence.map(p => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys), W = Math.max(...xs) - x0, D = Math.max(...ys) - y0;
    const nx = Math.ceil(W / c), ny = Math.ceil(D / c);
    const free = new Uint8Array(nx * ny);
    const solids = [...l.units, ri.rect];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const p = [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c];
      if (!inPoly(p, l.fence) || edgeDist(p, l.fence) < R) continue;
      if (solids.some(r => inRect(p, r, R))) continue;
      free[j * nx + i] = 1;
    }
    return {x0, y0, nx, ny, c, free, R};
  }
  function walkEval(l, ri, wm, gate, conduits) {
    // Level BFS: level k = cells reachable with k step-overs. Conduit cells are walkable but entering one from
    // a clear cell is a step-over. A conduit across the gate opening costs everyone one step-over.
    const {x0, y0, nx, ny, c, free} = wm, N = nx * ny;
    const block = new Uint8Array(N), half = 0.25;
    const g = gate ? gateSeg(l, gate) : null;
    let gateBlocked = false;
    for (const [a, b] of conduits) {
      const lo = [Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half], hi = [Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half];
      const i0 = Math.max(0, Math.floor((lo[0] - x0) / c)), i1 = Math.min(nx - 1, Math.floor((hi[0] - x0) / c));
      const j0 = Math.max(0, Math.floor((lo[1] - y0) / c)), j1 = Math.min(ny - 1, Math.floor((hi[1] - y0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) block[j * nx + i] = 1;
      if (g && !gateBlocked) {
        // entry rect: the opening, 1.5 ft deep inside the fence
        const inward = {S: [0, 1], N: [0, -1], W: [1, 0], E: [-1, 0]}[g.side];
        const p0 = g.a, p1 = [g.a[0] + g.t[0] * g.len + inward[0] * 1.5, g.a[1] + g.t[1] * g.len + inward[1] * 1.5];
        const r = {x: Math.min(p0[0], p1[0]) + (g.t[0] ? 0.5 : 0), y: Math.min(p0[1], p1[1]) + (g.t[1] ? 0.5 : 0), w: Math.abs(p1[0] - p0[0]) - (g.t[0] ? 1 : 0), h: Math.abs(p1[1] - p0[1]) - (g.t[1] ? 1 : 0)};
        if (rectHitsSeg(r, a, b, 0)) gateBlocked = true;
      }
    }
    // Conduit on open floor (cells a person walks on) is a trip hazard wherever it is, even if everyone can walk around it.
    const floor = [];
    for (const [a, b] of conduits) {
      const L = segLen(a, b), k = Math.max(1, Math.ceil(L / (c * 0.5)));
      let hit = null;
      for (let t = 0; t <= k && !hit; t++) {
        const p = [a[0] + (b[0] - a[0]) * t / k, a[1] + (b[1] - a[1]) * t / k];
        const i = Math.floor((p[0] - x0) / c), j = Math.floor((p[1] - y0) / c);
        if (i >= 0 && j >= 0 && i < nx && j < ny && free[j * nx + i]) hit = p;
      }
      if (hit && !floor.some(q => Math.abs(q[0] - hit[0]) < 1 && Math.abs(q[1] - hit[1]) < 1)) floor.push(hit);
    }
    const steps = new Int16Array(N).fill(9999), dist = new Float32Array(N).fill(Infinity);
    const starts = [];
    if (g) {
      const inward = {S: [0, 1], N: [0, -1], W: [1, 0], E: [-1, 0]}[g.side];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const id = j * nx + i; if (!free[id]) continue;
        const p = [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c];
        const t = (p[0] - g.a[0]) * g.t[0] + (p[1] - g.a[1]) * g.t[1], dn = (p[0] - g.a[0]) * inward[0] + (p[1] - g.a[1]) * inward[1];
        if (t > 1 && t < g.len - 1 && dn > 0 && dn < 2.2) starts.push(id);
      }
    }
    let frontier = starts.slice(), level = gateBlocked ? 1 : 0;
    for (const s of frontier) { steps[s] = level + (block[s] ? 1 : 0); dist[s] = 0; }
    frontier = frontier.filter(s => steps[s] === level);
    let next = starts.filter(s => steps[s] === level + 1);
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while ((frontier.length || next.length) && level < 8) {
      for (let k = 0; k < frontier.length; k++) {
        const s = frontier[k], i = s % nx, j = (s / nx) | 0;
        for (const [di, dj] of NB) {
          const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
          const n = nj * nx + ni; if (!free[n]) continue;
          const step = block[n] && !block[s] ? 1 : 0, ns = level + step;
          if (ns < steps[n] || (ns === steps[n] && dist[s] + c < dist[n] - 1e-6)) {
            const fresh = steps[n] > ns;
            steps[n] = ns; dist[n] = dist[s] + c;
            if (step) next.push(n); else if (fresh || true) frontier.push(n);
          }
        }
      }
      level++;
      frontier = next.filter(s => steps[s] === level); next = [];
    }
    const targets = [];
    const reach = (name, r, weight, kind) => {
      let bs = 9999, bd = Infinity;
      const i0 = Math.max(0, Math.floor((r.x - x0) / c)), i1 = Math.min(nx - 1, Math.floor((r.x + r.w - x0) / c));
      const j0 = Math.max(0, Math.floor((r.y - y0) / c)), j1 = Math.min(ny - 1, Math.floor((r.y + r.h - y0) / c));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const id = j * nx + i; if (!free[id] || steps[id] > 9000) continue;
        const p = [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c]; if (!inRect(p, r)) continue;
        if (steps[id] < bs || (steps[id] === bs && dist[id] < bd)) { bs = steps[id]; bd = dist[id]; }
      }
      targets.push({name, kind, weight, steps: bs > 9000 ? null : bs, dist: bd});
    };
    reach('BCP + EMS working space', ri.work, 3, 'rack');
    for (const z of l.zones) reach(`BESS-${z.unit} ${z.kind} side`, z, z.kind === 'control' ? 2 : 1, z.kind);
    return {targets, starts: starts.length, gateBlocked, floor};
  }
  function gateSeg(l, gate) {
    const es = edges(l.fence), fits = e => e.side === gate.side && gate.from >= e.lo - 1e-3 && gate.from + (gate.len || 12) <= e.hi + 1e-3;
    const at = e => e.side === 'N' || e.side === 'S' ? e.a[1] : e.a[0];
    const e = (gate.at !== undefined && es.find(e => fits(e) && Math.abs(at(e) - gate.at) < 1e-3)) || es.find(fits) || es.find(e => e.side === gate.side);
    if (!e) return null;
    const axis = e.side === 'N' || e.side === 'S' ? 0 : 1;
    const a = axis === 0 ? [gate.from, e.a[1]] : [e.a[0], gate.from], t = axis === 0 ? [1, 0] : [0, 1];
    return {a, t, len: gate.len || 12, side: e.side};
  }
  function edges(poly) {
    const out = [], cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.abs(a[1] - b[1]) < EPS) {
        const mid = [(a[0] + b[0]) / 2, a[1]];
        const side = inPoly([mid[0], mid[1] + 0.05], poly) ? 'S' : 'N';
        out.push({a, b, side, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]), len: Math.abs(a[0] - b[0])});
      } else {
        const mid = [a[0], (a[1] + b[1]) / 2];
        const side = inPoly([mid[0] + 0.05, mid[1]], poly) ? 'W' : 'E';
        out.push({a, b, side, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]), len: Math.abs(a[1] - b[1])});
      }
    }
    void cx; void cy;
    return out;
  }
  function walkScore(ev, base) {
    let steps = 0, detour = 0, missing = 0;
    const list = [];
    for (const p of ev.floor || []) { steps += 1; list.push(`conduit on open floor near (${p[0].toFixed(1)}, ${p[1].toFixed(1)}) ft`); }
    ev.targets.forEach((t, k) => {
      const b = base.targets[k];
      if (b.steps === null) return;            // unreachable with no conduit at all: a layout issue, not routing
      if (t.steps === null) { missing++; list.push(t.name + ' cut off'); return; }
      let s = t.steps - b.steps;
      const extra = t.dist - b.dist;
      if (s <= 0 && extra > 12 + 0.3 * b.dist) s = 1;   // a long walk around: people will step over instead
      if (s > 0) { steps += s * t.weight; list.push(t.name); }
      else detour += Math.max(0, extra - 4) * t.weight;
    });
    return {steps, detour, missing, list};
  }
  /* ---------- gate choice: near the BCP rack, straight walk in ---------- */
  function chooseGate(l, ri, wm, current) {
    // one walking-distance field from the BCP working space, then score every 12 ft gate position on the fence
    const {x0, y0, nx, ny, c, free} = wm, N = nx * ny, dist = new Float32Array(N).fill(Infinity), q = [];
    const r = ri.work;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const id = j * nx + i, p = [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c];
      if (free[id] && inRect(p, r)) { dist[id] = 0; q.push(id); }
    }
    for (let k = 0; k < q.length; k++) { // BFS (4-neighbour, cell steps)
      const s = q[k], i = s % nx, j = (s / nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
        const nn = nj * nx + ni; if (!free[nn] || dist[nn] <= dist[s] + c) continue;
        dist[nn] = dist[s] + c; q.push(nn);
      }
    }
    const reached = q.length;
    const es = edges(l.fence), cands = [];
    for (const e of es) {
      if (e.len < 12 - EPS) continue;
      const at = e.side === 'N' || e.side === 'S' ? e.a[1] : e.a[0];
      for (let s = e.lo; s + 12 <= e.hi + EPS; s += 1) cands.push({side: e.side, at, from: Math.round(s * 1000) / 1000, len: 12});
      cands.push({side: e.side, at, from: e.hi - 12, len: 12});
      if (current && current.side === e.side && current.from >= e.lo - EPS && current.from + 12 <= e.hi + EPS) cands.push(Object.assign({}, current, {at, len: 12}));
    }
    let best = null;
    const ranked = [];
    for (const gc of cands) {
      const gs = gateSeg(l, gc); if (!gs) continue;
      const rr = ri.rect, ra = gs.t[0] ? [rr.x, rr.x + rr.w] : [rr.y, rr.y + rr.h], ga = gs.t[0] ? [gs.a[0], gs.a[0] + 12] : [gs.a[1], gs.a[1] + 12];
      const rackOnEdge = ri.side === gs.side && ga[0] < ra[1] + 0.25 && ga[1] > ra[0] - 0.25;
      if (rackOnEdge) continue;
      // the rack must not sit in front of / beside the opening
      const near = [0, 0.25, 0.5, 0.75, 1].some(f => { const p = [gs.a[0] + gs.t[0] * 12 * f, gs.a[1] + gs.t[1] * 12 * f]; return inRect(p, rr, 1.0); });
      if (near) continue;
      let d = Infinity, open = 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const id = j * nx + i; if (!free[id]) continue;
        const p = [x0 + (i + 0.5) * c, y0 + (j + 0.5) * c];
        const t = (p[0] - gs.a[0]) * gs.t[0] + (p[1] - gs.a[1]) * gs.t[1], dn = Math.abs((p[0] - gs.a[0]) * gs.t[1] - (p[1] - gs.a[1]) * gs.t[0]);
        if (t > 1 && t < gs.len - 1 && dn < 2.2) { open++; d = Math.min(d, dist[id]); }
      }
      if (open < 12 || d === Infinity) continue;
      const keep = current && current.side === gc.side && Math.abs(current.from - gc.from) < 0.01 ? 1.5 : 0;
      // Reeves 11/19/26: the gate goes near the MDP; the rack faces the service, so prefer the rack's fence side
      const score = d - keep + (gs.side === ri.side ? 0 : 8);
      ranked.push({gate: gc, score, rackDist: d});
      if (!best || score < best.score - 1e-6) best = {gate: gc, score, rackDist: d};
    }
    void reached;
    if (best) {
      ranked.sort((a, b) => a.score - b.score);
      const picks = [];
      for (const r of ranked) if (!picks.some(p => p.gate.side === r.gate.side && Math.abs(p.gate.from - r.gate.from) < 6)) picks.push(r);
      best.ranked = picks;
    }
    return best;
  }

  /* ---------- conductors and conduit size (planning numbers; engineer of record sizes) ---------- */
  const WIRE = [ // THWN-2 Cu: size, 90C ampacity (310.16), area in2 (Ch 9 T5), relative cost
    ['#6', 75, 0.0507, 1], ['#4', 95, 0.0824, 1.5], ['#3', 115, 0.0973, 1.9], ['#2', 130, 0.1158, 2.3],
    ['#1', 145, 0.1562, 2.9], ['1/0', 170, 0.1855, 3.5], ['2/0', 195, 0.2223, 4.3]];
  const PVC40 = [['3/4', 0.203], ['1', 0.333], ['1-1/4', 0.581], ['1-1/2', 0.794], ['2', 1.316], ['2-1/2', 1.878], ['3', 2.907], ['3-1/2', 3.895], ['4', 5.022]];
  const adjust = ccc => ccc <= 3 ? 1 : ccc <= 6 ? 0.8 : ccc <= 9 ? 0.7 : ccc <= 20 ? 0.5 : ccc <= 30 ? 0.45 : ccc <= 40 ? 0.4 : 0.35;
  function wireFor(k) { // k = units' circuits sharing the conduit
    const f = adjust(3 * k);
    for (let i = 0; i < WIRE.length; i++) if (WIRE[i][1] * f >= 60) return {i, size: WIRE[i][0], area: WIRE[i][2], cost: WIRE[i][3], factor: f};
    const w = WIRE.at(-1); return {i: WIRE.length - 1, size: w[0], area: w[2], cost: w[3], factor: f};
  }
  function conduitFor(area) { for (const [s, a] of PVC40) if (a >= area - 1e-9) return s; return '>4'; }

  /* ---------- the router ---------- */
  function routeOne(l, method, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    const ri = rackInfo(l);
    const n = l.units.length, ids = l.units.map(u => u.id);
    const wm = walkModel(l, ri, opt);
    const end = method === 'UG' ? {u: opt.ugUnit, s: opt.ugBcp, b: opt.ugBox} : {u: opt.lrUnit, s: opt.lrBcp, b: opt.lrBox};
    const budget = (a, b) => Math.floor((360 + 1e-6 - a - b) / 90);
    // walk-weighted edge costs for at-grade: conduit across open floor costs extra
    if (method === 'LR') {
      opt._walkCells = p => {
        const i = Math.floor((p[0] - wm.x0) / wm.c), j = Math.floor((p[1] - wm.y0) / wm.c);
        if (i < 0 || j < 0 || i >= wm.nx || j >= wm.ny) return 0;
        return wm.free[j * wm.nx + i] ? 6 : 0;
      };
    }
    const gateChoice = opt.gate ? {gate: opt.gate} : chooseGate(l, ri, wm, l.gate);
    opt._gate = gateChoice ? gateChoice.gate : l.gate;
    const g = buildGrid(l, ri, method, opt);
    const faces = l.units.map(face);
    const ends = l.units.map((u, k) => endpointNodes(g, faces[k]));
    const srcNodes = endpointNodes(g, ri.src);
    const out = {method, units: n, chains: [], hops: [], pullBoxes: [], messages: [], warnings: [], gate: null, options: opt};
    const unreachableUnits = l.units.filter((u, k) => !ends[k].length).map(u => u.id);
    if (unreachableUnits.length) out.messages.push('No stub-up position inside the fence for BESS-' + unreachableUnits.join(', BESS-'));
    if (!srcNodes.length) { out.messages.push('BCP rack has no conduit exit inside the fence'); return out; }

    // allowed soft obstacles for a hop between a and b (unit ids, 0 = BCP)
    const allow = (a, b) => {
      const s = new Set();
      for (const x of [a, b]) if (x) s.add('B' + x); else { s.add('R'); s.add('RWE'); }
      return s;
    };
    // all-node searches from every endpoint for the turn budget toward a box
    const T = method === 'UG' ? 'UG' : 'LR';
    void T;
    const cacheSearch = new Map();
    const run = (key, starts, allowed, turns) => {
      const k = key + '|' + turns;
      if (!cacheSearch.has(k)) cacheSearch.set(k, search(g, starts, allowed, turns));
      return cacheSearch.get(k);
    };
    const startsOf = a => a ? ends[ids.indexOf(a)] : srcNodes;
    const endDeg = a => a ? end.u : end.s;

    // direct hop a -> b
    function direct(a, b) {
      const turns = budget(endDeg(a), endDeg(b));
      if (turns < 0) return null;
      const sr = run(method === 'UG' ? 'u' + a : 'd' + a + '>' + b, startsOf(a), allow(a, b), turns);
      let best = null;
      for (const nd of startsOf(b)) { const r = sr.best(nd); if (r.cost < Infinity && (!best || r.cost < best.cost)) best = {cost: r.cost, state: r.state}; }
      if (!best) return null;
      const path = simplify(sr.path(best.state));
      return {from: a, to: b, legs: [path], boxes: [], cost: best.cost, length: pathLen(path), turns: [turnsOf(path)]};
    }
    // hop a -> box -> b
    function viaBox(a, b) {
      const ta = budget(endDeg(a), end.b), tb = budget(end.b, endDeg(b));
      if (ta < 0 || tb < 0) return null;
      // allowed: endpoint bands only (a box in the middle of a path does not add exceptions)
      const sa = run('leg' + a, startsOf(a), allow(a, a), ta);
      const sb = run('leg' + b, startsOf(b), allow(b, b), tb);
      let best = null;
      for (let id = 0; id < g.nx * g.ny; id++) {
        if (!g.ok[id]) continue;
        const p = [g.X[id % g.nx], g.Y[Math.floor(id / g.nx)]];
        // box not under a cabinet / rack; for UG keep it off pads and out of walk-critical zones where possible
        if (l.units.some(u => inRect(p, u, 0.4)) || inRect(p, ri.rect, 0.3)) continue;
        const ra = sa.best(id), rb = sb.best(id);
        if (!(ra.cost < Infinity && rb.cost < Infinity)) continue;
        let c = ra.cost + rb.cost;
        if (l.zones.some(z => inRect(p, z))) c += method === 'LR' ? 40 : 3;
        if (!best || c < best.cost) best = {cost: c, id, ra, rb};
      }
      if (!best) return null;
      const p1 = simplify(sa.path(best.ra.state)), p2 = simplify(sb.path(best.rb.state)).reverse();
      const pt = [g.X[best.id % g.nx], g.Y[Math.floor(best.id / g.nx)]];
      return {from: a, to: b, legs: [p1, p2], boxes: [pt], cost: best.cost + opt.boxCost, length: pathLen(p1) + pathLen(p2), turns: [turnsOf(p1), turnsOf(p2)]};
    }

    // hop table
    const nodes = [0, ...ids];
    const hop = new Map();
    const key = (a, b) => a + '>' + b;
    for (const a of nodes) for (const b of ids) {
      if (a === b) continue;
      const d = direct(a, b);
      hop.set(key(a, b), d || viaBox(a, b));
    }
    // pour model for UG cost: pads + gaps up to 4.1 ft between neighbouring units
    const pour = pourRects(l);
    const outsidePour = path => {
      let s = 0;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], L = segLen(a, b), k = Math.max(1, Math.ceil(L / 0.25));
        for (let t = 0; t < k; t++) {
          const p = [a[0] + (b[0] - a[0]) * (t + 0.5) / k, a[1] + (b[1] - a[1]) * (t + 0.5) / k];
          if (!pour.some(r => inRect(p, r, 0.01))) s += L / k;
        }
      }
      return s;
    };
    for (const h of hop.values()) if (h) {
      h.outside = method === 'UG' ? h.legs.reduce((s, p) => s + outsidePour(p), 0) : 0;
      h.base = h.cost + h.outside * opt.outsidePourCost;
    }

    // gate
    out.gate = opt._gate;
    out.gateMoved = !!(l.gate && out.gate && (out.gate.side !== l.gate.side || Math.abs(out.gate.from - l.gate.from) > 0.01));
    const baseWalk = walkEval(l, ri, wm, out.gate, []);

    // chain search: DP over (mask, last, count)
    const penalty = new Map();
        function solve(K0) {
      const cap = K0, M = 1 << n, K = cap + 1, L = n + 1;
      const F = new Float64Array(M * L * K).fill(Infinity), P = new Int32Array(M * L * K).fill(-1);
      const sidx = (m, last, c) => (m * L + last) * K + c;
      F[sidx(0, 0, 0)] = 0;
      const up = (wireFor(cap).cost - 1) * opt.copperCost;
      const hc = (a, b, c) => { const h = hop.get(key(a, b)); return h ? h.base + (penalty.get(key(a, b)) || 0) + up * h.length * Math.max(1, cap - c) : Infinity; };
      const order = [...Array(n).keys()].map(i => i + 1).concat([0]);
      for (let m = 0; m < M; m++) for (const last of order) for (let c = 0; c < K; c++) {
        const cur = F[sidx(m, last, c)]; if (cur === Infinity) continue;
        if (last !== 0) { const s = sidx(m, 0, 0); if (cur < F[s]) { F[s] = cur; P[s] = sidx(m, last, c); } }
        if (c + 1 >= K) continue;
        for (let j = 0; j < n; j++) if (!(m & (1 << j))) {
          const a = last === 0 ? 0 : ids[last - 1], b = ids[j];
          let h = hc(a, b, c); if (h === Infinity) continue;
          if (last === 0) h += opt.chainCost;
          const s = sidx(m | (1 << j), j + 1, c + 1), v = cur + h;
          if (v < F[s]) { F[s] = v; P[s] = sidx(m, last, c); }
        }
      }
      const full = M - 1, bs = sidx(full, 0, 0);
      if (F[bs] === Infinity) return null;
      const seq = []; let s = bs;
      while (s >= 0) { seq.push(s); s = P[s]; }
      seq.reverse();
      const chains = []; let cur = null;
      for (const st of seq) {
        const last = Math.floor(st / K) % L;
        if (last === 0) { if (cur && cur.length) chains.push(cur); cur = []; }
        else if (cur && cur.at(-1) !== ids[last - 1]) cur.push(ids[last - 1]);
      }
      if (cur && cur.length) chains.push(cur);
      return chains;
    }
    // copper cost is length dependent: add it after the DP as part of the exact score, and nudge with chainCost.
    function evaluate(chains) {
      const hops = [];
      for (const ch of chains) ch.forEach((b, k) => hops.push({h: hop.get(key(k ? ch[k - 1] : 0, b)), down: ch.length - k, chain: ch}));
      const boxes = hops.reduce((s, x) => s + x.h.boxes.length, 0);
      const length = hops.reduce((s, x) => s + x.h.length, 0);
      const outside = hops.reduce((s, x) => s + x.h.outside, 0);
      let walk = {steps: 0, detour: 0, missing: 0, list: []};
      if (method === 'LR') {
        const segs = [];
        for (const x of hops) for (const p of x.h.legs) for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
        walk = walkScore(walkEval(l, ri, wm, out.gate, segs), baseWalk);
      }
      let copper = 0;
      for (const ch of chains) { const w = wireFor(ch.length); copper += (w.cost - 1) * opt.copperCost * ch.length * hops.filter(x => x.chain === ch).reduce((s, x) => s + x.h.length, 0); }
      const score = boxes * opt.boxCost + (walk.steps + walk.missing * 3) * opt.stepCost + walk.detour * opt.detourCost + outside * opt.outsidePourCost + length + copper + chains.length * opt.chainCost;
      return {chains, hops, boxes, length, outside, walk, copper, score};
    }
    let best = null;
    const hardCap = Math.min(n, opt.lugCap || 6), caps = opt.maxPerChain > 0 ? [Math.min(opt.maxPerChain, hardCap)] : [...Array(hardCap).keys()].map(i => i + 1);
    for (const K of caps) {
      penalty.clear();
      for (let it = 0; it < (method === 'LR' ? 5 : 1); it++) {
        const chains = solve(K);
        if (!chains) break;
        const ev = evaluate(chains);
        if (!best || ev.score < best.score - 1e-6) best = ev;
        if (method !== 'LR' || !ev.walk.steps && !ev.walk.detour) break;
        for (const x of ev.hops) {
          const segs = [];
          for (const y of ev.hops) if (y !== x) for (const p of y.h.legs) for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
          const w = walkScore(walkEval(l, ri, wm, out.gate, segs), baseWalk);
          const gain = (ev.walk.steps - w.steps) * opt.stepCost + (ev.walk.detour - w.detour) * opt.detourCost;
          if (gain > 1) { const k = key(x.h.from, x.h.to); penalty.set(k, (penalty.get(k) || 0) + gain); }
        }
      }
    }
    if (!best) { out.messages.push('No legal chain found'); return out; }

    // assemble output
    let pb = 0;
    out.chains = best.chains.map((ch, ci) => ({id: ci + 1, units: ch.slice(), wire: wireFor(ch.length)}));
    for (const x of best.hops) {
      const h = x.h, chain = out.chains.find(c => c.units.includes(h.to));
      const w = chain.wire, cccDown = x.down;
      const area = 3 * cccDown * w.area + 0.0211 * (w.i ? 1.8 : 1); // + one EGC (upsized when the phase conductors are)
      const legs = h.legs.map((p, k) => {
        const fromDeg = k === 0 ? endDeg(h.from) : end.b, toDeg = k === h.legs.length - 1 ? endDeg(h.to) : end.b;
        const t = turnsOf(p);
        return {path: p, turns: t, horizontalDeg: t * 90, endDeg: fromDeg + toDeg, totalDeg: fromDeg + toDeg + t * 90, length: pathLen(p)};
      });
      const boxIds = h.boxes.map(p => { pb++; const b = {id: 'PB' + pb, point: p, kind: method === 'UG' ? 'in-grade pull box / handhole' : 'pull box on the conduit rack', between: [h.from, h.to]}; out.pullBoxes.push(b); return b.id; });
      out.hops.push({chain: chain.id, from: h.from, to: h.to, legs, boxes: boxIds, length: h.length, circuits: cccDown,
        conduit: conduitFor(area), dataConduit: conduitFor(0.0415 * cccDown), outsidePour: h.outside});
    }
    out.boxes = best.boxes; out.length = best.length; out.outsidePour = best.outside; out.walk = best.walk; out.score = best.score;
    out.maxDeg = Math.max(0, ...out.hops.flatMap(h => h.legs.map(g => g.totalDeg)));
    if (out.maxDeg > 360) out.messages.push('A pull segment exceeds 360 degrees');
    if (method === 'LR' && best.walk.steps) out.warnings.push('Step-overs at grade: ' + best.walk.list.join('; '));
    if (method === 'LR' && best.walk.missing) out.messages.push(best.walk.missing + ' working space(s) cut off by at-grade conduit');
    for (const c of out.chains) if (c.wire.i > 0) out.warnings.push(`Chain ${c.id} carries ${c.units.length} circuits in one conduit: about ${c.wire.size} per circuit after derating (${Math.round(c.wire.factor * 100)}%), engineer to size`);
    return out;
  }

  function route(l, method, options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    if (method !== 'LR' || opt.gate) return routeOne(l, method, opt);
    // at grade the gate and the conduit decide each other: try the best gate spots plus the catalog gate
    const ri = rackInfo(l), wm = walkModel(l, ri, opt), gc = chooseGate(l, ri, wm, l.gate);
    const gates = [];
    if (gc) for (const r of gc.ranked.slice(0, opt.gateTries || 4)) gates.push({gate: r.gate, extra: 0});
    if (l.gate && !gates.some(g => g.gate.side === l.gate.side && Math.abs(g.gate.from - l.gate.from) < 0.01)) gates.push({gate: Object.assign({len: 12}, l.gate), extra: 0});
    let best = null;
    for (const g of gates) {
      const r = routeOne(l, method, Object.assign({}, opt, {gate: g.gate}));
      if (!r.hops.length) continue;
      const rd = gc && gc.ranked.find(x => x.gate.side === g.gate.side && Math.abs(x.gate.from - g.gate.from) < 0.01);
      r.score += 3 * (rd ? rd.rackDist : 30);
      if (!best || r.score < best.score) best = r;
    }
    return best || routeOne(l, method, opt);
  }

  function pourRects(l) {
    const rs = l.units.map(u => ({x: u.x - 0.5, y: u.y - 0.5, w: u.w + 1, h: u.h + 1}));
    const us = l.units;
    for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
      const a = us[i], b = us[j];
      const oy0 = Math.max(a.y, b.y), oy1 = Math.min(a.y + a.h, b.y + b.h), ox0 = Math.max(a.x, b.x), ox1 = Math.min(a.x + a.w, b.x + b.w);
      if (oy1 - oy0 > 1) { const g0 = Math.min(a.x + a.w, b.x + b.w), g1 = Math.max(a.x, b.x); if (g1 - g0 > 0 && g1 - g0 <= 4.1) rs.push({x: g0, y: oy0, w: g1 - g0, h: oy1 - oy0}); }
      if (ox1 - ox0 > 1) { const g0 = Math.min(a.y + a.h, b.y + b.h), g1 = Math.max(a.y, b.y); if (g1 - g0 > 0 && g1 - g0 <= 4.1) rs.push({x: ox0, y: g0, w: ox1 - ox0, h: g1 - g0}); }
    }
    return rs;
  }

  /* fence widening study for at-grade: try +1..+3 ft on each side, return the best improvement */
  function widen(l, options, baseResult) {
    const res = [];
    const xs = l.fence.map(p => p[0]), ys = l.fence.map(p => p[1]);
    const ext = {W: Math.min(...xs), E: Math.max(...xs), S: Math.min(...ys), N: Math.max(...ys)};
    for (const side of ['N', 'S', 'E', 'W']) for (const d of [1, 2, 3]) {
      const c = JSON.parse(JSON.stringify(l));
      const ax = side === 'E' || side === 'W' ? 0 : 1, v = ext[side];
      if (side === 'W' || side === 'S') {
        const sh = p => { p[ax] += d; };
        for (const u of c.units) { u[ax ? 'y' : 'x'] += d; if (u.stub) sh(u.stub); }
        for (const z of c.zones) z[ax ? 'y' : 'x'] += d;
        if (c.rack.side !== side) c.rack[ax ? 'y' : 'x'] += d;
        if (c.gate && c.gate.side !== side) { if ((ax === 0 && (c.gate.side === 'N' || c.gate.side === 'S')) || (ax === 1 && (c.gate.side === 'E' || c.gate.side === 'W'))) c.gate.from += d; }
        for (const p of c.fence) if (Math.abs(p[ax] - v) > EPS) p[ax] += d;
        if (ax === 0) c.W += d; else c.D += d;
      } else {
        for (const p of c.fence) if (Math.abs(p[ax] - v) < EPS) p[ax] += d;
        if (c.rack.side === side) c.rack[ax ? 'y' : 'x'] += d;
        if (ax === 0) c.W += d; else c.D += d;
      }
      const r = route(c, 'LR', Object.assign({}, options, {gateTries: 2}));
      res.push({side, feet: d, score: r.score, steps: r.walk ? r.walk.steps : null, boxes: r.boxes, layout: c, result: r});
    }
    res.sort((a, b) => a.score - b.score);
    const best = res[0];
    if (!best || !baseResult || best.score > baseResult.score - 150) return null;
    return best;
  }

  function recommendGate(l) {
    const opt = Object.assign({}, DEFAULTS), ri = rackInfo(l), wm = walkModel(l, ri, opt), g = chooseGate(l, ri, wm, l.gate);
    return g ? g.gate : null;
  }

  return {route, widen, recommendGate, face, bandRect, rackInfo, wireFor, conduitFor, DEFAULTS, pourRects, edges};
});
