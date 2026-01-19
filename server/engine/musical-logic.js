// musical-logic.js — pure musical computation
import { DYNAMICS } from './arc.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smoothstep = (e0, e1, x) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const gaussianSample = (mu, sigma) => {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};
const fract = (x) => x - Math.floor(x);

// Simplified ensemble size determination
// Returns an ensemble size based on contrast (MD) and activity
export function getEnsembleSize(numPlayers, activity, contrast) {
  // Contrast controls the probability distribution of ensemble sizes
  // MD=0 → mostly tutti, MD=1.0 → mostly sparse (but still groups, not solos)
  
  // Direct tutti probability based on contrast
  const tuttiProbability = 1.0 - contrast; // MD=0 → 100%, MD=1 → 0%
  
  // Special handling for small groups (≤5) at high MD: allow more tutti and solos
  if (numPlayers <= 5 && contrast >= 0.7) {
    // Override tutti probability for small groups at high MD
    // At MD=0.7: ~10% tutti, MD=1.0: ~15% tutti (instead of 0%)
    const smallGroupTuttiProb = 0.1 + (1.0 - contrast) * 0.05; // 0.15 at MD=0.7, 0.1 at MD=1.0
    if (Math.random() < smallGroupTuttiProb) {
      return numPlayers; // Tutti
    }
    
    // Solo probability for small groups at high MD
    // MD=0.7 → ~15% solo, MD=0.9 → ~25% solo, MD=1.0 → ~30% solo
    const soloProbability = Math.pow((contrast - 0.7) / 0.3, 1.2) * 0.3; // 0 to 0.3
    if (Math.random() < soloProbability) {
      return 1; // Solo
    }
    
    // Remaining sizes: use simple weighted distribution
    // For trios: only option left is 2 (duo)
    // For quartets: 2 or 3, weighted toward smaller
    // For quintets: 2, 3, or 4, weighted toward smaller
    if (numPlayers === 3) {
      return 2; // Only option left
    } else if (numPlayers === 4) {
      // Weighted: 60% chance of 2, 40% chance of 3
      return Math.random() < 0.6 ? 2 : 3;
    } else if (numPlayers === 5) {
      // Weighted: 50% chance of 2, 30% chance of 3, 20% chance of 4
      const r = Math.random();
      if (r < 0.5) return 2;
      if (r < 0.8) return 3;
      return 4;
    }
  }
  
  // Roll for tutti (standard behavior for all other cases)
  if (Math.random() < tuttiProbability) {
    return numPlayers; // Tutti
  }
  
  // Special case: when there are only 2 players, allow solos at high MD values (but still rare)
  if (numPlayers === 2 && contrast >= 0.7) {
    // Solo probability increases with contrast, but stays somewhat rare
    // MD=0.7 → ~5% solo, MD=0.8 → ~10% solo, MD=0.9 → ~20% solo, MD=1.0 → ~30% solo
    const soloProbability = Math.pow((contrast - 0.7) / 0.3, 1.5) * 0.3; // 0 to 0.3
    if (Math.random() < soloProbability) {
      return 1; // Solo
    }
    // Otherwise, return 2 (duo)
    return 2;
  }
  
  // When not tutti, determine size based on contrast and activity
  // At high MD (>0.7): use bell curve distribution (more dramatic variety)
  // At low MD (<0.4): use activity-based calculation (predictable, arc-driven)
  // Between 0.4-0.7: blend both approaches
  
  if (contrast >= 0.7) {
    // High MD: Bell curve distribution for dramatic microdynamics
    // Range: 2 to numPlayers-1, peak shifts based on contrast
    // At MD=1.0: peak around 4-6, heavily skewed toward smaller ensembles
    // At MD=0.7: peak around 6-8, less skewed
    
    const maxEnsembleSize = numPlayers - 1; // Never tutti (that's handled above)
    const sizeRange = maxEnsembleSize - 1; // 1 to maxEnsembleSize-1, then add 1 to get 2 to maxEnsembleSize
    
    // Peak position shifts from smaller to larger as contrast decreases
    // MD=1.0: peak around 4-5 (normalized: ~0.25)
    // MD=0.7: peak around 6-7 (normalized: ~0.4)
    const peakPosition = 0.25 + (1.0 - contrast) / 0.3 * 0.15; // 0.25 at MD=1.0, 0.4 at MD=0.7
    const peak = 2 + Math.round(peakPosition * sizeRange); // Actual peak size
    
    // Standard deviation: wider curve at higher contrast (more variety)
    const stdDev = (0.15 + (1.0 - contrast) * 0.05) * sizeRange; // Wider at MD=1.0
    
    // Generate bell curve distribution using inverse transform sampling
    const weights = [];
    let maxWeight = 0;
    
    for (let size = 2; size <= maxEnsembleSize; size++) {
      // Gaussian bell curve: exp(-0.5 * ((x - peak) / stdDev)^2)
      const x = (size - 2) / sizeRange; // Normalize to 0-1
      const xPeak = (peak - 2) / sizeRange;
      const distance = (x - xPeak) / stdDev;
      const weight = Math.exp(-0.5 * distance * distance);
      
      // Skew toward smaller sizes: multiply by exponential decay
      // This makes smaller ensembles more likely than larger ones
      const skewFactor = Math.exp(-contrast * 0.5 * x); // Stronger skew at higher contrast
      weights.push(weight * skewFactor);
      maxWeight = Math.max(maxWeight, weights[weights.length - 1]);
    }
    
    // Normalize weights to probabilities
    const probabilities = weights.map(w => w / maxWeight);
    const cumulative = [];
    let sum = 0;
    for (let i = 0; i < probabilities.length; i++) {
      sum += probabilities[i];
      cumulative.push(sum);
    }
    
    // Sample from the distribution
    const r = Math.random() * sum;
    for (let i = 0; i < cumulative.length; i++) {
      if (r <= cumulative[i]) {
        return i + 2; // Add 2 because sizes start at 2
      }
    }
    return maxEnsembleSize; // Fallback
  }
  
  // For MD < 0.7: blend bell curve with activity-based calculation
  // At MD=0.7: 100% bell curve
  // At MD=0.4: 0% bell curve, 100% activity-based
  // Between: linear blend
  
  let bellCurveSize = null;
  if (contrast >= 0.4) {
    // Calculate bell curve size (similar to above but with shifted peak)
    const maxEnsembleSize = numPlayers - 1;
    const sizeRange = maxEnsembleSize - 1;
    
    // Peak shifts further toward larger sizes
    const peakPosition = 0.4 + (0.7 - contrast) / 0.3 * 0.25; // 0.4 at MD=0.7, 0.65 at MD=0.4
    const peak = 2 + Math.round(peakPosition * sizeRange);
    const stdDev = 0.12 * sizeRange; // Narrower curve
    const weights = [];
    let maxWeight = 0;
    
    for (let size = 2; size <= maxEnsembleSize; size++) {
      const x = (size - 2) / sizeRange;
      const xPeak = (peak - 2) / sizeRange;
      const distance = (x - xPeak) / stdDev;
      const weight = Math.exp(-0.5 * distance * distance);
      const skewFactor = Math.exp(-contrast * 0.3 * x); // Less skew at lower contrast
      weights.push(weight * skewFactor);
      maxWeight = Math.max(maxWeight, weights[weights.length - 1]);
    }
    
    const probabilities = weights.map(w => w / maxWeight);
    const cumulative = [];
    let sum = 0;
    for (let i = 0; i < probabilities.length; i++) {
      sum += probabilities[i];
      cumulative.push(sum);
    }
    
    const r = Math.random() * sum;
    for (let i = 0; i < cumulative.length; i++) {
      if (r <= cumulative[i]) {
        bellCurveSize = i + 2;
        break;
      }
    }
    if (bellCurveSize === null) bellCurveSize = maxEnsembleSize;
  }
  
  // Activity-based calculation (original system)
  const minSizeFrac = Math.max(0.25, 0.33 + 0.17 * contrast); // 0.33 → 0.5
  const maxSizeFrac = Math.max(0.4, 0.5 + 0.25 * contrast); // 0.5 → 0.75
  const minSize = Math.max(2, Math.round(numPlayers * minSizeFrac));
  const maxSize = Math.max(minSize, Math.round(numPlayers * maxSizeFrac));
  const activityFactor = Math.pow(activity, 0.85);
  const activityBasedSize = Math.round(minSize + (maxSize - minSize) * activityFactor);
  
  // Blend bell curve and activity-based
  if (bellCurveSize !== null && contrast >= 0.4) {
    const blendFactor = (contrast - 0.4) / 0.3; // 0 at MD=0.4, 1 at MD=0.7
    // Weighted average
    const blended = Math.round(blendFactor * bellCurveSize + (1 - blendFactor) * activityBasedSize);
    return Math.max(2, Math.min(numPlayers - 1, blended));
  }
  
  // Pure activity-based for MD < 0.4
  return Math.max(2, Math.min(numPlayers - 1, activityBasedSize));
}

// DEPRECATED: Old complex density calculation - kept for reference
// Replaced by simplified getEnsembleSize()
export function densityWithContrast(N, A, C) {
  // === Mean-density-driven model ===
  // Low C = dense (tutti), High C = sparse and volatile

  const baseMinFrac = 0.1;
  const baseMaxFrac = 1.0;

// Steeper micro-dynamics response: low C ≈ tutti, high C ≈ solo/duo
    const meanFrac = 1.0 - 0.95 * Math.pow(C, 1.4);
    const varFrac  = 0.05 + 0.25 * Math.pow(C, 1.3);

  const minK = Math.max(1, Math.round(N * Math.max(baseMinFrac, meanFrac - varFrac)));
  const maxK = Math.min(N, Math.round(N * Math.min(baseMaxFrac, meanFrac + varFrac)));

  const gamma = (N <= 3) ? 0.65 : (N <= 4) ? 0.75 : (N <= 6) ? 0.9 : 0.95;
  const t = Math.pow(A, gamma);
  const targetK = Math.round(minK + (maxK - minK) * t);

  if (A > 0 && targetK === 0) return { minK, maxK, targetK: 1 };

//  if (window.DEBUG_MODE) {
//    console.log(
//      `[Density] C=${C.toFixed(2)} → mean=${(meanFrac * N).toFixed(1)} ` +
//      `range=${minK}–${maxK} target=${targetK}`
//    );
//  }

  return { minK, maxK, targetK };
}


export function eventProbs(N, A, C) {
  const scaleAll = N <= 3 ? 2.2 : N <= 4 ? 1.8 : N <= 6 ? 1.0 : 0.7;
  const scaleTrio = N >= 3 ? 1.1 : 0.0;
  const scaleDuo = N >= 2 ? (N <= 3 ? 1.6 : 1.1) : 0.0;
  const baseAll = 0.02, kAll = 0.08;
  const baseTrio = 0.04, kTrio = 0.1;
  const baseDuo = 0.06, kDuo = 0.12;

  let pAll = Math.min(1, (baseAll + kAll * A) * scaleAll);
  let pTrio = Math.min(1, (baseTrio + kTrio * A) * scaleTrio);
  let pDuo = Math.min(1, (baseDuo + kDuo * A) * scaleDuo);

  const a_all = N <= 4 ? 1.0 : N <= 8 ? 0.7 : 0.5;
  pAll *= 1 + a_all * C;
  const b_all = N <= 4 ? 0.25 : N <= 8 ? 0.15 : 0.1;
  if (A > 0.75) pAll = Math.min(1, pAll + b_all * (A - 0.75) / 0.25 * C);
  const s = pAll + pTrio + pDuo;
  if (s > 0.95) {
    const f = 0.95 / s;
    pAll *= f; pTrio *= f; pDuo *= f;
  }
  return { pAll, pTrio, pDuo };
}

export function pickDynamicsInRange(A, drMinIdx, drMaxIdx, numPlayers, playerIndex, controls) {
  const rMin = DYNAMICS[drMinIdx].val;
  const rMax = DYNAMICS[drMaxIdx].val;
  const baseSigma = 0.18 + 0.1 * A;
  const [intMin, intMax] = controls.interval;
  const avgInterval = (intMin + intMax) / 2;
  const intervalFactor = clamp01(1.2 - avgInterval / 180);
  const sizeFactor = numPlayers <= 3 ? 1.0 : numPlayers <= 6 ? 0.7 : 0.4;
  const sigma = baseSigma * sizeFactor * intervalFactor;
  const base = Math.sin(playerIndex * 12.9898 + A * 78.233) * 43758.5453;
  const noise = fract(base);
  const personalOffset = (noise - 0.5) * 0.1;
  let xRaw = clamp01(gaussianSample(A + personalOffset, sigma));
  const x = rMin + (rMax - rMin) * xRaw;
  let bestIdx = drMinIdx, bestd = 1e9;
  for (let i = drMinIdx; i <= drMaxIdx; i++) {
    const d = Math.abs(DYNAMICS[i].val - x);
    if (d < bestd) { bestd = d; bestIdx = i; }
  }
  const dsel = DYNAMICS[bestIdx];
  return { mark: dsel.mark, val: dsel.val };
}

export function densitySoftCap(numPlayers, out, maxK, A, C, drMinIdx, drMaxIdx) {
  const playingIdx = out.map((o, i) => [o, i]).filter(([o]) => o.state === 'Play').map(([, i]) => i);
  if (numPlayers > 4) {
    const factor = smoothstep(0.8, 1.0, A) * (0.4 + 0.8 * C);
    const softMax = Math.round(maxK + (numPlayers - maxK) * factor);
    if (playingIdx.length > softMax) {
      const extras = shuffle(playingIdx.slice(softMax));
      for (const i of extras) {
        const current = out[i];
        if (current.loudness >= 0.42) {
          let nextIdx = drMinIdx;
          for (let k = drMaxIdx; k >= drMinIdx; k--) {
            if (DYNAMICS[k].val < current.loudness) { nextIdx = k; break; }
          }
          const d = DYNAMICS[nextIdx];
          if (d.val < DYNAMICS[drMinIdx].val + 0.06) out[i] = { state: 'Rest' };
          else out[i] = { ...current, mark: d.mark, loudness: d.val };
        } else out[i] = { state: 'Rest' };
      }
    }
  }
  return out;
}

function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
