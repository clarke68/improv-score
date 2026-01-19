// Arc preview sparkline visualization
// This generates a simple preview of the compositional arc

let randomArcCache = null;
let randomSeed = Math.random() * 1e6;

// Seeded random for deterministic previews
function seededRand(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function resetRandomArcCache() {
  randomArcCache = null;
  randomSeed = Math.random() * 1e6;
}

// Helper functions matching server logic
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const easeInOutSine = (x) => -(Math.cos(Math.PI * x) - 1) / 2;

// Activity arc normalized (matching server logic from arc.js)
function activityArcNormalized(x, sel, durationMin, intervalRange) {
  switch (sel) {
    case 'traditional': {
      // Traditional arc: complex segmented curve matching server
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
      // Wave: cycles based on duration (matching server logic)
      let cycles;
      if (durationMin <= 5) cycles = 2;
      else if (durationMin <= 10) cycles = 3;
      else if (durationMin <= 20) cycles = 4;
      else if (durationMin <= 40) cycles = 6;
      else cycles = 8;
      const w = 0.5 + 0.5 * Math.sin(2 * Math.PI * cycles * x);
      return 0.2 + 0.8 * w;
    }
    case 'plateau': {
      // Plateau: ramp up, stay high, ramp down (matching server logic)
      return x < 0.3
        ? easeInOutSine(x / 0.3)
        : x < 0.7
        ? 1
        : easeInOutSine((1 - x) / 0.3);
    }
    case 'random': {
      // Random: use cached random segments based on interval and duration
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

export function generateArcPreview(settings) {
  const { durationMin, interval, dynRangeIdx, contrast, arc, numPlayers } = settings;
  
  // Default to 8 if numPlayers not set
  const players = numPlayers || 8;
  const duration = durationMin * 60; // Convert to seconds
  const [minInterval, maxInterval] = interval;
  const [minDyn, maxDyn] = dynRangeIdx;
  
  const points = [];
  const steps = 50; // Number of points in preview
  const rawValues = []; // Store raw processed values to normalize later
  
  // Contrast stretch factor (matching server logic)
  const stretch = arc !== 'random' ? 0.5 + 0.7 * contrast : 1.0;
  
  // Microdynamics parameters (enhanced for better visibility in preview)
  // Finer resolution with higher frequency for true "micro" dynamics
  // Increased visibility at lower values, better scaling in upper range
  const microFreqBase = 8 + 50 * contrast; // Higher base frequency for finer perturbations
  // More aggressive curve: stronger early visibility, continues scaling to upper range
  // Use a combination that emphasizes lower and upper ranges
  const microAmpBase = 0.12 * contrast + 0.20 * Math.pow(contrast, 2) + 0.10 * Math.pow(contrast, 3);
  const wanderFreq = 0.5 + 2.0 * contrast;
  const chaosFreq = 3 + 15 * contrast; // Higher frequency for finer chaos
  const chaosStrength = 0.30 * contrast + 0.15 * Math.pow(contrast, 2); // Stronger in upper range
  const wanderPhase = seededRand(randomSeed) * Math.PI * 2;
  
  // First pass: calculate all raw processed values
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    
    // Calculate base value from arc type
    let value = activityArcNormalized(t, arc, durationMin, interval);
    
    // Apply contrast stretch (except for random)
    if (arc !== 'random') {
      value = 0.5 + (value - 0.5) * stretch;
    }
    
    // Apply microdynamics (micro variations based on contrast)
    const wander = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * wanderFreq + wanderPhase);
    const irregular = chaosStrength * Math.sin(t * Math.PI * 2 * chaosFreq + wanderPhase * 0.7);
    const localAmp = microAmpBase * (0.6 + 0.8 * wander + irregular);
    const micro = Math.sin(t * Math.PI * microFreqBase) * localAmp;
    
    value = clamp01(value + micro);
    rawValues.push(value);
  }
  
  // Find min and max to normalize to full 0-1 range
  const minRaw = Math.min(...rawValues);
  const maxRaw = Math.max(...rawValues);
  const rawRange = maxRaw - minRaw;
  
  // Second pass: normalize to 0-1 and map to dynamic range
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let normalizedValue;
    
    if (rawRange > 0) {
      // Normalize to full 0-1 range to ensure selected dynamic range is fully utilized
      normalizedValue = (rawValues[i] - minRaw) / rawRange;
    } else {
      // If all values are the same, use 0.5
      normalizedValue = 0.5;
    }
    
    // Map normalized value (0-1) to selected dynamic range
    const dynValue = minDyn + (normalizedValue * (maxDyn - minDyn));
    
    // Map dynValue to Y coordinate - always use full 0-7 scale for Y-axis
    // This shows where the selected range falls in the absolute dynamic scale
    // When range is 0-7: graph spans full height
    // When range is 2-6: graph uses middle portion of height
    // Use 1-99 range instead of 0-100 to prevent clipping at edges
    const yCoord = 99 - ((dynValue / 7) * 98); // Invert for SVG (y=1 is top, y=99 is bottom)
    
    points.push({
      x: (i / steps) * 100, // Percentage
      y: yCoord,
      value: dynValue
    });
  }
  
  return points;
}

// Generate smooth cubic Bézier curve path
export function generateArcPath(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  // For smooth curves, use cubic Bézier with control points
  // Calculate control points for smooth interpolation
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    
    // Calculate control points using Catmull-Rom-like approach
    // Tension parameter (0 = straight lines, 1 = very curved)
    const tension = 0.3;
    
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  
  return path;
}

// Alternative: Generate path using quadratic Bézier (simpler, fewer control points)
export function generateArcPathQuadratic(points) {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  
  let path = `M ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    
    // Control point is midpoint between current and next
    const cpX = (curr.x + next.x) / 2;
    const cpY = (curr.y + next.y) / 2;
    
    path += ` Q ${curr.x} ${curr.y}, ${cpX} ${cpY}`;
  }
  
  return path;
}

// Canvas-based rendering function (alternative approach)
export function drawArcOnCanvas(canvas, points, options = {}) {
  const ctx = canvas.getContext('2d');
  const { 
    strokeColor = '#e5592e', 
    strokeWidth = 2, 
    lineCap = 'round',
    lineJoin = 'round',
    tension = 0.3 
  } = options;
  
  if (!ctx || points.length < 2) return;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = lineCap;
  ctx.lineJoin = lineJoin;
  
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  
  // Use quadratic curves for smooth interpolation
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];
    
    // Control point for smooth curve
    const cpX = prev.x + (curr.x - prev.x) * (1 - tension);
    const cpY = prev.y + (curr.y - prev.y) * (1 - tension);
    
    ctx.quadraticCurveTo(cpX, cpY, curr.x, curr.y);
  }
  
  ctx.stroke();
}

