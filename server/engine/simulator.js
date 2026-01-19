// Performance simulator for testing without real players
import { ScoreEngine } from './engine-core.js';

export class PerformanceSimulator {
  constructor(settings) {
    this.settings = settings;
    this.events = [];
    this.stats = {
      totalPrompts: 0,
      playerStats: [],
      intervalStats: [],
      dynamicDistribution: {},
      fairness: { minPlays: Infinity, maxPlays: 0, variance: 0 }
    };
  }

  async simulate(durationMinutes = null) {
    const duration = durationMinutes || this.settings.durationMin;
    const numPlayers = this.settings.numPlayers || 8;
    
    // Reset stats
    this.events = [];
    this.stats.playerStats = Array.from({ length: numPlayers }, () => ({
      totalPlays: 0,
      totalRests: 0,
      playStreaks: [],
      restStreaks: [],
      dynamics: {}
    }));

      let lastPromptTime = 0;
      let promptIndex = 0;
      const intervals = [];

      return new Promise((resolve) => {
        const startTime = Date.now();
        const pieceStartTime = startTime + 5000; // 5s pre-roll
        const pieceEndTime = pieceStartTime + (duration * 60 * 1000);

      // Store original functions
      const originalSetTimeout = global.setTimeout;
      const originalClearTimeout = global.clearTimeout;
      const originalDateNow = Date.now;
      
      let simulatedTime = startTime;
      const ACCELERATION = 60; // 60x speed
      
      // Simple approach: override setTimeout to use accelerated delays
      global.setTimeout = (callback, delay) => {
        // Accelerate the delay
        const acceleratedDelay = Math.max(1, Math.floor(delay / ACCELERATION));
        return originalSetTimeout(callback, acceleratedDelay);
      };
      
      // Override Date.now() to return simulated time
      // We'll advance it based on real elapsed time
      const realStartTime = originalDateNow();
      Date.now = () => {
        const realElapsed = originalDateNow() - realStartTime;
        simulatedTime = startTime + (realElapsed * ACCELERATION);
        return simulatedTime;
      };
      
      const engine = new ScoreEngine({
        onRender: (cues, countdowns, renderTime) => {
          // Use current time if renderTime is not provided (happens when called from onCommitted)
          const currentTime = renderTime !== undefined ? renderTime : Date.now();
          const elapsed = (currentTime - pieceStartTime) / 1000;
          
          // Filter out countdown ticks (pre-roll period when elapsed < 0)
          if (elapsed < 0) {
            return; // Skip countdown period renders
          }
          
          // Filter out ANY renders with countdowns array present (even if all secs === 0)
          // Only record renders when countdowns is empty array [] or undefined/null
          // This happens when onCommitted callback calls onRender directly
          if (countdowns !== undefined && countdowns !== null && countdowns.length > 0) {
            return; // Skip renders that have countdowns array (even if finished)
          }
          
          // If we get here, countdowns have finished (or there were none)
          // Use the current render time for elapsed calculation
          const elapsedSeconds = elapsed;
          
          const intervalSinceLastPrompt = elapsedSeconds - lastPromptTime;
          lastPromptTime = elapsedSeconds;
          
          if (promptIndex > 0) {
            intervals.push(intervalSinceLastPrompt);
          }

          const playingCount = cues.filter(c => c.state === 'Play').length;
          const playingPlayers = cues
            .map((c, i) => ({ playerIndex: i, cue: c }))
            .filter(({ cue }) => cue.state === 'Play');

          // Record event
          this.events.push({
            promptIndex: promptIndex++,
            elapsedSeconds: elapsedSeconds,
            intervalSinceLastPrompt: promptIndex > 1 ? intervalSinceLastPrompt : 0,
            playingCount: playingCount,
            players: playingPlayers.map(({ playerIndex, cue }) => ({
              playerIndex,
              dynamic: cue.mark || null,
              loudness: cue.loudness || 0
            })),
            dynamics: playingPlayers.map(({ cue }) => cue.mark).filter(Boolean)
          });

          // Update stats
          cues.forEach((cue, i) => {
            const playerStat = this.stats.playerStats[i];
            if (cue.state === 'Play') {
              playerStat.totalPlays++;
              const dyn = cue.mark || 'unknown';
              playerStat.dynamics[dyn] = (playerStat.dynamics[dyn] || 0) + 1;
            } else {
              playerStat.totalRests++;
            }
          });

          this.stats.totalPrompts = promptIndex;
        },
        onEnd: (cues) => {
          // Restore original functions
          global.setTimeout = originalSetTimeout;
          global.clearTimeout = originalClearTimeout;
          Date.now = originalDateNow;
          
          this._finalizeStats(numPlayers, intervals, duration);
          resolve({
            events: this.events,
            stats: this.stats,
            duration: duration
          });
        }
      });

      // Start the piece
      engine.startPiece(this.settings);
      
      // Safety timeout - force end if simulation takes too long
      originalSetTimeout(() => {
        // Check if we're done
        if (this.events.length === 0 || simulatedTime < pieceEndTime) {
          // Force restore and end
          global.setTimeout = originalSetTimeout;
          global.clearTimeout = originalClearTimeout;
          Date.now = originalDateNow;
          
          this._finalizeStats(numPlayers, intervals, duration);
          resolve({
            events: this.events,
            stats: this.stats,
            duration: duration
          });
        }
      }, (duration * 60 * 1000) / ACCELERATION + 5000); // Accelerated duration + buffer
    });
  }

  _finalizeStats(numPlayers, intervals, duration) {
    // Store duration
    this.stats.duration = duration;
    
    // Calculate fairness metrics
    const playCounts = this.stats.playerStats.map(p => p.totalPlays);
    if (playCounts.length > 0 && playCounts.some(c => c > 0)) {
      this.stats.fairness = {
        minPlays: Math.min(...playCounts),
        maxPlays: Math.max(...playCounts),
        variance: this._calculateVariance(playCounts),
        stdDev: Math.sqrt(this._calculateVariance(playCounts)),
        coefficient: this._calculateCoefficient(playCounts)
      };
    } else {
      this.stats.fairness = {
        minPlays: 0,
        maxPlays: 0,
        variance: 0,
        stdDev: 0,
        coefficient: 0
      };
    }

    // Calculate interval statistics
    if (intervals && intervals.length > 0) {
      this.stats.intervalStats = {
        mean: intervals.reduce((a, b) => a + b, 0) / intervals.length,
        min: Math.min(...intervals),
        max: Math.max(...intervals),
        all: intervals
      };
    } else {
      this.stats.intervalStats = {
        mean: 0,
        min: 0,
        max: 0,
        all: []
      };
    }

    // Calculate dynamic distribution
    this.stats.dynamicDistribution = {};
    this.stats.playerStats.forEach(stat => {
      Object.entries(stat.dynamics).forEach(([dyn, count]) => {
        this.stats.dynamicDistribution[dyn] = 
          (this.stats.dynamicDistribution[dyn] || 0) + count;
      });
    });
  }

  _calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  _calculateCoefficient(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean === 0) return 0;
    const variance = this._calculateVariance(values);
    return Math.sqrt(variance) / mean;
  }

  generateReport() {
    // Ensure stats are initialized
    if (!this.stats.fairness) {
      this.stats.fairness = {
        minPlays: 0,
        maxPlays: 0,
        variance: 0,
        stdDev: 0,
        coefficient: 0
      };
    }
    if (!this.stats.intervalStats) {
      this.stats.intervalStats = {
        mean: 0,
        min: 0,
        max: 0,
        all: []
      };
    }
    if (!this.stats.dynamicDistribution) {
      this.stats.dynamicDistribution = {};
    }
    
    const report = {
      summary: {
        totalPrompts: this.events.length,
        duration: this.stats.duration || this.settings.durationMin,
        players: this.settings.numPlayers || 8
      },
      fairness: this.stats.fairness,
      intervalStats: this.stats.intervalStats,
      dynamicDistribution: this.stats.dynamicDistribution,
      playerBreakdown: this.stats.playerStats.map((stat, i) => ({
        playerIndex: i,
        totalPlays: stat.totalPlays || 0,
        totalRests: stat.totalRests || 0,
        playPercentage: (stat.totalPlays || 0) + (stat.totalRests || 0) > 0 
          ? ((stat.totalPlays || 0) / ((stat.totalPlays || 0) + (stat.totalRests || 0))) * 100 
          : 0,
        dynamics: stat.dynamics || {}
      })),
      timeline: this.events.map(e => {
        // Ensure elapsedSeconds is valid (should be >= 0 after filtering)
        const elapsed = isNaN(e.elapsedSeconds) || e.elapsedSeconds < 0 ? 0 : e.elapsedSeconds;
        const minutes = Math.floor(elapsed / 60);
        const seconds = Math.floor(elapsed % 60);
        
        return {
          time: `${minutes}:${String(seconds).padStart(2, '0')}`,
          elapsedSeconds: elapsed,
          interval: e.intervalSinceLastPrompt > 0 ? e.intervalSinceLastPrompt.toFixed(1) + 's' : '—',
          playing: e.playingCount,
          dynamics: e.dynamics.join(', ') || '—'
        };
      })
    };
    return report;
  }
}

