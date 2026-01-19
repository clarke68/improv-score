// engine-core.js — orchestration, fairness, scheduling
// Temporary global debug flag
const debugMode = true;

import {
  getEnsembleSize,
  pickDynamicsInRange,
} from './musical-logic.js';
import { DYNAMICS, activityArc } from './arc.js';

// Small math helpers (these are local-only)
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;

export class ScoreEngine {
  constructor(opts = {}) {
    this.onRender = opts.onRender || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.MAX_PLAY_STREAK = 3;
    this.MAX_REST_STREAK = 3;
    this._reset();
  }

  _reset() {
    this.previousStates = [];
    this.playCounts = [];
    this.playStreaks = [];
    this.restStreaks = [];
    this.lastInstructions = [];
    this.promptTimeout = null;
    this.pieceStartTime = 0;
    this.pieceEndTime = 0;
    this.controls = null;
    this.currentRandomActivity = Math.random();
  }

  // ===== Lifecycle ===========================================================

  startPiece(controls) {
    this.controls = { ...controls };

    const preRollMs = 5000;
    const durationMs = this.controls.durationMin * 60 * 1000;
    this.pieceStartTime = Date.now() + preRollMs;
    this.pieceEndTime = this.pieceStartTime + durationMs;

    const N = this.controls.numPlayers;
    this.previousStates = Array.from({ length: N }, () => ({ state: 'Rest' }));
    this.playCounts = new Array(N).fill(0);
    this.playStreaks = new Array(N).fill(0);
    this.restStreaks = new Array(N).fill(1);
    this.lastInstructions = new Array(N).fill('Rest');

    // Generate first states immediately - first cue should appear right away
    const firstStates = this._generateBiasedInstructionsWithDynamics(N, this.pieceStartTime);

    const labelFn = (prev, next) => {
      if (!next) return '';
      if (next.state === 'Play') return `Play${next.mark ? ` (${next.mark})` : ''}`;
      return 'Rest';
    };

    // Show countdown to first cue, then immediately schedule next prompt (no delay)
    this._countdownForChanges(
      firstStates,
      () => {
        // After first cue countdown completes, immediately schedule the next prompt
        // This ensures the first cue appears right away, and subsequent cues follow the interval
        this._scheduleNextPrompt(N);
      },
      { forceAll: true, customLabel: labelFn }
    );
  }

  endPiece(numPlayers) {
    clearTimeout(this.promptTimeout);
    const finalStates = Array.from({ length: numPlayers }, () => ({ state: 'Rest' }));
    this._countdownForChanges(
      finalStates,
      () => this.onEnd(finalStates),
      { forceAll: true, forceLabel: 'Rest' }
    );
  }

  // ===== Core generation =====================================================

  _generateBiasedInstructionsWithDynamics(numPlayers, now) {
    const { dynRangeIdx, contrast, arc, durationMin } = this.controls;
    const [drMinIdx, drMaxIdx] = dynRangeIdx;
    const C = contrast;

    const A =
      arc === 'random'
        ? this.currentRandomActivity
        : activityArc(now, this.pieceStartTime, this.pieceEndTime, arc, durationMin);

    // If contrast off → tutti
    if (C <= 0.0001) {
      return Array.from({ length: numPlayers }, () => {
        const dyn = pickDynamicsInRange(A, drMinIdx, drMaxIdx, numPlayers, 0, this.controls);
        return { state: 'Play', mark: dyn.mark, loudness: dyn.val };
      });
    }

    // Get ensemble size directly from simplified function
    const ensembleSize = getEnsembleSize(numPlayers, A, C);

    // Conditional fairness constraints with transition zone (MD 0.4-0.6):
    // - MAX_REST_STREAK: only active at MD < 0.4 (low contrast, prioritize participation)
    // - MAX_PLAY_STREAK: only active at MD > 0.6 (high contrast, prioritize variety)
    // - Both rules OFF in transition zone (0.4-0.6): let pure tutti probability control
    const usePlayStreakLimit = C > 0.6;
    const useRestStreakLimit = C < 0.4;

    // Fair player selection (same fairness logic as before)
    const order = Array.from({ length: numPlayers }, (_, i) => i).sort((i, j) => {
      // Prioritize players who have played less
      if (this.playCounts[i] !== this.playCounts[j]) return this.playCounts[i] - this.playCounts[j];
      // Prioritize players with longer rest streaks (more overdue to play)
      if (this.restStreaks[i] !== this.restStreaks[j]) return this.restStreaks[j] - this.restStreaks[i];
      // Random tie-breaker
      return Math.random() - 0.5;
    });

    const selected = new Set();
    
    // Step 1: Select players up to ensemble size, conditionally respecting play streak limits
    for (const i of order) {
      if (selected.size >= ensembleSize) break;
      // Skip if player has hit max play streak (only enforced at MD > 0.6)
      if (usePlayStreakLimit && this.playStreaks[i] >= this.MAX_PLAY_STREAK) continue;
      selected.add(i);
    }
    
    // Step 2: Force players who have hit max rest streak (only enforced at MD < 0.4)
    if (useRestStreakLimit) {
      for (let i = 0; i < numPlayers; i++) {
        if (this.restStreaks[i] >= this.MAX_REST_STREAK && !selected.has(i)) {
          selected.add(i);
        }
      }
    }
    
    // Step 3: Ensure minimum ensemble size
    // For small groups (≤5): allow solos if ensembleSize is 1
    // For larger groups: enforce minimum 2 players (no solos)
    const minEnsembleSize = (numPlayers <= 5 && ensembleSize === 1) ? 1 : 2;
    if (selected.size < minEnsembleSize && selected.size < numPlayers) {
      // Find players not yet selected, in priority order
      const candidates = order.filter(i => !selected.has(i));
      // Only add if we need to reach minimum and have candidates
      while (selected.size < minEnsembleSize && candidates.length > 0) {
        selected.add(candidates.shift()); // Add highest priority candidate
      }
    }
    
    // Step 4: If we exceed ensemble size, remove lowest priority players
    // Protect rest-streak players only when MD < 0.4
    if (selected.size > ensembleSize) {
      const toRemove = Array.from(selected)
        .filter(idx => {
          // At MD < 0.4, protect rest-streak players from removal
          // At MD >= 0.4, can remove anyone to achieve desired ensemble size
          if (useRestStreakLimit) {
            return this.restStreaks[idx] < this.MAX_REST_STREAK;
          }
          return true; // Can remove anyone when rest-streak limit is inactive
        })
        .sort((a, b) => {
          // Reverse priority: remove highest play counts first, then longest play streaks
          if (this.playCounts[a] !== this.playCounts[b]) return this.playCounts[b] - this.playCounts[a];
          if (this.playStreaks[a] !== this.playStreaks[b]) return this.playStreaks[b] - this.playStreaks[a];
          return Math.random() - 0.5;
        });
      
      // Remove players until we're at or below ensemble size
      // For 2-player groups: allow solo (min 1) if ensembleSize is 1
      // For larger groups: never drop below 2 players
      const minAllowed = (numPlayers === 2 && ensembleSize === 1) ? 1 : 2;
      while (selected.size > ensembleSize && selected.size > minAllowed && toRemove.length > 0) {
        selected.delete(toRemove.shift());
      }
    }
    
    // Safety: ensure at least one player plays if activity > 0
    if (selected.size === 0 && A > 0) {
      selected.add(order[0]);
    }

    // Build output array
    let out = Array.from({ length: numPlayers }, (_, i) => {
      if (selected.has(i)) {
        const dyn = pickDynamicsInRange(A, drMinIdx, drMaxIdx, numPlayers, i, this.controls);
        return { state: 'Play', mark: dyn.mark, loudness: dyn.val };
      }
      return { state: 'Rest' };
    });

    return out;
  }

  // ===== Scheduling & Prompt cycle ==========================================

  _showPrompt(numPlayers) {
    const { arc } = this.controls;
    if (arc === 'random') this.currentRandomActivity = Math.random();
    const newStates = this._generateBiasedInstructionsWithDynamics(numPlayers, Date.now());
    this._countdownForChanges(newStates, () => this.onRender(newStates));
    if (this.isDebug && this.isDebug()) {
        console.log('Prompt State:', newStates.map(s => s.state === 'Play' ? s.mark : '—').join(' | '));
        }
  }

  _scheduleNextPrompt(numPlayers) {
    const { interval, arc, durationMin } = this.controls;
    const [min, max] = interval.map(Number);
    const now = Date.now();

    const A =
      arc === 'random'
        ? this.currentRandomActivity
        : activityArc(now, this.pieceStartTime, this.pieceEndTime, arc, durationMin);

    // --- Direct mapping of activity (A) to user-set interval range ---
// A = 0 → longest interval (max); A = 1 → shortest interval (min)
let target = (1 - A) * max + A * min;

// Add ±15% randomization (jitter)
target += 0.15 * target * (Math.random() * 2 - 1);

// Clamp to user range and round
target = Math.max(min, Math.min(max, Math.round(target)));

// Convert to milliseconds
const delayMs = target * 1000;

    if (now + delayMs < this.pieceEndTime) {
      this.promptTimeout = setTimeout(() => {
        this._showPrompt(numPlayers);
        this._scheduleNextPrompt(numPlayers);
      }, delayMs);
    } else {
      this.endPiece(numPlayers);
    }
  }

  // ===== Fairness, countdown, and commit ====================================

  _commitStates(newStates) {
    this.previousStates = newStates.map((s) => ({ ...s }));
    newStates.forEach((s, i) => {
      if (s.state === 'Play') {
        this.playCounts[i]++;
        this.playStreaks[i]++;
        this.restStreaks[i] = 0;
      } else {
        this.restStreaks[i]++;
        this.playStreaks[i] = 0;
      }
      this.lastInstructions[i] = s.state;
    });

//    if (this.isDebug && this.isDebug()) {
//        console.log('PlayCounts:', this.playCounts);
//    }

  }

  _changed(prevObj, nextObj) {
    if (!prevObj && nextObj) return true;
    if (!prevObj || !nextObj) return false;
    if (prevObj.state !== nextObj.state) return true;
    if (prevObj.state === 'Play' && prevObj.mark !== nextObj.mark) return true;
    return false;
  }

  _changeLabel(prevObj, nextObj) {
    if (!nextObj) return '';
    if (!prevObj || prevObj.state !== nextObj.state)
      return nextObj.state === 'Play' ? `Play${nextObj.mark ? ` (${nextObj.mark})` : ''}` : 'Rest';
    if (nextObj.state === 'Play' && prevObj.mark !== nextObj.mark)
      return `(${nextObj.mark})`;
    return '';
  }

  _countdownForChanges(newStates, onCommitted, opts = {}) {
    const COUNTDOWN_SECS = 5;
    const countdowns = newStates.map((nextObj, i) => {
      const prevObj = this.previousStates[i];
      const needsCountdown = opts.forceAll || this._changed(prevObj, nextObj);
      if (!needsCountdown) return null;
      const label = opts.customLabel
        ? opts.customLabel(prevObj, nextObj, i)
        : opts.forceLabel || this._changeLabel(prevObj, nextObj);
      return { label, endsAt: Date.now() + COUNTDOWN_SECS * 1000, secs: COUNTDOWN_SECS };
    });

    if (!countdowns.some(Boolean)) {
      this._commitStates(newStates);
      this.onRender(newStates, [], Date.now());
      onCommitted && onCommitted();
      return;
    }

    const TICK_MS = 200;
    let intervalId;
    const computeRemaining = () => {
      let anyActive = false;
      const now = Date.now();
      for (const cd of countdowns) {
        if (!cd) continue;
        const msLeft = cd.endsAt - now;
        cd.secs = msLeft > 0 ? Math.max(1, Math.ceil(msLeft / 1000)) : 0;
        if (cd.secs > 0) anyActive = true;
      }
      return anyActive;
    };

    const renderFrame = () => {
      const anyActive = computeRemaining();
      const displayStates = this.previousStates.map((prev, i) =>
        countdowns[i] && countdowns[i].secs > 0 ? prev : newStates[i]
      );
      const uiCountdowns = countdowns.map((cd) => (cd ? { secs: cd.secs, label: cd.label, endsAt: cd.endsAt } : null));
      this.onRender(displayStates, uiCountdowns, Date.now());
      if (!anyActive) {
        clearInterval(intervalId);
        this._commitStates(newStates);
        // Send final render with new states and empty countdowns to ensure clients see the update
        this.onRender(newStates, [], Date.now());
        onCommitted && onCommitted();
      }
    };

    renderFrame();
    intervalId = setInterval(renderFrame, TICK_MS);
  }
}
