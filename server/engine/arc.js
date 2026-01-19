// arc.js — compositional arc logic + sparkline preview

// ==== Internal seeded RNG (for deterministic visual previews) ====
let randomArcCache = null;
let randomSeed = Math.random() * 1e6;

function seededRand(seed) {
  // Simple deterministic random generator based on sine
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function resetRandomArcCache() {
  randomArcCache = null;
  randomSeed = Math.random() * 1e6;
}

// ==== Shared math helpers ====
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

// ==== Dynamics mapping ====
export const DYNAMICS = [
  { mark: 'ppp', val: 0.0 },
  { mark: 'pp', val: 0.14 },
  { mark: 'p', val: 0.28 },
  { mark: 'mp', val: 0.42 },
  { mark: 'mf', val: 0.57 },
  { mark: 'f', val: 0.71 },
  { mark: 'ff', val: 0.85 },
  { mark: 'fff', val: 1.0 },
];

// ==== Activity Arc (real-time macro shape) ====
export function activityArc(now, start, end, sel, durationMin) {
  const x = clamp01((now - start) / (end - start));

  switch (sel) {
    case 'traditional': {
      const seg = x;
      if (seg < 0.2) return 0.4 + 0.1 * easeInOutSine(seg / 0.2);
      if (seg < 0.4) return 0.5 + 0.3 * easeInOutSine((seg - 0.2) / 0.2);
      if (seg < 0.6) return 0.8 - 0.6 * easeInOutSine((seg - 0.4) / 0.2);
      if (seg < 0.8) return 0.2 + 0.8 * easeInOutSine((seg - 0.6) / 0.2);
      return 1.0 - 0.5 * easeInOutSine((seg - 0.8) / 0.2);
    }
    case 'arch':
      return Math.sin(Math.PI * x);
    case 'swell':
      return Math.pow(x, 0.9);
    case 'wave': {
      let cycles;
      if (durationMin <= 5) cycles = 2;
      else if (durationMin <= 10) cycles = 3;
      else if (durationMin <= 20) cycles = 4;
      else if (durationMin <= 40) cycles = 6;
      else cycles = 8;
      const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles * x);
      return 0.2 + 0.8 * w;
    }
    case 'plateau':
      if (x < 0.3) return easeInOutSine(x / 0.3);
      if (x < 0.7) return 1;
      return easeInOutSine((1 - x) / 0.3);
    case 'random':
      // Random per prompt, actual value supplied externally
      return seededRand(randomSeed + x * 999) * 0.8 + 0.1;
    default:
      return 0.5;
  }
}

// ==== Normalized static version for sparkline ====
function activityArcNormalized(x, sel, durationMin, intervalRange) {
  switch (sel) {
    case 'traditional': {
      if (x < 0.1) return 0.2 + 0.2 * easeInOutSine(x / 0.1);
      if (x < 0.3) return 0.4 + 0.3 * easeInOutSine((x - 0.1) / 0.2);
      if (x < 0.5) return 0.7 - 0.4 * easeInOutSine((x - 0.3) / 0.2);
      if (x < 0.7) return 0.3 + 0.7 * easeInOutSine((x - 0.5) / 0.2);
      if (x < 0.9) return 1.0 - 0.5 * easeInOutSine((x - 0.7) / 0.2);
      return 0.5 - 0.2 * easeInOutSine((x - 0.9) / 0.1);
    }
    case 'arch':
      return Math.sin(Math.PI * x);
    case 'swell':
      return Math.pow(x, 0.9);
    case 'wave': {
      let cycles;
      if (durationMin <= 5) cycles = 2;
      else if (durationMin <= 10) cycles = 3;
      else if (durationMin <= 20) cycles = 4;
      else if (durationMin <= 40) cycles = 6;
      else cycles = 8;
      const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles * x);
      return 0.2 + 0.8 * w;
    }
    case 'plateau':
      return x < 0.3
        ? easeInOutSine(x / 0.3)
        : x < 0.7
        ? 1
        : easeInOutSine((1 - x) / 0.3);
    case 'random': {
      // Simulate per-prompt randomness for sparkline
      const [intMin, intMax] = intervalRange;
      const avgInterval = (intMin + intMax) / 2;
      const numSteps = Math.max(4, Math.round((durationMin * 60) / avgInterval));
      const segment = 1 / numSteps;

      if (!randomArcCache) {
        randomArcCache = Array.from({ length: numSteps }, () =>
          seededRand(randomSeed + Math.random() * 1e4)
        );
      }

      const i = Math.min(numSteps - 1, Math.floor(x / segment));
      return randomArcCache[i];
    }
    default:
      return 0.5;
  }
}

// ==== Sparkline drawing ====
// Note: This function is client-side only and not used by the server
// The Svelte client has its own arc preview implementation in arc-preview.js
export function drawArcPreview() {
  // Client-side only - DOM elements don't exist on server
  // This function is not called by the server-side engine
  const arcCanvas = typeof document !== 'undefined' ? document.getElementById('arcPreview') : null;
  const ctx = arcCanvas ? arcCanvas.getContext('2d') : null;
  const arcSelect = typeof document !== 'undefined' ? document.getElementById('arcSelect') : null;
  const dynRangeSliderEl = typeof document !== 'undefined' ? document.getElementById('dynRangeSlider') : null;
  const contrastSliderEl = typeof document !== 'undefined' ? document.getElementById('contrastSlider') : null;
  const durationSlider = typeof document !== 'undefined' ? document.getElementById('durationSlider') : null;
  const rangeSlider = typeof document !== 'undefined' ? document.getElementById('slider-range') : null;

  if (!arcCanvas || (typeof window !== 'undefined' && !window.noUiSlider)) return;
  if (!dynRangeSliderEl || !dynRangeSliderEl.noUiSlider || !contrastSliderEl || !contrastSliderEl.noUiSlider) return;

  const w = arcCanvas.width;
  const h = arcCanvas.height;
  const sel = arcSelect.value;
  const durationMin = parseInt(durationSlider.noUiSlider.get());
  const intervalRange = rangeSlider.noUiSlider.get().map(Number);
  const [drMinIdx, drMaxIdx] = dynRangeSliderEl.noUiSlider.get().map(Number);
  const C = Number(contrastSliderEl.noUiSlider.get());

  const dynMin = DYNAMICS[drMinIdx].val;
  const dynMax = DYNAMICS[drMaxIdx].val;
  const stretch = sel !== 'random' ? 0.5 + 0.7 * C : 1.0;

  // Deterministic modulation seed
  const wanderPhase = seededRand(randomSeed) * Math.PI * 2;

  ctx.clearRect(0, 0, w, h);

  // baseline
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 1;
  const midY = h - 0.5 * (dynMin + dynMax) * h;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  // draw curve
  ctx.beginPath();
  for (let i = 0; i <= 300; i++) {
    const x = i / 300;
    let yNorm = activityArcNormalized(x, sel, durationMin, intervalRange);

    if (sel !== 'random') {
      yNorm = 0.5 + (yNorm - 0.5) * stretch;
    }

    const microFreqBase = 5 + 30 * C;
    const microAmpBase = 0.03 * C + 0.12 * C * C;
    const wanderFreq = 0.5 + 2.0 * C;
    const chaosFreq = 2 + 10 * C;
    const chaosStrength = 0.2 * C;

    const wander =
      0.5 + 0.5 * Math.sin(x * Math.PI * 2 * wanderFreq + wanderPhase);
    const irregular =
      chaosStrength *
      Math.sin(x * Math.PI * 2 * chaosFreq + wanderPhase * 0.7);
    const localAmp = microAmpBase * (0.6 + 0.8 * wander + irregular);
    const micro = Math.sin(x * Math.PI * microFreqBase) * localAmp;

    yNorm += micro;

    const y = dynMin + (dynMax - dynMin) * yNorm;
    const px = x * w;
    let py = h - y * h;
    if (py < -h * 0.5) py = -h * 0.5;
    if (py > h * 1.5) py = h * 1.5;

    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.stroke();
}
