// Small SVG charts for Análisis (tarea 20e), drawn by hand: no libraries
// (AGENTS.md). Colours come from the semantic tokens through CSS variables,
// so light and dark mode follow on their own. Touches the DOM only when
// called.

const NS = 'http://www.w3.org/2000/svg';

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
  const node = svgElement('text', { x, y, 'font-size': 9, fill: 'var(--color-ink-muted)', ...attributes });
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

// Lines over time on one axis, with the 0 marked, each line named at its
// end. series: [{ values, color (CSS), width, name }]; labels: one per point.
// selected: the index highlighted (a vertical rule and dots); onPick(index)
// when a column is tapped.
export function lineChart({ labels, series, selected = null, onPick = null, label }) {
  const W = 361;
  const H = 200;
  const L = 34;
  const R = 58;
  const T = 10;
  const B = 20;
  const svg = svgRoot(W, H, label);
  const values = series.flatMap((s) => s.values);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const steps = ticks(min, max);
  const low = Math.min(min, steps[0]);
  const high = Math.max(max, steps.at(-1));
  const count = labels.length;
  const x = (i) => (count === 1 ? (L + W - R) / 2 : L + (i * (W - L - R)) / (count - 1));
  const y = (v) => T + ((high - v) * (H - T - B)) / (high - low || 1);

  for (const step of steps) {
    svg.appendChild(svgElement('line', {
      x1: L, x2: W - R, y1: y(step), y2: y(step),
      stroke: step === 0 ? 'var(--color-ink-muted)' : 'var(--color-line)',
      'stroke-dasharray': step === 0 ? '' : '2 3',
    }));
    text(svg, L - 4, y(step) + 3, short(step), { 'text-anchor': 'end' });
  }
  const every = Math.ceil(count / 12);
  labels.forEach((name, i) => {
    if (i % every === 0 || i === count - 1) text(svg, x(i), H - 6, name, { 'text-anchor': 'middle' });
  });
  for (const line of series) {
    svg.appendChild(svgElement('polyline', {
      points: line.values.map((v, i) => `${x(i)},${y(v)}`).join(' '),
      fill: 'none', stroke: line.color, 'stroke-width': line.width ?? 2,
      'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
  }
  // Names at the line ends, pushed apart when they would overlap.
  const ends = series.map((line) => ({ name: line.name, y: y(line.values.at(-1)) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i += 1) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11);
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
    const column = (W - L - R) / Math.max(1, count - 1);
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
  const W = 160;
  const H = 40;
  const svg = svgRoot(W, H, label);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => 4 + (i * (W - 8)) / Math.max(1, values.length - 1);
  const y = (v) => H - 4 - ((v - min) * (H - 10)) / (max - min || 1);
  svg.appendChild(svgElement('polyline', {
    points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    fill: 'none', stroke: 'var(--color-bar)', 'stroke-width': 2, 'stroke-linejoin': 'round',
  }));
  svg.appendChild(svgElement('circle', { cx: x(values.length - 1), cy: y(values.at(-1)), r: 3, fill: 'var(--color-ink)' }));
  return svg;
}

// Bars from a baseline, the highest one in ink and the two highest labelled.
export function barChart(values, labels, label) {
  const W = 361;
  const H = 110;
  const svg = svgRoot(W, H, label);
  const max = Math.max(...values, 1);
  const slot = (W - 20) / values.length;
  const top = [...values].map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, i]) => i);
  values.forEach((value, i) => {
    const height = (value / max) * 72;
    const bx = 10 + i * slot + slot * 0.15;
    svg.appendChild(svgElement('rect', {
      x: bx, y: 84 - height, width: slot * 0.7, height: Math.max(height, 1), rx: 3,
      fill: i === top[0] ? 'var(--color-ink)' : 'var(--color-bar)',
    }));
    text(svg, bx + slot * 0.35, 100, labels[i], { 'text-anchor': 'middle' });
    if (top.includes(i) && value > 0) {
      text(svg, bx + slot * 0.35, 84 - height - 4, `${Math.round(value)} €`, { 'text-anchor': 'middle', fill: 'var(--color-ink)' });
    }
  });
  return svg;
}

// The month day by day: spending so far (solid) against the usual month
// (dashed), with the day of a big expense marked. spent: one value per day
// up to today; usual: one per day of the month.
export function paceChart({ spent, usual, peakDay = null, peakLabel = '', usualLabel, label }) {
  const W = 361;
  const H = 140;
  const L = 34;
  const R = 70;
  const T = 14;
  const B = 18;
  const svg = svgRoot(W, H, label);
  const days = usual.length;
  const max = Math.max(...spent, ...usual, 1);
  const steps = ticks(0, max);
  const high = Math.max(max, steps.at(-1));
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, days - 1);
  const y = (v) => T + ((high - v) * (H - T - B)) / high;
  for (const step of steps) {
    svg.appendChild(svgElement('line', {
      x1: L, x2: W - R, y1: y(step), y2: y(step),
      stroke: step === 0 ? 'var(--color-ink-muted)' : 'var(--color-line)', 'stroke-dasharray': step === 0 ? '' : '2 3',
    }));
    text(svg, L - 4, y(step) + 3, short(step), { 'text-anchor': 'end' });
  }
  for (const day of [1, 10, 20, days]) text(svg, x(day - 1), H - 4, String(day), { 'text-anchor': 'middle' });
  svg.appendChild(svgElement('polyline', {
    points: usual.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    fill: 'none', stroke: 'var(--color-bar)', 'stroke-width': 2, 'stroke-dasharray': '4 3',
  }));
  svg.appendChild(svgElement('polyline', {
    points: spent.map((v, i) => `${x(i)},${y(v)}`).join(' '),
    fill: 'none', stroke: 'var(--color-expense)', 'stroke-width': 2, 'stroke-linejoin': 'round',
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
