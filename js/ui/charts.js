// Small SVG charts for Análisis (tarea 20e), drawn by hand: no libraries
// (AGENTS.md). Colours come from the semantic tokens through CSS variables,
// so light and dark mode follow on their own. Touches the DOM only when
// called.

const NS = 'http://www.w3.org/2000/svg';

// Every chart is as wide as the screen's content (393 px − the gutters)
// and scales with it (viewBox).
const CHART_WIDTH = 361;
// Axis and label text.
const FONT_SIZE = 9;
// Lines are 2 wide unless a series says otherwise.
const LINE_WIDTH = 2;
// At most this many month labels under a line chart.
const MAX_LABELS = 12;
// The least gap between two line names at the right end.
const NAME_GAP = 11;

// Each chart's height and its margins for the axis (left), the names at the
// line ends (right) and the labels (top, bottom).
const FRAMES = Object.freeze({
  line: { height: 200, left: 34, right: 58, top: 10, bottom: 20 },
  pace: { height: 140, left: 34, right: 70, top: 14, bottom: 18 },
});
// Bars: their height, where they stand and where their labels go.
const BARS = Object.freeze({ height: 110, base: 84, tallest: 72, labels: 100, side: 10, fill: 0.7 });
const SPARK = Object.freeze({ width: 160, height: 40, pad: 4 });

// Colours given as var(--…) go in the style: SVG attributes do not resolve
// CSS variables.
function svgElement(tag, attributes = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (String(value).startsWith('var(')) node.style.setProperty(name, value);
    else node.setAttribute(name, value);
  }
  return node;
}

function svgRoot(width, height, label) {
  const svg = svgElement('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', role: 'img', 'aria-label': label });
  svg.classList.add('chart');
  return svg;
}

const text = (svg, x, y, content, attributes = {}) => {
  const node = svgElement('text', { x, y, 'font-size': FONT_SIZE, fill: 'var(--color-ink-muted)', ...attributes });
  node.textContent = content;
  svg.appendChild(node);
  return node;
};

// Round steps for an axis from min to max: about four of them.
function ticks(min, max) {
  const span = max - min || 1;
  const rough = span / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= rough);
  const out = [];
  for (let value = Math.floor(min / step) * step; value <= max + step / 2; value += step) out.push(value);
  return out;
}

const short = (value) => (Math.abs(value) >= 1000 ? `${Math.round(value / 100) / 10}k`.replace('.', ',') : `${Math.round(value)}`);

// "x1,y1 x2,y2 …" of some values for a polyline.
const points = (values, x, y) => values.map((v, i) => `${x(i)},${y(v)}`).join(' ');

// The horizontal rules of an axis, the 0 one solid, each with its value.
function drawGrid(svg, steps, frame, y) {
  for (const step of steps) {
    svg.appendChild(svgElement('line', {
      x1: frame.left, x2: CHART_WIDTH - frame.right, y1: y(step), y2: y(step),
      stroke: step === 0 ? 'var(--color-ink-muted)' : 'var(--color-line)',
      'stroke-dasharray': step === 0 ? '' : '2 3',
    }));
    text(svg, frame.left - 4, y(step) + 3, short(step), { 'text-anchor': 'end' });
  }
}

// Lines over time on one axis, with the 0 marked, each line named at its
// end. series: [{ values, color (CSS), width, name }]; labels: one per point.
// selected: the index highlighted (a vertical rule and dots); onPick(index)
// when a column is tapped.
export function lineChart({ labels, series, selected = null, onPick = null, label }) {
  const frame = FRAMES.line;
  const { left: L, right: R, top: T, bottom: B, height: H } = frame;
  const svg = svgRoot(CHART_WIDTH, H, label);
  const values = series.flatMap((s) => s.values);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const steps = ticks(min, max);
  const low = Math.min(min, steps[0]);
  const high = Math.max(max, steps.at(-1));
  const count = labels.length;
  const x = (i) => (count === 1 ? (L + CHART_WIDTH - R) / 2 : L + (i * (CHART_WIDTH - L - R)) / (count - 1));
  const y = (v) => T + ((high - v) * (H - T - B)) / (high - low || 1);

  drawGrid(svg, steps, frame, y);
  const every = Math.ceil(count / MAX_LABELS);
  labels.forEach((name, i) => {
    if (i % every === 0 || i === count - 1) text(svg, x(i), H - 6, name, { 'text-anchor': 'middle' });
  });
  for (const line of series) {
    svg.appendChild(svgElement('polyline', {
      points: points(line.values, x, y),
      fill: 'none', stroke: line.color, 'stroke-width': line.width ?? LINE_WIDTH,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }
  // Names at the line ends, pushed apart when they would overlap.
  const ends = series.map((line) => ({ name: line.name, y: y(line.values.at(-1)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + NAME_GAP);
  for (const end of ends) text(svg, x(count - 1) + 6, end.y + 3, end.name, { fill: 'var(--color-ink)' });

  if (selected !== null) {
    svg.appendChild(svgElement('line', { x1: x(selected), x2: x(selected), y1: T, y2: H - B, stroke: 'var(--color-ink)' }));
    for (const line of series) {
      svg.appendChild(svgElement('circle', {
        cx: x(selected), cy: y(line.values[selected]), r: 4,
        fill: line.color, stroke: 'var(--color-bg)', 'stroke-width': 2,
      }));
    }
  }
  if (onPick) {
    const column = (CHART_WIDTH - L - R) / Math.max(1, count - 1);
    labels.forEach((name, i) => {
      const hit = svgElement('rect', {
        x: x(i) - column / 2, y: T, width: column, height: H - T - B, fill: 'transparent',
      });
      hit.classList.add('chart-hit');
      hit.addEventListener('click', () => onPick(i));
      svg.appendChild(hit);
    });
  }
  return svg;
}

// A tiny line with its last point marked.
export function sparkline(values, label) {
  const { width: W, height: H, pad } = SPARK;
  const svg = svgRoot(W, H, label);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => pad + (i * (W - 2 * pad)) / Math.max(1, values.length - 1);
  const y = (v) => H - pad - ((v - min) * (H - 10)) / (max - min || 1);
  svg.appendChild(svgElement('polyline', {
    points: points(values, x, y),
    fill: 'none', stroke: 'var(--color-bar)', 'stroke-width': LINE_WIDTH, 'stroke-linejoin': 'round',
  }));
  svg.appendChild(svgElement('circle', { cx: x(values.length - 1), cy: y(values.at(-1)), r: 3, fill: 'var(--color-ink)' }));
  return svg;
}

// Bars from a baseline, the highest one in ink and the two highest labelled.
export function barChart(values, labels, label) {
  const { height, base, tallest, labels: labelsAt, side, fill } = BARS;
  const svg = svgRoot(CHART_WIDTH, height, label);
  const max = Math.max(...values, 1);
  const slot = (CHART_WIDTH - 2 * side) / values.length;
  const gap = (1 - fill) / 2;
  const top = [...values].map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, i]) => i);
  values.forEach((value, i) => {
    const barHeight = (value / max) * tallest;
    const bx = side + i * slot + slot * gap;
    const middle = bx + (slot * fill) / 2;
    svg.appendChild(svgElement('rect', {
      x: bx, y: base - barHeight, width: slot * fill, height: Math.max(barHeight, 1), rx: 3,
      fill: i === top[0] ? 'var(--color-ink)' : 'var(--color-bar)',
    }));
    text(svg, middle, labelsAt, labels[i], { 'text-anchor': 'middle' });
    if (top.includes(i) && value > 0) {
      text(svg, middle, base - barHeight - 4, `${Math.round(value)} €`, { 'text-anchor': 'middle', fill: 'var(--color-ink)' });
    }
  });
  return svg;
}

// The month day by day: spending so far (solid) against the usual month
// (dashed), with the day of a big expense marked. spent: one value per day
// up to today; usual: one per day of the month.
export function paceChart({ spent, usual, peakDay = null, peakLabel = '', usualLabel, label }) {
  const frame = FRAMES.pace;
  const { left: L, right: R, top: T, bottom: B, height: H } = frame;
  const svg = svgRoot(CHART_WIDTH, H, label);
  const days = usual.length;
  const max = Math.max(...spent, ...usual, 1);
  const steps = ticks(0, max);
  const high = Math.max(max, steps.at(-1));
  const x = (i) => L + (i * (CHART_WIDTH - L - R)) / Math.max(1, days - 1);
  const y = (v) => T + ((high - v) * (H - T - B)) / high;
  drawGrid(svg, steps, frame, y);
  for (const day of [1, 10, 20, days]) text(svg, x(day - 1), H - 4, String(day), { 'text-anchor': 'middle' });
  svg.appendChild(svgElement('polyline', {
    points: points(usual, x, y),
    fill: 'none', stroke: 'var(--color-bar)', 'stroke-width': LINE_WIDTH, 'stroke-dasharray': '4 3',
  }));
  svg.appendChild(svgElement('polyline', {
    points: points(spent, x, y),
    fill: 'none', stroke: 'var(--color-expense)', 'stroke-width': LINE_WIDTH, 'stroke-linejoin': 'round',
  }));
  if (spent.length) text(svg, x(spent.length - 1) + 6, y(spent.at(-1)) + 3, short(spent.at(-1)), { fill: 'var(--color-ink)' });
  text(svg, x(days - 1) + 6, y(usual.at(-1)) + 12, usualLabel);
  if (peakDay) {
    // A dot on the day, the label above it, kept inside the chart.
    const px = x(peakDay - 1);
    const py = y(spent[peakDay - 1]);
    svg.appendChild(svgElement('circle', { cx: px, cy: py, r: 3, fill: 'var(--color-ink)' }));
    text(svg, Math.max(L, px - 4), Math.max(9, py - 8), peakLabel, { fill: 'var(--color-ink)' });
  }
  return svg;
}
