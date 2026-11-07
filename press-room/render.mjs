// Renders the GitHub profile edition of the Press Room from data.json: the
// scene and the cover-line cards in light + dark editions, the README block
// that shows them, and a local preview page. Drawing code is ported from the
// portfolio's assets/js/magazine/press-room.js; fonts are the portfolio's own.
import fs from 'node:fs/promises';
import npath from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const here = npath.dirname(fileURLToPath(import.meta.url));
const repo = npath.resolve(here, '..');
const outDir = npath.join(repo, 'assets/press-room');
const fontsCss = npath.join(here, 'fonts/fonts.css');
const data = JSON.parse(await fs.readFile(npath.join(here, 'data.json'), 'utf8'));
const SITE = 'https://llbartolome-portfolio.vercel.app';

/* ------------------------------------------------------------------ */
/* Editions                                                            */
/* ------------------------------------------------------------------ */

const EDITIONS = {
  light: {
    paper: '#f3ece0', paper2: '#ebe1d1', ink: '#2a1d13', inkSoft: '#5a4331', muted: '#7a5c42', rule: '#d4c4ae',
    terra: '#9c502c', clay: '#c4956a', choc: '#1e150e', onChoc: '#f3ece0', grain: 0.05,
    line: '#2a1d13', shade: '#2a1d13', floor: '#ecdfc9', wall: '#f1e8d9', wood: '#d9bf98', woodDark: '#a77b52',
    sheet: '#fbf7ef', metal: '#cfc4b3', machine: '#6e5948', press: '#8c4a2b', chair: '#e8dcc8', cork: '#c99c6c',
    rug: '#e3cfb0', brass: '#c9a15a', water: '#a9bdb4', pot: '#b8653d', leaf: '#7f8a5a', screen: '#241a12',
    pool: 0.7,
  },
  dark: {
    paper: '#16100b', paper2: '#1f1710', ink: '#efe6d8', inkSoft: '#d4c3ad', muted: '#b09579', rule: '#3b2c20',
    terra: '#d9885c', clay: '#a8764c', choc: '#0d0906', onChoc: '#efe6d8', grain: 0.04,
    line: '#0b0705', shade: '#000000', floor: '#2a1f16', wall: '#33261b', wood: '#6b4f35', woodDark: '#4a3221',
    sheet: '#e9dfcf', metal: '#5d5145', machine: '#3b2f26', press: '#7a3e22', chair: '#4a3b2d', cork: '#6e4c2f',
    rug: '#3a2a1d', brass: '#b48b45', water: '#4f6660', pot: '#8c4a2b', leaf: '#59603d', screen: '#0d0a07',
    pool: 0.8,
  },
};

// The window follows the clock in Manila, whatever edition the reader is in.
const SKIES = {
  dawn: { top: '#c9b2b0', bottom: '#f2c9a4', city: '#8d7268', sun: [1.55, 1.0, 0.16, '#f1b77a'], lit: 2 },
  day: { top: '#efe3cc', bottom: '#f7ead2', city: '#b3a18c', sun: [1.65, 0.42, 0.18, '#e5a55e'], clouds: true, lit: 0 },
  dusk: { top: '#5e4458', bottom: '#e8956a', city: '#3a2a30', sun: [1.62, 1.08, 0.2, '#f0a96a'], lit: 3 },
  night: { top: '#0f1422', bottom: '#1d2436', city: '#0b0d14', moon: true, lit: 5 },
};

/* ------------------------------------------------------------------ */
/* Time, in Manila                                                     */
/* ------------------------------------------------------------------ */

// --at=<ISO time> renders the room as it would look then (sky, clock, stamps).
const atArg = process.argv.find((a) => a.startsWith('--at='));
const fetched = new Date(atArg ? atArg.slice(5) : data.fetchedAt);
const mnl = new Date(fetched.getTime() + 8 * 3600e3); // UTC+8, no DST
const hh = mnl.getUTCHours(), mm = mnl.getUTCMinutes();
const minutes = hh * 60 + mm;
const phase = minutes < 300 ? 'night' : minutes < 420 ? 'dawn' : minutes < 1020 ? 'day' : minutes < 1170 ? 'dusk' : 'night';
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const pad = (n) => String(n).padStart(2, '0');
const stampTime = `${pad(hh)}:${pad(mm)}`;
const stampDate = `${DAYS[mnl.getUTCDay()]} ${pad(mnl.getUTCDate())} ${MONTHS[mnl.getUTCMonth()]} ${mnl.getUTCFullYear()}`;

function ago(iso) {
  const h = Math.round((fetched - new Date(iso)) / 3600e3);
  if (h < 1) return 'just now';
  if (h < 24) return h + 'h ago';
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : d + ' days ago';
}
const fmt = (n) => n.toLocaleString('en-US');

/* ------------------------------------------------------------------ */
/* Projection helpers (press-room.js)                                  */
/* ------------------------------------------------------------------ */

const VW = 940, VH = 640;
const K = 40, OX = 414, OY = 176;
const RW = 12, RD = 9, RH = 3.4;
const DESKS = [[3.85, 3.25], [5.85, 3.25], [7.85, 3.25], [4.85, 6.0], [6.85, 6.0]];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function P(x, y, z) { return [OX + (x - y) * K, OY + (x + y) * K / 2 - (z || 0) * K]; }
function f1(n) { return Math.round(n * 10) / 10; }
function path(list, cls) {
  return '<path class="' + cls + '" d="M' + list.map((p) => {
    const s = P(p[0], p[1], p[2]); return f1(s[0]) + ' ' + f1(s[1]);
  }).join(' L') + 'Z"/>';
}
function box(x, y, z, w, d, h, m, faces) {
  const t = z + h, s = faces || 'tlr';
  let out = '<g class="' + m + '">';
  if (s.includes('t')) out += path([[x, y, t], [x + w, y, t], [x + w, y + d, t], [x, y + d, t]], 'f-t');
  if (s.includes('l')) out += path([[x, y + d, z], [x + w, y + d, z], [x + w, y + d, t], [x, y + d, t]], 'f-l');
  if (s.includes('r')) out += path([[x + w, y, z], [x + w, y + d, z], [x + w, y + d, t], [x + w, y, t]], 'f-r');
  return out + '</g>';
}
function cyl(x, y, z, r, h, m) {
  const b = P(x, y, z), t = P(x, y, z + h), rx = f1(r * K * Math.SQRT2), ry = f1(r * K * Math.SQRT2 / 2);
  return '<g class="' + m + '"><path class="f-l" d="M' + f1(t[0] - rx) + ' ' + f1(t[1]) + ' L' + f1(b[0] - rx) + ' ' + f1(b[1]) +
    ' A' + rx + ' ' + ry + ' 0 0 0 ' + f1(b[0] + rx) + ' ' + f1(b[1]) + ' L' + f1(t[0] + rx) + ' ' + f1(t[1]) + 'Z"/>' +
    '<ellipse class="f-t" cx="' + f1(t[0]) + '" cy="' + f1(t[1]) + '" rx="' + rx + '" ry="' + ry + '"/></g>';
}
const PLANES = { top: [K, K / 2, -K, K / 2], fy: [K, K / 2, 0, K], fx: [K, -K / 2, 0, K] };
function plane(m, x, y, z, inner, cls) {
  const s = P(x, y, z);
  return '<g class="pl' + (cls ? ' ' + cls : '') + '" transform="matrix(' + PLANES[m].join(',') + ',' + f1(s[0]) + ',' + f1(s[1]) + ')">' + inner + '</g>';
}
function r(x, y, w, h, cls, extra) {
  return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (extra || '') + '/>';
}
function ln(x1, y1, x2, y2, cls) {
  return '<line class="' + cls + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '"/>';
}
function txt(x, y, size, s, cls) {
  return '<text class="' + cls + '" x="' + x + '" y="' + y + '" font-size="' + size + '">' + esc(s) + '</text>';
}

/* ------------------------------------------------------------------ */
/* Furniture                                                           */
/* ------------------------------------------------------------------ */

function table(x, y, w, d, m) {
  const h = 0.72, l = 0.07;
  return box(x + 0.05, y + 0.05, 0, l, l, h, m) + box(x + w - 0.12, y + 0.05, 0, l, l, h, m) +
    box(x + 0.05, y + d - 0.12, 0, l, l, h, m) + box(x + w - 0.12, y + d - 0.12, 0, l, l, h, m) +
    box(x, y, h, w, d, 0.07, m);
}

function chair(x, y) {
  return box(x + 0.2, y + 0.2, 0, 0.06, 0.06, 0.4, 'm-ink') +
    box(x, y, 0.4, 0.5, 0.45, 0.07, 'm-chair') +
    box(x, y + 0.42, 0.47, 0.5, 0.06, 0.5, 'm-chair');
}

// A desk lamp, lit when the feature's repo saw commits in the last seven days.
function lamp(x, y, z, lit) {
  const b = P(x, y, z), j = [b[0] + 5, b[1] - 30], h = [b[0] - 12, b[1] - 24];
  const pool = P(x - 0.62, y + 0.32, z);
  let out = '';
  if (lit) {
    out += '<ellipse class="pool" cx="' + f1(pool[0]) + '" cy="' + f1(pool[1]) + '" rx="54" ry="24"/>';
    out += '<path class="beam" d="M' + f1(h[0] - 9) + ' ' + f1(h[1] + 2) + ' L' + f1(h[0] + 1) + ' ' + f1(h[1] + 7) +
      ' L' + f1(pool[0] + 34) + ' ' + f1(pool[1] + 4) + ' L' + f1(pool[0] - 36) + ' ' + f1(pool[1] - 8) + 'Z"/>';
  }
  out += '<ellipse class="lamp__base" cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" rx="7" ry="3.5"/>';
  out += '<path class="lamp__arm" d="M' + f1(b[0]) + ' ' + f1(b[1] - 1) + ' L' + f1(j[0]) + ' ' + f1(j[1]) + ' L' + f1(h[0] + 2) + ' ' + f1(h[1] - 3) + '"/>';
  out += '<circle class="lamp__joint" cx="' + f1(j[0]) + '" cy="' + f1(j[1]) + '" r="1.8"/>';
  out += '<path class="lamp__shade' + (lit ? ' is-lit' : '') + '" d="M' + f1(h[0] + 5) + ' ' + f1(h[1] - 6) + ' L' + f1(h[0] - 2) + ' ' + f1(h[1] - 4) +
    ' L' + f1(h[0] - 10) + ' ' + f1(h[1] + 3) + ' L' + f1(h[0] + 2) + ' ' + f1(h[1] + 8) + 'Z"/>';
  if (lit) {
    out += '<circle class="halo" cx="' + f1(h[0] - 4) + '" cy="' + f1(h[1] + 5) + '" r="13"/>' +
      '<ellipse class="lamp__bulb" cx="' + f1(h[0] - 4) + '" cy="' + f1(h[1] + 5) + '" rx="4" ry="2.4"/>';
  }
  return out;
}

function desk(x, y, slug, lit) {
  let out = path([[x + 0.1, y + 0.1, 0], [x + 1.75, y + 0.1, 0], [x + 1.75, y + 1.15, 0], [x + 0.1, y + 1.15, 0]], 'sh');
  out += box(x + 1.12, y + 0.08, 0, 0.42, 0.84, 0.72, 'm-metal');
  out += plane('fy', x + 1.12, y + 0.92, 0.72, ln(0.06, 0.24, 0.36, 0.24, 'pl-line') + ln(0.06, 0.48, 0.36, 0.48, 'pl-line') +
    r(0.15, 0.1, 0.12, 0.04, 'pl-ink') + r(0.15, 0.34, 0.12, 0.04, 'pl-ink') + r(0.15, 0.58, 0.12, 0.04, 'pl-ink'));
  out += table(x, y, 1.6, 1, 'm-wood');
  out += (PROPS[slug] || PROPS._)(x, y, 0.79);
  out += lamp(x + 1.42, y + 0.14, 0.79, lit);
  out += chair(x + 0.45, y + 1.25);
  return out;
}

const PROPS = {
  moneda(x, y, z) {
    return plane('top', x + 0.2, y + 0.22, z,
        r(0, 0, 0.36, 0.5, 'pl-sheet') + r(0.36, 0, 0.36, 0.5, 'pl-sheet') + ln(0.36, 0, 0.36, 0.5, 'pl-line') +
        ln(0.05, 0.1, 0.3, 0.1, 'pl-type') + ln(0.05, 0.18, 0.3, 0.18, 'pl-type') + ln(0.05, 0.26, 0.24, 0.26, 'pl-type') +
        ln(0.42, 0.1, 0.66, 0.1, 'pl-type') + ln(0.42, 0.18, 0.62, 0.18, 'pl-type') + ln(0.42, 0.3, 0.66, 0.3, 'pl-terra')) +
      plane('top', x + 0.25, y + 0.78, z, r(0, 0, 0.38, 0.12, 'pl-sheet') + ln(0.04, 0.06, 0.3, 0.06, 'pl-type')) +
      cyl(x + 1.05, y + 0.3, z, 0.08, 0.1, 'm-brass') + cyl(x + 1.05, y + 0.3, z + 0.1, 0.08, 0.06, 'm-brass') +
      cyl(x + 1.3, y + 0.55, z, 0.08, 0.18, 'm-brass') + cyl(x + 1.25, y + 0.78, z, 0.08, 0.05, 'm-brass');
  },
  'realm-breaker'(x, y, z) {
    const boss = ['1001001', '1111111', '1011101', '1111111', '0101010'];
    let px = '';
    boss.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '1') px += r(0.2 + i * 0.03, 0.06 + j * 0.03, 0.03, 0.03, 'pl-px');
    });
    [[0.06, 0.12], [0.1, 0.26], [0.46, 0.1], [0.5, 0.24], [0.4, 0.28], [0.14, 0.2]].forEach((d) => { px += r(d[0], d[1], 0.025, 0.025, 'pl-px is-dim'); });
    return box(x + 0.45, y + 0.12, z, 0.7, 0.55, 0.5, 'm-machine') +
      plane('fy', x + 0.5, y + 0.67, z + 0.46,
        r(0, 0, 0.6, 0.38, 'pl-screen') + px + ln(0.2, 0.23, 0.41, 0.23, 'pl-glitch') + txt(0.05, 0.35, 0.06, 'WAVE 10', 'pl-mono')) +
      plane('top', x + 0.5, y + 0.76, z,
        r(0, 0, 0.42, 0.16, 'pl-phone', ' rx="0.07"') +
        ln(0.07, 0.08, 0.13, 0.08, 'pl-glitch') + ln(0.1, 0.05, 0.1, 0.11, 'pl-glitch') +
        '<circle class="pl-px" cx="0.3" cy="0.06" r="0.018"/><circle class="pl-px is-dim" cx="0.34" cy="0.1" r="0.018"/>') +
      plane('top', x + 0.1, y + 0.2, z, '<path class="pl-cable" d="M0.36 0.2 C0.1 0.3 0.25 0.6 0.05 0.75"/>');
  },
  aqualogic(x, y, z) {
    return box(x + 0.15, y + 0.15, z, 0.85, 0.45, 0.05, 'm-ink') +
      box(x + 0.17, y + 0.17, z + 0.05, 0.81, 0.41, 0.26, 'm-water', 'lr') +
      plane('fy', x + 0.17, y + 0.58, z + 0.36,
        '<path class="pl-fish" d="M0.3 0.16 q0.08 -0.06 0.16 0 l0.06 -0.04 v0.08 l-0.06 -0.04 q-0.08 0.06 -0.16 0z"/>' +
        '<path class="pl-weed" d="M0.62 0.36 q-0.05 -0.1 0 -0.2 q0.05 -0.08 0 -0.14 M0.68 0.36 q0.04 -0.08 0 -0.16"/>' +
        '<circle class="pl-bubble" cx="0.2" cy="0.12" r="0.02"/><circle class="pl-bubble" cx="0.23" cy="0.05" r="0.015"/>' +
        r(0, 0.31, 0.81, 0.05, 'pl-gravel')) +
      box(x + 0.15, y + 0.15, z + 0.31, 0.85, 0.45, 0.06, 'm-glass') +
      plane('top', x + 1.05, y + 0.62, z, r(0, 0, 0.32, 0.3, 'pl-sheet') + r(0.1, -0.03, 0.12, 0.05, 'pl-ink') +
        ln(0.05, 0.1, 0.27, 0.1, 'pl-type') + ln(0.05, 0.17, 0.2, 0.17, 'pl-type') + '<path class="pl-terra-line" d="M0.05 0.26 l0.06 -0.04 l0.06 0.02 l0.08 -0.05"/>');
  },
  memorylane(x, y, z) {
    let shots = '';
    for (let i = 0; i < 4; i++) {
      shots += '<g transform="translate(' + (0.04 + i * 0.27) + ' ' + (i % 2 ? 0.03 : 0) + ')">' +
        r(0, 0, 0.22, 0.25, 'pl-sheet') + r(0.025, 0.025, 0.17, 0.15, i === 3 ? 'pl-photo is-now' : 'pl-photo') + '</g>';
    }
    return box(x + 0.62, y + 0.32, z, 0.2, 0.12, 0.04, 'm-ink') + box(x + 0.69, y + 0.36, z + 0.04, 0.06, 0.04, 0.2, 'm-ink') +
      box(x + 0.35, y + 0.28, z + 0.2, 0.75, 0.06, 0.42, 'm-machine') +
      plane('fy', x + 0.39, y + 0.34, z + 0.58, r(0, 0, 0.67, 0.34, 'pl-screen') +
        r(0.05, 0.06, 0.12, 0.09, 'pl-thumb') + r(0.2, 0.06, 0.12, 0.09, 'pl-thumb') + r(0.35, 0.06, 0.12, 0.09, 'pl-thumb') +
        r(0.5, 0.06, 0.12, 0.09, 'pl-thumb is-now') + ln(0.05, 0.24, 0.62, 0.24, 'pl-glitch is-dim')) +
      plane('top', x + 0.2, y + 0.6, z, '<path class="pl-thread" d="M0 0.02 H1.1"/>' + shots);
  },
  whisk(x, y, z) {
    const tm = P(x + 0.35, y + 0.3, z), cat = P(x + 1.12, y + 0.42, z);
    return plane('top', x + 0.55, y + 0.45, z,
        r(0, 0, 0.24, 0.42, 'pl-phone', ' rx="0.04"') + r(0.02, 0.04, 0.2, 0.32, 'pl-screen') +
        '<circle class="pl-ring-bg" cx="0.12" cy="0.18" r="0.07"/><path class="pl-ring" d="M0.12 0.11 A0.07 0.07 0 1 1 0.05 0.18"/>') +
      '<g class="tomato" transform="translate(' + f1(tm[0]) + ' ' + f1(tm[1]) + ')">' +
        '<ellipse class="sh" cx="2" cy="0" rx="10" ry="4"/>' +
        '<path class="tomato__body" d="M-9 -7 a9 8 0 1 0 18 0 a9 8 0 1 0 -18 0z"/>' +
        '<path class="tomato__band" d="M-8.4 -9.5 q8.4 3.5 16.8 0"/>' +
        '<path class="tomato__leaf" d="M0 -15 l-4 -2 l3 3 l-4 1 l5 0 l1 3 l1 -3 l5 0 l-4 -1 l3 -3z"/></g>' +
      '<g class="miso" transform="translate(' + f1(cat[0]) + ' ' + f1(cat[1]) + ')">' +
        '<ellipse class="sh" cx="2" cy="1" rx="17" ry="5"/>' +
        '<path class="miso__tail" d="M12 -2 q8 6 -2 8 q-12 2 -20 -2"/>' +
        '<path class="miso__body" d="M-14 -3 q0 -11 13 -11 q13 0 14 9 q1 7 -13 7 q-14 0 -14 -5z"/>' +
        '<path class="miso__stripe" d="M-2 -13 q1 3 -1 5 M4 -12 q1 3 -1 5 M9 -10 q1 3 -1 4"/>' +
        '<path class="miso__head" d="M-17 -6 q-1 -8 7 -8 l1 -5 l3 4 l3 -4 l1 6 q3 3 1 7 q-3 4 -9 3 q-6 0 -7 -3z"/>' +
        '<path class="miso__eye" d="M-13 -7 q2 1.5 4 0"/>' +
        '<text class="miso__z" x="-2" y="-20">z</text><text class="miso__z is-2" x="4" y="-27">z</text></g>';
  },
  _(x, y, z) {
    return plane('top', x + 0.3, y + 0.25, z, r(0, 0, 0.4, 0.5, 'pl-sheet') + ln(0.06, 0.12, 0.32, 0.12, 'pl-type'));
  },
};

/* ------------------------------------------------------------------ */
/* The room                                                            */
/* ------------------------------------------------------------------ */

function shell() {
  let planks = '';
  for (let y = 0.6; y < RD; y += 0.6) planks += ln(0, y, RW, y, 'pl-plank');
  return path([[0, RD, -0.45], [RW, RD, -0.45], [RW, RD, 0], [0, RD, 0]], 'cut') +
    path([[RW, 0, -0.45], [RW, RD, -0.45], [RW, RD, 0], [RW, 0, 0]], 'cut') +
    path([[0, 0, 0], [RW, 0, 0], [RW, RD, 0], [0, RD, 0]], 'floor') +
    plane('top', 0, 0, 0, planks) +
    path([[-0.3, -0.3, RH], [RW, -0.3, RH], [RW, 0, RH], [-0.3, 0, RH]], 'cut') +
    path([[RW, -0.3, 0], [RW, 0, 0], [RW, 0, RH], [RW, -0.3, RH]], 'cut') +
    path([[0, 0, 0], [RW, 0, 0], [RW, 0, RH], [0, 0, RH]], 'wall wall--y') +
    path([[-0.3, 0, RH], [0, 0, RH], [0, RD, RH], [-0.3, RD, RH]], 'cut') +
    path([[-0.3, RD, 0], [0, RD, 0], [0, RD, RH], [-0.3, RD, RH]], 'cut') +
    path([[0, 0, 0], [0, RD, 0], [0, RD, RH], [0, 0, RH]], 'wall wall--x') +
    plane('fy', 0, 0, 1, ln(0, 0, RW, 0, 'pl-rail') + ln(0, 0.92, RW, 0.92, 'pl-skirt')) +
    plane('fx', 0, RD, 1, ln(0, 0, RD, 0, 'pl-rail') + ln(0, 0.92, RD, 0.92, 'pl-skirt')) +
    plane('top', 3.6, 3.0, 0, r(0, 0, 5.1, 5.4, 'pl-rug') + r(0.12, 0.12, 4.86, 5.16, 'pl-rug-edge'));
}

function windowView() {
  const s = SKIES[phase];
  let v = r(-0.06, -0.06, 2.32, 1.62, 'pl-frame') + r(0, 0, 2.2, 1.5, 'pl-sky');
  if (s.sun) v += '<circle class="pl-sun" cx="' + s.sun[0] + '" cy="' + s.sun[1] + '" r="' + s.sun[2] + '" fill="' + s.sun[3] + '"/>';
  if (s.clouds) v += '<path class="pl-cloud" d="M0.3 0.4 h0.5 M0.5 0.5 h0.45"/>';
  if (s.moon) {
    v += '<path class="pl-moon" d="M1.7 0.24 a0.2 0.2 0 1 0 0.12 0.36 a0.16 0.16 0 1 1 -0.12 -0.36z"/>' +
      [[0.4, 0.3, 0.02], [0.9, 0.18, 0.015], [1.2, 0.45, 0.02], [0.2, 0.55, 0.012], [1.95, 0.2, 0.014]]
        .map((c) => '<circle class="pl-star" cx="' + c[0] + '" cy="' + c[1] + '" r="' + c[2] + '"/>').join('');
  }
  v += '<path class="pl-skyline" d="M0 1.5 V1.0 h0.25 v-0.22 h0.2 v0.32 h0.18 V0.7 h0.22 v0.4 h0.3 V0.9 h0.18 v-0.35 h0.12 v0.35 h0.2 v0.2 h0.3 V0.8 h0.25 v0.7z"/>';
  v += [[0.5, 0.82], [1.02, 0.95], [1.4, 0.75], [0.3, 1.1], [1.9, 1.0]].slice(0, s.lit)
    .map((p) => r(p[0], p[1], 0.04, 0.04, 'pl-lit')).join('');
  return plane('fy', 4.0, 0, 2.85, v + ln(1.1, 0, 1.1, 1.5, 'pl-mullion') + ln(0, 0.75, 2.2, 0.75, 'pl-mullion') + r(-0.1, 1.5, 2.4, 0.08, 'pl-sill'));
}

function clock() {
  let ticks = '';
  for (let i = 0; i < 12; i++) ticks += '<line class="pl-tick" x1="0" y1="-0.19" x2="0" y2="' + (i % 3 ? -0.17 : -0.15) + '" transform="rotate(' + i * 30 + ')"/>';
  const hourDeg = ((hh % 12) + mm / 60) * 30, minDeg = mm * 6;
  return plane('fy', 6.6, 0, 2.6,
    '<g transform="translate(0.3 0.3)"><circle class="pl-clock" r="0.24"/>' + ticks +
    '<line class="pl-hand" x1="0" y1="0" x2="0" y2="-0.11" transform="rotate(' + f1(hourDeg) + ')"/>' +
    '<line class="pl-hand is-min" x1="0" y1="0" x2="0" y2="-0.17" transform="rotate(' + minDeg + ')"/>' +
    '<circle class="pl-pivot" r="0.02"/>' + txt(0, 0.12, 0.05, 'MNL', 'pl-clock-txt') + '</g>');
}

function framedCover() {
  return plane('fx', 0, 4.25, 2.7,
    r(0, 0, 0.8, 1.05, 'pl-frame') + r(0.06, 0.06, 0.68, 0.93, 'pl-cover') +
    txt(0.12, 0.26, 0.15, 'Issue', 'pl-cover-t') + txt(0.12, 0.42, 0.15, '01.', 'pl-cover-t is-terra') +
    ln(0.12, 0.52, 0.62, 0.52, 'pl-line') + r(0.12, 0.6, 0.5, 0.3, 'pl-cover-img'));
}

function leaves(x, y, z, s) {
  const c = P(x, y, z);
  return '<g class="leaves" transform="translate(' + f1(c[0]) + ' ' + f1(c[1]) + ') scale(' + s + ')">' +
    '<path d="M0 0 q-22 -14 -20 -38 q12 10 20 38z"/><path d="M0 0 q20 -16 18 -40 q-14 12 -18 40z"/>' +
    '<path d="M0 0 q-6 -26 4 -48 q8 22 -4 48z"/><path d="M0 0 q-28 -2 -34 -18 q18 0 34 18z"/><path d="M0 0 q28 -4 32 -22 q-18 2 -32 22z"/></g>';
}

function office() {
  const x2 = 3.4, y2 = 2.9, gh = 2.5;
  return plane('top', 0, 0, 0, r(0, 0, x2, y2, 'pl-office')) +
    box(0.5, 0.25, 0, 0.5, 0.45, 0.4, 'm-chair') + box(0.5, 0.25, 0.4, 0.5, 0.06, 0.55, 'm-chair') +
    table(0.35, 0.75, 1.7, 0.8, 'm-dark') +
    plane('top', 0.55, 0.9, 0.79, r(0, 0, 0.4, 0.3, 'pl-sheet') + r(0.08, 0.06, 0.24, 0.03, 'pl-terra-fill') + ln(0.06, 0.16, 0.3, 0.16, 'pl-type')) +
    box(1.3, 0.92, 0.79, 0.45, 0.32, 0.18, 'm-paper') +
    cyl(1.9, 1.05, 0.79, 0.06, 0.1, 'm-ink') +
    cyl(2.9, 0.45, 0, 0.22, 0.45, 'm-pot') + leaves(2.9, 0.45, 0.45, 1) +
    path([[x2, 0, 0], [x2, y2, 0], [x2, y2, gh], [x2, 0, gh]], 'glass') +
    plane('fx', x2, y2, gh, ln(0.97, 0, 0.97, gh, 'pl-mull') + ln(1.93, 0, 1.93, gh, 'pl-mull') + ln(0, 0.05, y2, 0.05, 'pl-mull')) +
    path([[0, y2, 0], [x2, y2, 0], [x2, y2, gh], [0, y2, gh]], 'glass') +
    plane('fy', 0, y2, gh,
      ln(1.0, 0, 1.0, gh, 'pl-mull') + ln(0, 0.05, x2, 0.05, 'pl-mull') +
      r(1.95, 0.35, 0.95, gh - 0.35, 'pl-door') + r(2.06, 0.5, 0.73, 0.9, 'pl-door-glass') +
      txt(2.42, 1.0, 0.12, 'EDITOR', 'pl-stencil') +
      r(2.74, 1.55, 0.1, 0.09, 'pl-lock') + '<path class="pl-lock-loop" d="M2.76 1.55 v-0.04 a0.03 0.03 0 0 1 0.06 0 v0.04"/>') +
    box(x2 - 0.03, 0, 0, 0.06, y2, 0.05, 'm-ink', 'tr') + box(0, y2 - 0.03, 0, x2, 0.06, 0.05, 'm-ink', 'tl');
}

function cabinets() {
  let out = '';
  [9.65, 10.4, 11.15].forEach((cx, i) => {
    out += box(cx, 0.05, 0, 0.7, 0.8, 1.55, 'm-metal');
    out += plane('fy', cx, 0.85, 1.55,
      ln(0.04, 0.5, 0.66, 0.5, 'pl-line') + ln(0.04, 1.02, 0.66, 1.02, 'pl-line') +
      [0.2, 0.72, 1.24].map((v) => r(0.24, v, 0.22, 0.05, 'pl-handle') + r(0.27, v - 0.13, 0.16, 0.08, 'pl-card')).join(''));
    if (i === 1) {
      out += box(cx + 0.06, 0.85, 0.55, 0.58, 0.55, 0.42, 'm-metal', 'lr') +
        plane('top', cx + 0.08, 0.87, 0.97, [0.06, 0.16, 0.26, 0.36, 0.46].map((v, j) =>
          r(0.04, v, 0.46, 0.06, 'pl-file' + (j === 2 ? ' is-out' : ''))).join(''));
    }
  });
  return out + plane('fy', 9.65, 0.05, 1.55, txt(1.12, -0.06, 0.13, 'ARCHIVE', 'pl-stencil'));
}

// One proof pinned up per pull request merged in the last thirty days.
function corkboard(n) {
  const clips = [[0.12, 0.14, -4], [0.5, 0.18, 3], [0.9, 0.1, -2], [1.3, 0.2, 4], [0.28, 0.6, 2], [0.72, 0.64, -3], [1.14, 0.58, 3]];
  return plane('fy', 7.35, 0, 2.75,
    r(-0.05, -0.05, 1.9, 1.35, 'pl-frame') + r(0, 0, 1.8, 1.25, 'pl-cork') +
    clips.slice(0, n).map((c, i) =>
      '<g transform="translate(' + c[0] + ' ' + c[1] + ') rotate(' + c[2] + ')">' + r(0, 0, 0.32, 0.36, 'pl-sheet') +
      r(0.04, 0.06, 0.24, 0.12, 'pl-commit') + ln(0.04, 0.24, 0.24, 0.24, 'pl-type') +
      '<circle class="' + (i % 2 ? 'pl-pin' : 'pl-pin is-ink') + '" cx="0.16" cy="0.04" r="0.035"/></g>').join('') +
    (n > 1 ? '<path class="pl-string" d="M0.28 0.18 L0.66 0.22 L1.06 0.14 L1.46 0.24 M0.66 0.22 L0.88 0.68"/>' : ''));
}

function typewriter() {
  let keys = '';
  for (let a = 0; a < 3; a++) for (let b = 0; b < 6; b++) keys += '<circle class="pl-key" cx="' + (0.06 + a * 0.08) + '" cy="' + (0.08 + b * 0.09 + a * 0.02) + '" r="0.028"/>';
  return table(0.12, 4.3, 0.95, 1.55, 'm-wood') +
    box(0.3, 4.72, 0.79, 0.62, 0.72, 0.18, 'm-machine') +
    box(0.28, 4.66, 0.97, 0.14, 0.84, 0.1, 'm-ink') +
    plane('fx', 0.36, 5.32, 1.42, r(0, 0, 0.5, 0.44, 'pl-sheet') + ln(0.06, 0.1, 0.42, 0.1, 'pl-type') + ln(0.06, 0.18, 0.36, 0.18, 'pl-type') + ln(0.06, 0.26, 0.4, 0.26, 'pl-type')) +
    plane('top', 0.62, 4.78, 0.97, keys) +
    plane('top', 0.2, 4.4, 0.79, r(0, 0, 0.3, 0.22, 'pl-sheet') + r(0.06, 1.08, 0.3, 0.22, 'pl-sheet', ' transform="rotate(-10 0.2 1.2)"')) +
    cyl(1.55, 5.05, 0, 0.05, 0.45, 'm-ink') + cyl(1.55, 5.05, 0.45, 0.22, 0.06, 'm-chair');
}

// The press. The stack of fresh sheets grows with today's contributions.
function press(today) {
  let wheel = '';
  for (let i = 0; i < 6; i++) wheel += '<line class="pl-spoke" x1="0" y1="0" x2="0" y2="-0.42" transform="rotate(' + i * 60 + ')"/>';
  const stack = 0.06 + Math.min(0.3, Math.log10(1 + today) * 0.14);
  return path([[8.8, 6.0, 0], [11.7, 6.0, 0], [11.7, 8.5, 0], [8.8, 8.5, 0]], 'sh') +
    box(8.7, 5.9, 0, 2.9, 2.45, 0.5, 'm-machine') +
    plane('fy', 8.7, 8.35, 0.5, txt(1.45, 0.32, 0.17, 'THE PRESS · No.' + data.total, 'pl-stencil is-light')) +
    box(8.95, 6.1, 0.5, 2.4, 1.3, 0.75, 'm-press') +
    box(9.05, 6.22, 1.25, 2.2, 0.36, 0.3, 'm-roller') +
    box(9.05, 6.76, 1.25, 2.2, 0.36, 0.3, 'm-roller') +
    plane('top', 9.05, 6.22, 1.55, ln(0, 0.18, 2.2, 0.18, 'pl-gleam') + ln(0, 0.72, 2.2, 0.72, 'pl-gleam')) +
    plane('fy', 8.95, 7.4, 1.25, r(0.15, 0.22, 0.5, 0.3, 'pl-gauge') + '<circle class="pl-dial" cx="1.15" cy="0.38" r="0.15"/>' +
      ln(1.15, 0.38, 1.24, 0.3, 'pl-needle') + r(1.6, 0.25, 0.6, 0.06, 'pl-terra-fill')) +
    plane('fx', 11.35, 7.1, 1.25, '<g transform="translate(0.75 0.38)"><circle class="pl-wheel" r="0.32"/><g class="spin">' + wheel + '</g><circle class="pl-hub" r="0.07"/></g>') +
    box(9.25, 7.55, 0.5, 0.95, 0.65, stack, 'm-paper') +
    plane('top', 9.25, 7.55, 0.5 + stack, r(0.08, 0.08, 0.5, 0.06, 'pl-terra-fill') + ln(0.08, 0.24, 0.8, 0.24, 'pl-type') + ln(0.08, 0.34, 0.7, 0.34, 'pl-type') + ln(0.08, 0.44, 0.76, 0.44, 'pl-type')) +
    box(10.45, 7.6, 0.5, 0.9, 0.6, 0.06, 'm-paper');
}

// Letters through the slot, one per follower (up to six).
function door(letters) {
  const spots = [[0.3, 7.2, -14], [0.42, 7.52, 18], [0.18, 7.55, 6], [0.5, 7.05, -24], [0.12, 7.0, 10], [0.45, 7.75, -6]];
  return plane('fx', 0, 7.95, 2.15,
      r(-0.06, -0.06, 1.17, 2.21, 'pl-frame') + r(0, 0, 1.05, 2.15, 'pl-door is-solid') +
      r(0.12, 0.14, 0.8, 0.7, 'pl-panel') + r(0.12, 1.1, 0.8, 0.9, 'pl-panel') +
      r(0.3, 0.94, 0.45, 0.07, 'pl-slot') + '<circle class="pl-knob" cx="0.15" cy="1.02" r="0.045"/>') +
    plane('top', 0.08, 6.95, 0, r(0, 0, 0.75, 1.0, 'pl-mat')) +
    spots.slice(0, letters).map((s, i) => plane('top', s[0], s[1], 0.01,
      '<g transform="rotate(' + s[2] + ' 0.18 0.12)">' + r(0, 0, 0.36, 0.24, 'pl-sheet') + '<path class="pl-line" d="M0 0 L0.18 0.12 L0.36 0"/>' +
      (i % 2 ? '' : r(0.28, 0.03, 0.05, 0.06, 'pl-terra-fill')) + '</g>')).join('');
}

function courier() {
  return '<g class="you__bob">' +
      '<ellipse class="sh" cx="4" cy="0" rx="16" ry="6"/>' +
      '<g class="you__leg"><path d="M-6 -24 h5 v22 h-5z"/><path class="you__shoe" d="M-8 -3 h8 v3 h-9z"/></g>' +
      '<g class="you__leg"><path d="M2 -24 h5 v22 h-5z"/><path class="you__shoe" d="M1 -3 h8 l1 3 h-9z"/></g>' +
      '<path class="you__coat" d="M-11 -50 q11 -5 22 0 l3 28 q-14 4 -28 0z"/>' +
      '<path class="you__strap" d="M-9 -49 L10 -26"/>' +
      '<path class="you__bag" d="M5 -31 h11 v10 h-11z"/>' +
      '<path class="you__flap" d="M5 -31 h11 v4 h-11z"/>' +
      '<path class="you__scarf" d="M-8 -51 q8 4 16 0 l0 4 q-8 4 -16 0z M4 -48 l3 12 l-4 1z"/>' +
      '<circle class="you__head" cx="0" cy="-59" r="8"/>' +
      '<path class="you__cap" d="M-8.5 -60 q0 -9 8.5 -9 q8.5 0 8.5 9z M-3 -61 h15 v2.5 h-15z"/>' +
      '<circle class="you__eye" cx="3" cy="-57" r="1"/>' +
    '</g>';
}

function plant() { return cyl(11.3, 4.4, 0, 0.24, 0.5, 'm-pot') + leaves(11.3, 4.4, 0.5, 1.15); }

function bin() {
  return plane('top', 3.62, 6.62, 0.005, '<g transform="rotate(12 0.2 0.15)">' + r(0, 0, 0.42, 0.32, 'pl-sheet') +
      ln(0.05, 0.08, 0.36, 0.08, 'pl-type') + ln(0.05, 0.15, 0.3, 0.15, 'pl-type') + ln(0.05, 0.22, 0.34, 0.22, 'pl-type') +
      '<circle class="pl-proof" cx="0.3" cy="0.15" r="0.06"/></g>') +
    cyl(3.3, 6.5, 0, 0.18, 0.42, 'm-bin') +
    '<g class="balls">' + ['3.23,6.45', '3.37,6.52', '3.3,6.62'].map((s) => {
      const q = s.split(','), c = P(+q[0], +q[1], 0.44);
      return '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="5"/>';
    }).join('') + '</g>';
}

/* ------------------------------------------------------------------ */
/* Tags: the data, written onto the drawing                            */
/* ------------------------------------------------------------------ */

// Rough advance widths, enough to size a tag around its text.
const capsW = (s, size) => s.length * size * 0.78;
const serifW = (s, size) => s.length * size * 0.5;

// A callout: `at` is the world point it names, `c` the centre of its box in
// room pixels. Boxes sit in the empty corners round the cutaway where they can.
function tag(at, c, kicker, line, kind) {
  const a = P(at[0], at[1], at[2]);
  const w = Math.ceil(Math.max(capsW(kicker, 9.5), serifW(line, 13)) + 22), h = 36, top = f1(c[1] - h / 2), x = f1(c[0] - w / 2);
  // the leader leaves the box from the edge point nearest the thing it names
  const ex = f1(Math.min(Math.max(a[0], x + 8), x + w - 8)), ey = f1(Math.min(Math.max(a[1], top), top + h));
  return '<g class="tag tag--' + kind + '">' +
    '<line class="tag__lead" x1="' + ex + '" y1="' + ey + '" x2="' + f1(a[0]) + '" y2="' + f1(a[1]) + '"/>' +
    '<circle class="tag__dot" cx="' + f1(a[0]) + '" cy="' + f1(a[1]) + '" r="2.4"/>' +
    '<rect class="tag__box" x="' + x + '" y="' + f1(top) + '" width="' + w + '" height="' + h + '" rx="1.5"/>' +
    '<text class="tag__k" x="' + f1(x + 11) + '" y="' + f1(top + 14) + '">' + esc(kicker) + '</text>' +
    '<text class="tag__l" x="' + f1(x + 11) + '" y="' + f1(top + 29) + '">' + esc(line) + '</text></g>';
}

function deskLine(d) {
  if (d.week === null) return 'drafts kept private';
  if (d.week) return d.week + (d.week === 1 ? ' commit' : ' commits') + ' this week';
  if (d.month) return 'quiet · ' + d.month + ' this month';
  return 'between drafts';
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

function mix(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v * t + pb[i] * (1 - t)).toString(16).padStart(2, '0')).join('');
}

function css(T) {
  const sky = SKIES[phase];
  const mats = { wood: T.wood, dark: T.woodDark, metal: T.metal, machine: T.machine, press: T.press, roller: '#2a1d13', ink: '#3a2a1e',
    chair: T.chair, paper: T.sheet, brass: T.brass, pot: T.pot, bin: T.metal };
  const matCss = Object.entries(mats).map(([k, c]) =>
    `.m-${k} .f-t{fill:${c}}.m-${k} .f-l{fill:${mix(c, T.shade, 0.82)}}.m-${k} .f-r{fill:${mix(c, T.shade, 0.66)}}`).join('');
  return `
  .serif{font-family:'Playfair Display',Georgia,serif}
  .sans{font-family:'DM Sans','Segoe UI',system-ui,sans-serif}
  .bg{fill:${T.paper}} #grain line{stroke:${T.ink};stroke-opacity:${T.grain}}
  .crop{fill:none;stroke:${T.ink};stroke-width:1}
  .rule{stroke:${T.ink};stroke-width:1} .rule--soft{stroke:${T.rule};stroke-width:1}
  .rh{font:500 10.5px 'DM Sans',sans-serif;letter-spacing:2.2px;fill:${T.inkSoft}}
  .rh--terra{fill:${T.terra}} .rh-name{font:600 15px 'Playfair Display',serif;fill:${T.ink}}
  .live{fill:${T.terra};animation:live 2.4s ease-in-out infinite}
  .kicker{font:500 10.5px 'DM Sans',sans-serif;letter-spacing:2.4px;fill:${T.terra}}
  .title{font:400 60px 'Playfair Display',serif;letter-spacing:-1.2px;fill:${T.ink}}
  .title em,.it{font-style:italic;fill:${T.terra}}
  .dek{font:400 14.5px 'DM Sans',sans-serif;fill:${T.inkSoft}}
  .stat-k{font:500 9.5px 'DM Sans',sans-serif;letter-spacing:1.9px;fill:${T.muted}}
  .stat-v{font:400 38px 'Playfair Display',serif;fill:${T.terra}}
  .stat-u{font:italic 400 17px 'Playfair Display',serif;fill:${T.terra}}
  .small{font:400 11.5px 'DM Sans',sans-serif;fill:${T.muted}}
  .small b{font-weight:500;fill:${T.ink}}
  .colophon{font:500 9.5px 'DM Sans',sans-serif;letter-spacing:1.9px;fill:${T.muted}}

  path,rect,ellipse,circle,line{stroke-linejoin:round;stroke-linecap:round}
  .pl *{vector-effect:non-scaling-stroke}
  .f-t,.f-l,.f-r{stroke:${T.line};stroke-width:1}
  ${matCss}
  .m-water .f-l,.m-water .f-r{fill:${T.water};fill-opacity:.75}
  .m-glass .f-t,.m-glass .f-l,.m-glass .f-r{fill:none}
  .sh{fill:${T.shade};opacity:.12;stroke:none}
  .floor{fill:${T.floor};stroke:${T.line};stroke-width:1.2}
  .pl-plank{stroke:${T.line};stroke-width:.6;opacity:.16}
  .wall{stroke:${T.line};stroke-width:1.2} .wall--y{fill:${T.wall}} .wall--x{fill:${mix(T.wall, T.shade, 0.88)}}
  .cut{fill:url(#pr-cut);stroke:${T.line};stroke-width:1.2} .cut-bg{fill:${T.paper}} .cut-line{stroke:${T.ink};stroke-width:1.4;opacity:.6}
  .pl-rail{stroke:${T.terra};stroke-width:1.2;opacity:.6} .pl-skirt{stroke:${T.line};stroke-width:2.4;opacity:.5}
  .pl-rug{fill:${T.rug};stroke:${T.line};stroke-width:1} .pl-rug-edge{fill:none;stroke:${T.terra};stroke-width:1;stroke-dasharray:2 4;opacity:.8}
  .pl-office{fill:${mix(T.floor, T.shade, 0.86)}}
  .glass{fill:${sky.bottom};fill-opacity:.3;stroke:${T.line};stroke-width:1.2}
  .pl-mull{stroke:${T.line};stroke-width:1.2}
  .pl-door{fill:${T.terra};fill-opacity:.18;stroke:${T.terra};stroke-width:2}
  .pl-door.is-solid{fill:${T.woodDark};fill-opacity:1;stroke:${T.line};stroke-width:1.2}
  .pl-door-glass{fill:none;stroke:${T.terra};stroke-width:1}
  .pl-panel{fill:none;stroke:${T.line};stroke-width:1;opacity:.55}
  .pl-slot,.pl-knob{fill:${T.brass};stroke:${T.line};stroke-width:1}
  .pl-mat{fill:${T.terra};opacity:.55;stroke:${T.line};stroke-width:1}
  .pl-stencil{font-family:'DM Sans',sans-serif;font-weight:700;letter-spacing:.06em;fill:${T.line};text-anchor:middle;opacity:.7}
  .pl-stencil.is-light{fill:${T.sheet};opacity:.85}
  .pl-lock{fill:${T.terra}} .pl-lock-loop{fill:none;stroke:${T.terra};stroke-width:1.4}
  .pl-sheet{fill:${T.sheet};stroke:${T.line};stroke-width:1}
  .pl-line{fill:none;stroke:${T.line};stroke-width:1;opacity:.7}
  .pl-type{stroke:#8a6a4e;stroke-width:1.3} .pl-terra{stroke:#a0522d;stroke-width:1.6}
  .pl-terra-line{fill:none;stroke:#a0522d;stroke-width:1.4} .pl-terra-fill{fill:#a0522d} .pl-ink{fill:#2a1d13}
  .pl-handle{fill:${T.line}} .pl-card,.pl-file{fill:${T.sheet};stroke:${T.line};stroke-width:.8} .pl-file.is-out{fill:#a0522d}
  .pl-frame{fill:${T.woodDark};stroke:${T.line};stroke-width:1.2}
  .pl-cork{fill:${T.cork};stroke:${T.line};stroke-width:1}
  .pl-commit{fill:#a0522d;opacity:.75} .pl-pin{fill:#a0522d;stroke:${T.line};stroke-width:.6} .pl-pin.is-ink{fill:#2a1d13}
  .pl-string{fill:none;stroke:#a0522d;stroke-width:1}
  .pl-sky{fill:url(#sky);stroke:${T.line};stroke-width:1}
  .pl-cloud{fill:none;stroke:#fff;stroke-width:2.4;opacity:.8}
  .pl-moon,.pl-star{fill:#efe2c3}
  .pl-skyline{fill:${sky.city}} .pl-lit{fill:#e5a55e}
  .pl-mullion{stroke:${T.woodDark};stroke-width:2.4} .pl-sill{fill:${T.wood};stroke:${T.line};stroke-width:1}
  .pl-clock{fill:${T.sheet};stroke:${T.line};stroke-width:1.6}
  .pl-tick{stroke:#2a1d13;stroke-width:1} .pl-hand{stroke:#2a1d13;stroke-width:2} .pl-hand.is-min{stroke:#a0522d;stroke-width:1.4} .pl-pivot{fill:#2a1d13}
  .pl-clock-txt{font-family:'DM Sans',sans-serif;font-weight:500;fill:#7a5c42;text-anchor:middle}
  .pl-cover{fill:${T.sheet}} .pl-cover-t{font-family:'Playfair Display',serif;fill:#2a1d13} .pl-cover-t.is-terra{fill:#a0522d;font-style:italic}
  .pl-cover-img{fill:#c4956a;opacity:.6}
  .pl-screen{fill:${T.screen};stroke:${T.line};stroke-width:1}
  .pl-glitch{stroke:#d9885c;stroke-width:1.4} .pl-glitch.is-dim{opacity:.45}
  .pl-mono{font-family:Consolas,ui-monospace,monospace;fill:#e5a55e}
  .pl-px{fill:#d9885c} .pl-px.is-dim{fill:#e5a55e;opacity:.5}
  .pl-cable{fill:none;stroke:#2a1d13;stroke-width:1.6}
  .pl-fish{fill:#c8643a} .pl-weed{fill:none;stroke:#6f7a49;stroke-width:1.4} .pl-bubble{fill:none;stroke:#fff;stroke-width:.8;opacity:.8}
  .pl-gravel{fill:#b49a78} .pl-photo{fill:#c4956a;opacity:.7} .pl-photo.is-now,.pl-thumb.is-now{fill:#a0522d;opacity:1}
  .pl-thumb{fill:#6e5948} .pl-thread{fill:none;stroke:#a0522d;stroke-width:1} .pl-phone{fill:#2a1d13}
  .pl-ring-bg{fill:none;stroke:#5a4331;stroke-width:1.6} .pl-ring{fill:none;stroke:#d9885c;stroke-width:2}
  .pl-proof{fill:none;stroke:#a0522d;stroke-width:1.2}
  .tomato__body{fill:#b8462a;stroke:${T.line};stroke-width:1} .tomato__band{fill:none;stroke:#f3ece0;stroke-width:.8;opacity:.7}
  .tomato__leaf{fill:#6f7a49;stroke:${T.line};stroke-width:.6}
  .miso__body,.miso__head{fill:#d8b48a;stroke:${T.line};stroke-width:1}
  .miso__tail{fill:none;stroke:#a87b4f;stroke-width:3} .miso__stripe{fill:none;stroke:#a87b4f;stroke-width:1.4}
  .miso__eye{fill:none;stroke:#2a1d13;stroke-width:1}
  .miso__z{font:italic 600 9px 'Playfair Display',serif;fill:${T.terra};animation:z 3s ease-in-out infinite}
  .miso__z.is-2{font-size:7px;animation-delay:1.5s}
  .pl-key{fill:${T.sheet};stroke:${T.line};stroke-width:.8}
  .pl-gleam{stroke:#f3ece0;stroke-width:1;opacity:.35}
  .pl-gauge,.pl-dial{fill:${T.sheet};stroke:${T.line};stroke-width:1.1}
  .pl-needle{stroke:#a0522d;stroke-width:1.4}
  .pl-wheel{fill:none;stroke:#2a1d13;stroke-width:3} .pl-spoke{stroke:#2a1d13;stroke-width:1.6} .pl-hub{fill:#c9a15a;stroke:#2a1d13;stroke-width:1}
  .spin{transform-box:view-box;transform-origin:0 0;animation:spin 14s linear infinite}
  .balls circle{fill:${T.sheet};stroke:${T.line};stroke-width:1}
  .leaves path{fill:${T.leaf};stroke:${T.line};stroke-width:1}
  .you__leg path{fill:#3a2a1e} .you__leg .you__shoe{fill:#1e150e}
  .you__coat{fill:#5a4331;stroke:${T.line};stroke-width:1} .you__strap{stroke:#2a1d13;stroke-width:2}
  .you__bag{fill:#a77b52;stroke:${T.line};stroke-width:1} .you__flap{fill:#8c5f3a;stroke:${T.line};stroke-width:1}
  .you__scarf{fill:#b8562f;stroke:${T.line};stroke-width:.8} .you__head{fill:#d9b38c;stroke:${T.line};stroke-width:1}
  .you__cap,.you__eye{fill:#2a1d13}
  .you__bob{animation:breathe 2.6s ease-in-out infinite}

  .lamp__base,.lamp__joint{fill:#2a1d13} .lamp__arm{fill:none;stroke:#2a1d13;stroke-width:2}
  .lamp__shade{fill:${T.machine};stroke:${T.line};stroke-width:1} .lamp__shade.is-lit{fill:#e8894f} .halo{fill:url(#glow);opacity:.9}
  .lamp__bulb{fill:#ffe2a8}
  .pool{fill:url(#glow);opacity:${T.pool};animation:flicker 5s ease-in-out infinite}
  .beam{fill:#ffd18a;opacity:${T.pool * 0.22}}

  .tag__lead{stroke:${T.ink};stroke-width:1} .tag__dot{fill:${T.ink}}
  .tag__box{fill:${T.paper};stroke:${T.ink};stroke-width:1}
  .tag__k{font:500 9.5px 'DM Sans',sans-serif;letter-spacing:1.6px;fill:${T.terra}}
  .tag__l{font:italic 400 13px 'Playfair Display',serif;fill:${T.ink}}
  .tag--lit .tag__box{fill:${T.choc};stroke:${T.terra}} .tag--lit .tag__l{fill:${T.onChoc}} .tag--lit .tag__k{fill:${mix(T.terra, '#ffffff', 0.85)}}
  .tag--lit .tag__lead,.tag--lit .tag__dot{stroke:${T.terra};fill:${T.terra}}
  .tag--you .tag__box{fill:${T.terra};stroke:${T.terra}} .tag--you .tag__l{fill:${T.paper};font-style:normal;font-family:'DM Sans',sans-serif;font-size:11px;letter-spacing:1px}

  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes z{0%,100%{opacity:0;transform:translateY(2px)}40%,60%{opacity:1;transform:none}}
  @keyframes breathe{50%{transform:translateY(-1px)}}
  @keyframes flicker{0%,100%{opacity:${T.pool}}50%{opacity:${f1(T.pool * 0.8 * 100) / 100}}}
  @keyframes live{50%{opacity:.25}}
  @media (prefers-reduced-motion:reduce){*{animation:none!important}}
  `;
}

/* ------------------------------------------------------------------ */
/* Fonts: subset the woff2 files in fonts/ to what each SVG uses        */
/* ------------------------------------------------------------------ */

const fontFaces = await (async () => {
  const src = await fs.readFile(fontsCss, 'utf8');
  return [...src.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => {
    const block = m[1], get = (k) => (block.match(new RegExp(k + ':\\s*([^;]+);')) || [])[1]?.trim();
    const ranges = get('unicode-range').split(',').map((s) => {
      const [a, b] = s.trim().slice(2).split('-');
      return [parseInt(a, 16), parseInt(b || a, 16)];
    });
    return {
      family: get('font-family'), style: get('font-style'), weight: get('font-weight'), range: get('unicode-range'), ranges,
      file: npath.resolve(npath.dirname(fontsCss), get('src').match(/url\('([^']+)'\)/)[1]),
    };
  });
})();

function usedChars(svg) {
  const text = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')).join('')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
  return [...new Set(text)];
}

async function embedFonts(svg) {
  const chars = usedChars(svg);
  const faces = [];
  for (const f of fontFaces) {
    const mine = chars.filter((c) => f.ranges.some(([a, b]) => c.codePointAt(0) >= a && c.codePointAt(0) <= b));
    if (!mine.length) continue;
    // Playfair is only ever set at 400 here, so pin its weight axis; DM Sans keeps 400–500.
    const serif = f.family.includes('Playfair');
    const buf = await subsetFont(await fs.readFile(f.file), mine.join(''),
      { targetFormat: 'woff2', ...(serif && { variationAxes: { wght: 400 } }) });
    faces.push(`@font-face{font-family:${f.family};font-style:${f.style};font-weight:${serif ? 400 : f.weight};unicode-range:${f.range};` +
      `src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')}`);
  }
  return svg.replace('/*FONTS*/', faces.join('\n'));
}

/* ------------------------------------------------------------------ */
/* The scene                                                           */
/* ------------------------------------------------------------------ */

const W = 1000, H = 872, ROOM = [30, 184];

function defs(T) {
  const sky = SKIES[phase];
  return '<defs><style>/*FONTS*/' + css(T) + '</style>' +
    '<pattern id="pr-cut" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
      '<rect width="7" height="7" class="cut-bg"/><line x1="0" y1="0" x2="0" y2="7" class="cut-line"/></pattern>' +
    '<pattern id="grain" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">' +
      '<line x1="0" y1="0" x2="0" y2="14"/></pattern>' +
    '<radialGradient id="glow"><stop offset="0" stop-color="#ffd18a" stop-opacity="1"/><stop offset=".55" stop-color="#ffb867" stop-opacity=".45"/><stop offset="1" stop-color="#ffb867" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + sky.top + '"/><stop offset="1" stop-color="' + sky.bottom + '"/></linearGradient>' +
    '</defs>';
}

function cropMarks(w, h, inset, len) {
  const i = inset, l = len;
  return '<path class="crop" d="' +
    `M${i} ${i + l}V${i}H${i + l} M${w - i - l} ${i}H${w - i}V${i + l} M${i} ${h - i - l}V${h - i}H${i + l} M${w - i - l} ${h - i}H${w - i}V${h - i - l}` + '"/>';
}

function header(T) {
  const stats = [
    ['CONTRIBUTIONS', fmt(data.total), ''],
    ['ACTIVE DAYS', String(data.activeDays), ''],
    ['LONGEST STREAK', String(data.longestStreak), 'days'],
  ];
  const busiest = data.days.reduce((a, d) => (d.count > a.count ? d : a));
  const bd = new Date(busiest.date + 'T00:00:00Z');
  const stamp = stampDate + ' · ' + stampTime + ' MNL';
  let s = '';
  // running head
  s += '<text class="rh" x="40" y="43">ISSUE 01 · GITHUB EDITION</text>';
  s += '<text class="rh" x="960" y="43" text-anchor="end">' + esc(stamp) + '</text>';
  s += '<circle class="live" cx="' + f1(960 - stamp.length * 8 - 10) + '" cy="39.5" r="3.5"/>';
  s += '<line class="rule" x1="40" y1="56" x2="960" y2="56"/>';
  // title block
  s += '<text class="kicker" x="40" y="86">FOLD-OUT · CUTAWAY · REDRAWN FROM GITHUB</text>';
  s += '<text class="title" x="36" y="140">The Press <tspan class="it">Room.</tspan></text>';
  s += '<text class="dek" x="40" y="166">The office where Issue 01 gets made. A lamp burns</text>';
  s += '<text class="dek" x="40" y="185">on every desk whose project shipped this week.</text>';
  // ledger stats, set like the About page
  stats.forEach(([k, v, u], i) => {
    const x = 570 + i * 132;
    s += '<text class="stat-k" x="' + x + '" y="102">' + k + '</text>';
    s += '<text class="stat-v" x="' + (x - 2) + '" y="142">' + v + (u ? ' <tspan class="stat-u">' + u + '</tspan>' : '') + '</text>';
  });
  s += '<text class="small" x="570" y="170">Current run <tspan font-weight="500">' + data.currentStreak + ' days</tspan> · busiest day <tspan font-weight="500">' +
    busiest.count + '</tspan>, ' + bd.getUTCDate() + ' ' + MONTHS[bd.getUTCMonth()].charAt(0) + MONTHS[bd.getUTCMonth()].slice(1).toLowerCase() + '</text>';
  s += '<line class="rule" x1="40" y1="198" x2="960" y2="198"/><line class="rule" x1="40" y1="201" x2="960" y2="201"/>';
  return s;
}

function room() {
  const proofs = Math.max(1, Math.min(7, data.recentPRs.filter((p) => fetched - new Date(p.mergedAt) < 30 * 864e5).length));
  const desks = data.desks.map((d, i) => ({ ...d, at: DESKS[i] }));
  const nextIssue = Math.ceil((data.total + 1) / 500) * 500;
  const pct = Math.floor(data.total / nextIssue * 100);

  // Floor objects, back to front by the centre of their footprint.
  const solids = [
    { depth: 3.2, svg: office() },
    { depth: 5.98, svg: typewriter() },
    { depth: 8.6, svg: '<g transform="translate(' + P(1.3, 7.45, 0).map(f1).join(' ') + ')">' + courier() + '</g>' },
    { depth: 9.8, svg: bin() },
    { depth: 11.5, svg: cabinets() },
    { depth: 15.7, svg: plant() },
    { depth: 17.3, svg: press(data.today) },
    ...desks.map((d) => ({ depth: d.at[0] + d.at[1] + 1.67, svg: desk(d.at[0], d.at[1], d.slug, d.week > 0) })),
  ].sort((a, b) => a.depth - b.depth);

  const latest = data.latest;
  // Desk callouts, in DESKS order: back row above the desks, front row out in the margin.
  const DESK_TAGS = [[470, 250], [600, 300], [720, 330], [240, 535], [310, 610]];
  const tags = [
    tag([1.5, 1.15, 0.9], [150, 70], "EDITOR'S OFFICE", 'Issue 02 · ' + pct + '% typeset', 'note'),
    latest && tag([0.6, 5.05, 1.2], [100, 115], 'LAST TYPED · ' + latest.repo.toUpperCase(), ago(latest.at), 'note'),
    tag([8.3, 0, 2.3], [760, 140], 'CORKBOARD', data.mergedPRs + ' pull requests merged', 'note'),
    tag([10.5, 0.45, 1.65], [870, 205], 'ARCHIVE', data.repos + ' repos on file', 'note'),
    tag([0.3, 7.4, 0.15], [110, 470], 'THE MAIL SLOT', data.followers + (data.followers === 1 ? ' reader' : ' readers') + ' subscribed', 'note'),
    tag([10.15, 7.1, 1.6], [810, 548], 'THE PRESS', data.today + ' pressed today', 'note'),
    ...desks.map((d, i) => tag([d.at[0] + 0.8, d.at[1] + 0.5, 0.95], DESK_TAGS[i], d.title.toUpperCase(), deskLine(d), d.week ? 'lit' : 'note')),
  ].filter(Boolean);

  const you = P(1.3, 7.45, 0);
  const youTag = '<g class="tag tag--you"><rect class="tag__box" x="' + f1(you[0] + 14) + '" y="' + f1(you[1] - 88) + '" width="36" height="17" rx="2"/>' +
    '<path class="tag__box" d="M' + f1(you[0] + 18) + ' ' + f1(you[1] - 72) + ' l-6 7 l11 -7z"/>' +
    '<text class="tag__l" x="' + f1(you[0] + 32) + '" y="' + f1(you[1] - 76) + '" text-anchor="middle">You</text></g>';

  return '<g transform="translate(' + ROOM.join(' ') + ')">' +
    shell() + windowView() + clock() + framedCover() + corkboard(proofs) + door(Math.min(6, data.followers)) +
    solids.map((o) => o.svg).join('') + youTag + tags.join('') + '</g>';
}

// No ledger strip: GitHub prints the contribution graph right under the README.
function colophon() {
  return '<line class="rule--soft" x1="40" y1="' + (H - 42) + '" x2="960" y2="' + (H - 42) + '"/>' +
    '<text class="colophon" x="40" y="' + (H - 22) + '">PRINTED ' + esc(stampDate) + ', ' + stampTime + ' MANILA · 14.5995° N 120.9842° E</text>' +
    '<text class="colophon" x="960" y="' + (H - 22) + '" text-anchor="end">₱0.00 — FREE FOR RECRUITERS</text>';
}

async function scene(edition) {
  const T = EDITIONS[edition];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-labelledby="t d">' +
    '<title id="t">The Press Room, GitHub edition: Lord Bartolome</title>' +
    '<desc id="d">An isometric cutaway of the office behind the Issue 01 portfolio, redrawn through the day from GitHub activity. ' +
      data.desks.filter((d) => d.week).map((d) => d.title).join(', ') + ' had commits this week. ' +
      fmt(data.total) + ' contributions in the last year.</desc>' +
    defs(T) +
    '<rect class="bg" width="' + W + '" height="' + H + '"/>' +
    '<g class="grain"><rect width="' + W + '" height="' + H + '" fill="url(#grain)"/></g>' +
    cropMarks(W, H, 16, 14) +
    header(T) + room() + colophon() +
    '</svg>';
  return embedFonts(svg);
}

/* ------------------------------------------------------------------ */
/* Cover-line cards: the links, since nothing inside an image is one   */
/* ------------------------------------------------------------------ */

const CARDS = [
  { slug: 'moneda', k: 'LEAD FEATURE · LIVE', page: '04', dek: 'Local-first personal finance.' },
  { slug: 'realm-breaker', k: 'GAME DEVELOPMENT', page: '20', dek: 'A survivors-like drawn in code.' },
  { slug: 'aqualogic', k: 'FEATURE · OPERATIONS', page: '10', dek: 'Aquarium ops: web, app, ESP32.' },
  { slug: 'whisk', k: 'FEATURE · MOBILE', page: '10', dek: 'Focus timer, with Miso the cat.' },
  { slug: 'memorylane', k: 'FEATURE · DESKTOP', page: '10', dek: 'Your workday, as a timeline.' },
  { slug: 'issue', k: 'THE WHOLE ISSUE', page: '01', dek: 'Five features, the archive, a puzzle.', title: 'Issue 01', href: SITE + '/' },
];

async function card(c, edition) {
  const T = EDITIONS[edition], cw = 480, ch = 132;
  const d = data.desks.find((x) => x.slug === c.slug);
  const title = c.title || d.title;
  // the desk itself, lifted out of the room
  let art;
  if (d) {
    const o = P(0, 0, 0);
    art = '<g transform="translate(' + f1(326 - (o[0] - 70)) + ' ' + f1(28 - (o[1] - 46)) + ')">' + desk(0, 0, c.slug, d.week > 0) + '</g>';
  } else {
    const o = P(0.12, 4.3, 0);
    art = '<g transform="translate(' + f1(352 - (o[0] - 64)) + ' ' + f1(6 - (o[1] - 66)) + ') scale(1)">' + typewriter() + '</g>';
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cw + ' ' + ch + '" width="' + cw + '" height="' + ch + '" role="img" aria-label="' + esc(title + ', p.' + c.page + ': ' + c.dek) + '">' +
    defs(T) +
    '<rect class="bg" width="' + cw + '" height="' + ch + '"/>' +
    '<g class="grain"><rect width="' + cw + '" height="' + ch + '" fill="url(#grain)"/></g>' +
    cropMarks(cw, ch, 8, 9) +
    '<line class="rule" x1="24" y1="22" x2="456" y2="22"/>' +
    '<text class="kicker" x="24" y="44">' + esc(c.k) + '</text>' +
    '<text class="title" x="22" y="82" style="font-size:34px;letter-spacing:-.6px">' + esc(title) + '</text>' +
    '<text class="dek" x="24" y="104" style="font-size:12.5px">' + esc(c.dek) + '</text>' +
    '<text class="kicker" x="24" y="120" style="font-size:9.5px">READ ON P.' + c.page + ' →</text>' +
    art + '</svg>';
  return embedFonts(svg);
}

/* ------------------------------------------------------------------ */
/* Back matter: the masthead and the write-in buttons                  */
/* Edit the words here; the README block below is redrawn from them.   */
/* ------------------------------------------------------------------ */

const MASTHEAD = [
  { k: 'NOW', head: 'Software Development', tail: 'Intern.', dek: 'Alpha Premier Realty · since October 2026' },
  { k: 'STUDYING', head: 'BS Information', tail: 'Technology.', dek: 'Fourth year · graduating in 2027' },
  { k: 'BUILDING', head: 'Product-minded', tail: 'software.', dek: 'Web, desktop and local-first workflows' },
];
const STACK = ['React', 'TypeScript', 'Next.js', 'Node.js', 'Supabase', 'PostgreSQL', 'SQLite', 'Tauri', 'Rust', 'C++20', 'OpenGL'];
const SHOW_STACK = false; // hidden for now; set true to bring back the "Set in" row
const MOTTO = 'Structure first. Feel second. Polish all the way through launch.';
const WIRE = [
  { slug: 'portfolio', k: 'THE ISSUE', title: 'Portfolio', dek: 'llbartolome-portfolio.vercel.app', href: SITE + '/' },
  { slug: 'linkedin', k: 'THE WIRE', title: 'LinkedIn', dek: 'in/lord-bartolome', href: 'https://www.linkedin.com/in/lord-bartolome-49153242b/' },
  { slug: 'email', k: 'LETTERS', title: 'Email', dek: 'bartolomell0705@gmail.com', href: 'mailto:bartolomell0705@gmail.com' },
];

const MW = 1000, MH = SHOW_STACK ? 352 : 296;
const stackLine = SHOW_STACK ? '. Set in: ' + STACK.join(', ') : '';

async function masthead(edition) {
  const T = EDITIONS[edition];
  const col = (c, i) => {
    const x = 40 + i * 312;
    return '<text class="kicker" x="' + x + '" y="96">' + esc(c.k) + '</text>' +
      '<text class="title" x="' + (x - 2) + '" y="134" style="font-size:28px;letter-spacing:-.5px">' + esc(c.head) + '</text>' +
      '<text class="title" x="' + (x - 2) + '" y="166" style="font-size:28px;letter-spacing:-.5px"><tspan class="it">' + esc(c.tail) + '</tspan></text>' +
      '<text class="dek" x="' + x + '" y="194" style="font-size:13px">' + esc(c.dek) + '</text>' +
      (i ? '<line class="rule--soft" x1="' + (x - 18) + '" y1="80" x2="' + (x - 18) + '" y2="202"/>' : '');
  };
  const stack = STACK.map((t, i) => (i ? '<tspan class="it" dx="9">·</tspan><tspan dx="9">' : '<tspan>') + esc(t) + '</tspan>').join('');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + MW + ' ' + MH + '" width="' + MW + '" height="' + MH + '" role="img" aria-labelledby="mt md">' +
    '<title id="mt">The masthead: who makes Issue 01</title>' +
    '<desc id="md">' + esc(MASTHEAD.map((c) => c.k + ': ' + c.head + ' ' + c.tail + ' ' + c.dek).join('. ') + stackLine + '. ' + MOTTO) + '</desc>' +
    defs(T) +
    '<rect class="bg" width="' + MW + '" height="' + MH + '"/>' +
    '<g class="grain"><rect width="' + MW + '" height="' + MH + '" fill="url(#grain)"/></g>' +
    cropMarks(MW, MH, 16, 14) +
    '<text class="rh" x="40" y="43">THE MASTHEAD · WHO MAKES ISSUE 01</text>' +
    '<text class="rh" x="960" y="43" text-anchor="end">MANILA · UTC+8</text>' +
    '<line class="rule" x1="40" y1="56" x2="960" y2="56"/>' +
    MASTHEAD.map(col).join('') +
    '<line class="rule" x1="40" y1="224" x2="960" y2="224"/><line class="rule" x1="40" y1="228" x2="960" y2="228"/>' +
    (SHOW_STACK ? '<text class="kicker" x="40" y="262">SET IN</text>' +
      '<text class="dek" x="118" y="262" style="font-size:14px;fill:' + T.ink + '">' + stack + '</text>' +
      '<line class="rule--soft" x1="40" y1="284" x2="960" y2="284"/>' : '') +
    '<text class="title" x="500" y="' + (SHOW_STACK ? 320 : 266) + '" text-anchor="middle" style="font-size:19px;letter-spacing:0;font-style:italic;fill:' + T.inkSoft + '">' + esc(MOTTO) + '</text>' +
    '</svg>';
  return embedFonts(svg);
}

async function wireCard(c, edition) {
  const T = EDITIONS[edition], cw = 320, ch = 96;
  // an arrow drawn as a path, so it never depends on a glyph the fonts lack
  const arrow = '<path d="M276 58 L292 42 M280 42 H292 V54" fill="none" stroke="' + T.terra + '" stroke-width="1.6"/>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + cw + ' ' + ch + '" width="' + cw + '" height="' + ch + '" role="img" aria-label="' + esc(c.title + ': ' + c.dek) + '">' +
    defs(T) +
    '<rect class="bg" width="' + cw + '" height="' + ch + '"/>' +
    '<g class="grain"><rect width="' + cw + '" height="' + ch + '" fill="url(#grain)"/></g>' +
    cropMarks(cw, ch, 8, 9) +
    '<line class="rule" x1="22" y1="20" x2="298" y2="20"/>' +
    '<text class="kicker" x="22" y="40" style="font-size:9.5px">' + esc(c.k) + '</text>' +
    '<text class="title" x="20" y="68" style="font-size:26px;letter-spacing:-.4px">' + esc(c.title) + '</text>' +
    '<text class="small" x="22" y="84" style="font-size:10.5px">' + esc(c.dek) + '</text>' +
    arrow + '</svg>';
  return embedFonts(svg);
}

/* ------------------------------------------------------------------ */
/* README block + preview                                              */
/* ------------------------------------------------------------------ */

const hrefOf = (c) => c.href || SITE + '/work?read=' + c.slug;
const titleOf = (c) => c.title || data.desks.find((d) => d.slug === c.slug).title;

function picture(name, alt, width) {
  return `<picture><source media="(prefers-color-scheme: dark)" srcset="./assets/press-room/${name}-dark.svg">` +
    `<img alt="${esc(alt)}" src="./assets/press-room/${name}-light.svg" width="${width}"></picture>`;
}

// Only the text between these markers is generated; the rest of README.md is hand-written.
const MARK = ['<!-- press-room:start -->', '<!-- press-room:end -->'];
const block = `${MARK[0]}
<p align="center">
  ${picture('press-room', 'The Press Room: an isometric office redrawn from my GitHub activity', '100%')}
</p>

<p align="center">
${CARDS.map((c, i) => `  <a href="${hrefOf(c)}">${picture('card-' + c.slug, titleOf(c) + ', read on p.' + c.page, '49%')}</a>${i % 2 ? '<br>' : ''}`).join('\n')}
</p>
${MARK[1]}`;

const BACK = ['<!-- back-matter:start -->', '<!-- back-matter:end -->'];
const backBlock = `${BACK[0]}
<p align="center">
  ${picture('masthead', 'The masthead. ' + MASTHEAD.map((c) => c.k[0] + c.k.slice(1).toLowerCase() + ': ' + c.head + ' ' + c.tail + ' ' + c.dek).join('. ') + stackLine + '. ' + MOTTO, '100%')}
</p>

<p align="center">
${WIRE.map((c) => `  <a href="${c.href}">${picture('wire-' + c.slug, c.title + ': ' + c.dek, '32%')}</a>`).join('\n')}
</p>
${BACK[1]}`;

function splice(src, mark, text) {
  const a = src.indexOf(mark[0]), b = src.indexOf(mark[1]);
  if (a < 0 || b < a) throw new Error('README.md needs the ' + mark.join(' … ') + ' markers');
  return src.slice(0, a) + text + src.slice(b + mark[1].length);
}

async function updateReadme() {
  const file = npath.join(repo, 'README.md');
  const src = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, splice(splice(src, MARK, block), BACK, backBlock));
}

// A GitHub-like frame round the generated block, for checking both themes locally.
function preview() {
  const img = (name, alt, width) => `<img data-ed="${name}" alt="${esc(alt)}" src="../assets/press-room/${name}-dark.svg" style="width:${width}">`;
  const cards = CARDS.map((c) => `<a href="${hrefOf(c)}">${img('card-' + c.slug, titleOf(c), '49%')}</a>`).join(' ');
  return `<!doctype html>
<html lang="en" data-gh="dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Profile Preview</title>
<style>
  :root { --bg:#0d1117; --fg:#e6edf3; --muted:#9198a1; --border:#3d444d; }
  :root[data-gh="light"] { --bg:#ffffff; --fg:#1f2328; --muted:#59636e; --border:#d1d9e0; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",Helvetica,Arial,sans-serif; }
  header { display:flex; align-items:center; gap:12px; padding:14px 24px; border-bottom:1px solid var(--border); }
  header .sp { flex:1; } header span { color:var(--muted); }
  header button { background:transparent; color:var(--fg); border:1px solid var(--border); border-radius:6px; padding:5px 12px; font:inherit; cursor:pointer; }
  .wrap { display:flex; gap:24px; max-width:1280px; margin:0 auto; padding:32px 24px; }
  aside { width:296px; flex:none; }
  .avatar { width:296px; height:296px; border-radius:50%; background:#c4956a; border:1px solid var(--border); display:grid; place-items:center; font:600 96px/1 Georgia,serif; color:#2a1d13; }
  aside h1 { margin:16px 0 0; font-size:24px; line-height:1.25; } aside p { margin:0; color:var(--muted); font-size:20px; font-weight:300; }
  main { flex:1; min-width:0; }
  .readme { border:1px solid var(--border); border-radius:6px; padding:24px; }
  .readme > .path { font:12px ui-monospace,SFMono-Regular,Consolas,monospace; margin:-8px 0 16px; }
  .readme img { max-width:100%; vertical-align:top; }
  .center { text-align:center; } .note { color:var(--muted); font-style:italic; }
  @media (max-width: 900px) { .wrap { display:block; } aside { width:auto; margin-bottom:24px; } .avatar { width:120px; height:120px; font-size:40px; } }
</style>
</head>
<body>
<header><b>Profile preview</b><span>The generated blocks of github.com/${data.login}</span><b class="sp"></b>
  <button type="button" id="gh">GitHub theme: <span id="ghl">dark</span></button></header>
<div class="wrap">
  <aside><div class="avatar">LB</div><h1>Lord Bartolome</h1><p>${data.login}</p></aside>
  <main><div class="readme">
    <div class="path">${data.login} / README.md</div>
    <p class="center">${img('press-room', 'The Press Room', '100%')}</p>
    <p class="center">${cards}</p>
    <p class="center">${img('masthead', 'The masthead', '100%')}</p>
    <p class="center">${WIRE.map((c) => `<a href="${c.href}">${img('wire-' + c.slug, c.title, '32%')}</a>`).join(' ')}</p>
  </div></main>
</div>
<script>
  var root = document.documentElement, b = document.getElementById('gh');
  function set(t) {
    root.dataset.gh = t; document.getElementById('ghl').textContent = t;
    document.querySelectorAll('img[data-ed]').forEach(function (i) { i.src = '../assets/press-room/' + i.dataset.ed + '-' + t + '.svg'; });
  }
  set(new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark');
  b.addEventListener('click', function () { set(root.dataset.gh === 'dark' ? 'light' : 'dark'); });
</script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */

await fs.mkdir(outDir, { recursive: true });
const sizes = [];
for (const ed of Object.keys(EDITIONS)) {
  const s = await scene(ed);
  await fs.writeFile(npath.join(outDir, `press-room-${ed}.svg`), s);
  sizes.push(`press-room-${ed} ${(s.length / 1024).toFixed(0)}KB`);
  for (const c of CARDS) {
    const cs = await card(c, ed);
    await fs.writeFile(npath.join(outDir, `card-${c.slug}-${ed}.svg`), cs);
    if (c.slug === 'moneda') sizes.push(`card-${c.slug}-${ed} ${(cs.length / 1024).toFixed(0)}KB`);
  }
  const ms = await masthead(ed);
  await fs.writeFile(npath.join(outDir, `masthead-${ed}.svg`), ms);
  sizes.push(`masthead-${ed} ${(ms.length / 1024).toFixed(0)}KB`);
  for (const c of WIRE) await fs.writeFile(npath.join(outDir, `wire-${c.slug}-${ed}.svg`), await wireCard(c, ed));
}
await updateReadme();
await fs.writeFile(npath.join(here, 'preview.html'), preview());
console.log(`Rendered at ${stampTime} Manila (${phase} sky): ${sizes.join(', ')}`);
