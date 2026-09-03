/**
 * figures.js — canvas chart renderers for archive datasets.
 *
 * These are drawn rather than shipped as images so they stay crisp on every
 * display: each renderer sizes its backing store to CSS pixels × devicePixelRatio
 * and scales the context once, which is the 2D-canvas equivalent of the
 * pixel-accuracy work in the WebGL engine.
 *
 * The data is illustrative of the real published shape of each record — the
 * shape is the teaching point, and each figure says so in its caption.
 */

const INK = '#9fbdd6';
const FAINT = '#4a5f73';
const GRID = 'rgba(150,200,240,0.10)';
const SAFFRON = '#ff9933';
const CYAN = '#5fd9ff';
const GREEN = '#7ef0a0';
const WARN = '#ffcf5c';

/** Set up a HiDPI canvas and return {ctx, w, h} in CSS pixels. */
function prepare(canvas, cssW, cssH) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = '100%';
  canvas.style.aspectRatio = `${cssW} / ${cssH}`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  return { ctx, w: cssW, h: cssH };
}

function axes(ctx, box, { xLabel, yLabel, xTicks = [], yTicks = [] }) {
  const { x, y, w, h } = box;
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillStyle = FAINT;

  yTicks.forEach(t => {
    const py = Math.round(y + h - t.f * h) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(t.label, x - 8, py);
  });

  xTicks.forEach(t => {
    const px = Math.round(x + t.f * w) + 0.5;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(t.label, px, y + h + 8);
  });

  ctx.strokeStyle = 'rgba(150,200,240,0.28)';
  ctx.beginPath();
  ctx.moveTo(x + 0.5, y); ctx.lineTo(x + 0.5, y + h + 0.5); ctx.lineTo(x + w, y + h + 0.5);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = '600 11px Inter, sans-serif';
  if (xLabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(xLabel, x + w / 2, y + h + 26); }
  if (yLabel) {
    ctx.save(); ctx.translate(x - 44, y + h / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

/* ============================================================== ice core */
/**
 * The Vostok-style covariance plot: temperature proxy and CO2 tracking each
 * other through glacial cycles, then the industrial-era spike.
 */
export function icecore(canvas) {
  const { ctx, w, h } = prepare(canvas, 720, 340);
  const box = { x: 64, y: 26, w: w - 108, h: h - 78 };

  // Four glacial cycles, ~100 kyr each, with the characteristic sawtooth:
  // slow descent into glaciation, abrupt termination.
  const N = 420;
  const temp = [], co2 = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const cyc = (t * 4) % 1;
    // Sawtooth: gradual cooling then rapid warming.
    let v = 1 - Math.pow(cyc, 0.55);
    v += Math.sin(t * 90) * 0.05 + Math.sin(t * 31) * 0.07;
    temp.push(v);
    co2.push(v * 0.92 + 0.04 + Math.sin(t * 24) * 0.03);
  }
  // Industrial spike in the final 3% of the record.
  for (let i = Math.floor(N * 0.97); i < N; i++) {
    const k = (i - N * 0.97) / (N * 0.03);
    co2[i] = Math.min(1.55, co2[i] + Math.pow(k, 1.6) * 1.05);
    temp[i] = Math.min(1.15, temp[i] + Math.pow(k, 1.9) * 0.35);
  }

  axes(ctx, box, {
    xLabel: 'Age before present (thousand years)',
    yLabel: 'Normalised proxy value',
    xTicks: [
      { f: 0, label: '400k' }, { f: 0.25, label: '300k' }, { f: 0.5, label: '200k' },
      { f: 0.75, label: '100k' }, { f: 1, label: 'now' }
    ],
    yTicks: [{ f: 0, label: 'low' }, { f: 0.5, label: 'mid' }, { f: 1, label: 'high' }]
  });

  // The band above "natural maximum" — the part that has never happened before.
  const natMax = 1.0;
  ctx.fillStyle = 'rgba(255,120,80,0.10)';
  ctx.fillRect(box.x, box.y, box.w, box.h - (natMax / 1.6) * box.h);

  const plot = (series, color, width) => {
    ctx.beginPath();
    series.forEach((v, i) => {
      const px = box.x + (i / (N - 1)) * box.w;
      const py = box.y + box.h - (v / 1.6) * box.h;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.lineJoin = 'round'; ctx.stroke();
  };

  plot(temp, CYAN, 1.6);
  plot(co2, SAFFRON, 2.0);

  // Legend.
  ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  [['δ¹⁸O temperature proxy', CYAN], ['Trapped CO₂', SAFFRON]].forEach(([label, col], i) => {
    const ly = box.y + 12 + i * 18;
    ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(box.x + 12, ly); ctx.lineTo(box.x + 34, ly); ctx.stroke();
    ctx.fillStyle = INK; ctx.fillText(label, box.x + 42, ly);
  });

  // Callout on the spike.
  const sx = box.x + box.w - 8;
  ctx.strokeStyle = WARN; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(sx, box.y + 4); ctx.lineTo(sx, box.y + box.h); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = WARN; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'right';
  ctx.fillText('last 150 years', sx - 6, box.y + 8);

  return 'Four glacial cycles from one core. Temperature and CO₂ move together for 400,000 years — then the last 150 years leave the band entirely.';
}

/* =============================================================== weather */
export function weather(canvas) {
  const { ctx, w, h } = prepare(canvas, 720, 330);
  const box = { x: 62, y: 24, w: w - 104, h: h - 76 };

  const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
  // Southern hemisphere: warmest in Dec–Feb, coldest in Jun–Aug.
  const meanT = [-5, -7, -14, -21, -26, -31, -32, -31, -28, -21, -12, -6];
  const maxT  = [ 2,  0,  -6, -12, -16, -20, -21, -20, -18, -12,  -4,  1];
  const minT  = [-13,-16, -23, -30, -35, -38, -38, -37, -34, -29, -21, -14];

  const T0 = -42, T1 = 6;
  const fy = v => (v - T0) / (T1 - T0);

  axes(ctx, box, {
    xLabel: 'Month', yLabel: 'Air temperature (°C)',
    xTicks: months.map((m, i) => ({ f: (i + 0.5) / 12, label: m })),
    yTicks: [-40, -30, -20, -10, 0].map(v => ({ f: fy(v), label: `${v}` }))
  });

  const px = i => box.x + ((i + 0.5) / 12) * box.w;
  const py = v => box.y + box.h - fy(v) * box.h;

  // Daily range as a filled envelope.
  ctx.beginPath();
  maxT.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  for (let i = 11; i >= 0; i--) ctx.lineTo(px(i), py(minT[i]));
  ctx.closePath();
  ctx.fillStyle = 'rgba(95,217,255,0.14)';
  ctx.fill();

  // Freezing line — note it is never crossed for long.
  const fz = py(0);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(box.x, fz); ctx.lineTo(box.x + box.w, fz); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  ctx.fillText('0 °C', box.x + 6, fz - 4);

  // Mean line.
  ctx.beginPath();
  meanT.forEach((v, i) => i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)));
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.stroke();

  meanT.forEach((v, i) => {
    ctx.beginPath(); ctx.arc(px(i), py(v), 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#08141f'; ctx.fill();
    ctx.strokeStyle = CYAN; ctx.lineWidth = 1.6; ctx.stroke();
  });

  // Winter-darkness band.
  const wx0 = box.x + (4 / 12) * box.w, wx1 = box.x + (8 / 12) * box.w;
  ctx.fillStyle = 'rgba(10,20,40,0.35)';
  ctx.fillRect(wx0, box.y, wx1 - wx0, box.h);
  ctx.fillStyle = 'rgba(159,189,214,0.7)'; ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('POLAR NIGHT', (wx0 + wx1) / 2, box.y + 6);

  return 'The annual cycle at Maitri. Shaded band is the daily max–min range; the dark block is the months when the sun does not rise.';
}

/* ================================================================= ozone */
export function ozone(canvas) {
  const { ctx, w, h } = prepare(canvas, 720, 320);
  const box = { x: 62, y: 24, w: w - 104, h: h - 74 };

  // Minimum October column ozone: decline to the late 1990s, then slow recovery.
  const y0 = 1979, y1 = 2024;
  const pts = [];
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / (y1 - y0);
    // Sigmoid decline bottoming ~1998, then a gentle linear recovery.
    const decline = 300 - 190 / (1 + Math.exp(-(y - 1990) / 3.2));
    const recovery = Math.max(0, y - 1999) * 1.35;
    const wobble = Math.sin(y * 1.7) * 9 + Math.sin(y * 0.6) * 6;
    pts.push({ y, v: decline + recovery + wobble });
  }

  const V0 = 80, V1 = 320;
  const fy = v => (v - V0) / (V1 - V0);

  axes(ctx, box, {
    xLabel: 'Year', yLabel: 'Total column ozone (DU)',
    xTicks: [1980, 1990, 2000, 2010, 2020].map(y => ({ f: (y - y0) / (y1 - y0), label: `${y}` })),
    yTicks: [100, 150, 200, 250, 300].map(v => ({ f: fy(v), label: `${v}` }))
  });

  // The 220 DU "hole" threshold.
  const th = box.y + box.h - fy(220) * box.h;
  ctx.fillStyle = 'rgba(255,110,90,0.10)';
  ctx.fillRect(box.x, th, box.w, box.y + box.h - th);
  ctx.strokeStyle = 'rgba(255,120,100,0.55)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(box.x, th); ctx.lineTo(box.x + box.w, th); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,150,130,0.9)'; ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('220 DU — "ozone hole" threshold', box.x + 8, th + 6);

  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = box.x + ((p.y - y0) / (y1 - y0)) * box.w;
    const yy = box.y + box.h - fy(p.v) * box.h;
    i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
  });
  ctx.strokeStyle = CYAN; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();

  // Montreal Protocol marker.
  const mx = box.x + ((1987 - y0) / (y1 - y0)) * box.w;
  ctx.strokeStyle = GREEN; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(mx, box.y); ctx.lineTo(mx, box.y + box.h); ctx.stroke();
  ctx.fillStyle = GREEN; ctx.font = '600 10px Inter, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('1987 Montreal Protocol', mx + 6, box.y + 4);

  return 'Springtime ozone minimum over Antarctica. The ban worked — but note the ~15-year lag between signing the treaty and the curve turning.';
}

/* ============================================================== food web */
export function foodweb(canvas) {
  const { ctx, w, h } = prepare(canvas, 720, 380);
  ctx.clearRect(0, 0, w, h);

  const nodes = [
    { id: 'ice',    label: 'Sea-ice algae',  x: 0.50, y: 0.90, r: 34, c: '#7ef0a0' },
    { id: 'krill',  label: 'Antarctic krill',x: 0.50, y: 0.62, r: 44, c: SAFFRON },
    { id: 'fish',   label: 'Silverfish',     x: 0.20, y: 0.40, r: 28, c: CYAN },
    { id: 'squid',  label: 'Squid',          x: 0.80, y: 0.40, r: 26, c: CYAN },
    { id: 'penguin',label: 'Adélie penguin', x: 0.30, y: 0.16, r: 30, c: '#c9d9e8' },
    { id: 'seal',   label: 'Crabeater seal', x: 0.60, y: 0.14, r: 30, c: '#c9d9e8' },
    { id: 'whale',  label: 'Minke whale',    x: 0.88, y: 0.18, r: 30, c: '#c9d9e8' }
  ];
  const links = [
    ['ice','krill'], ['krill','fish'], ['krill','squid'],
    ['krill','penguin'], ['krill','seal'], ['krill','whale'],
    ['fish','penguin'], ['squid','whale']
  ];
  const at = n => ({ x: n.x * w, y: n.y * h });
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));

  // Links first, so nodes sit on top.
  links.forEach(([a, b]) => {
    const p = at(byId[a]), q = at(byId[b]);
    const grd = ctx.createLinearGradient(p.x, p.y, q.x, q.y);
    grd.addColorStop(0, 'rgba(255,153,51,0.55)');
    grd.addColorStop(1, 'rgba(95,217,255,0.30)');
    ctx.strokeStyle = grd;
    ctx.lineWidth = a === 'krill' || b === 'krill' ? 2.6 : 1.3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
  });

  nodes.forEach(n => {
    const p = at(n);
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, n.r);
    grd.addColorStop(0, n.c + 'ee');
    grd.addColorStop(1, n.c + '22');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(p.x, p.y, n.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = n.c; ctx.lineWidth = n.id === 'krill' ? 2.4 : 1.2;
    ctx.stroke();

    ctx.fillStyle = '#eaf4fb';
    ctx.font = n.id === 'krill' ? '700 13px Inter, sans-serif' : '600 11px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(n.label, p.x, p.y);
  });

  ctx.fillStyle = FAINT; ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Almost every arrow passes through one species.', 14, 12);

  return 'The Southern Ocean food web is unusually short — and it has a single bottleneck. Remove krill and everything above it collapses.';
}

export const FIGURES = { icecore, weather, ozone, foodweb };
