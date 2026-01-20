<script>
  import { goto } from '$lib/utils/navigation.js';
  import { base } from '$app/paths';
  import { onMount, onDestroy } from 'svelte';
  import { initSocket, disconnectSocket } from '$lib/stores/socket.js';
  import {
    socketStore,
    isConnected,
    sessionCode,
    isConductor,
    players,
    sessionSettings,
    instructionalMessage,
    performanceCues,
    performanceCountdowns,
    serverTime,
    pendingPerformanceState
  } from '$lib/stores/socket.js';
  
  // Import SVG images for dynamic marks
  import restSvg from '$lib/assets/images/rest.svg';
  import nuancePppSvg from '$lib/assets/images/Nuanceppp.svg';
  import nuancePpSvg from '$lib/assets/images/Nuancepp.svg';
  import nuancePSvg from '$lib/assets/images/Nuancep.svg';
  import nuanceMpSvg from '$lib/assets/images/Nuancemp.svg';
  import nuanceMfSvg from '$lib/assets/images/Nuancemf.svg';
  import nuanceFSvg from '$lib/assets/images/Nuancef.svg';
  import nuanceFfSvg from '$lib/assets/images/Nuanceff.svg';
  import nuanceFffSvg from '$lib/assets/images/Nuancefff.svg';
  
  // Map mark values to SVG imports
  const markToSvg = {
    'ppp': nuancePppSvg,
    'pp': nuancePpSvg,
    'p': nuancePSvg,
    'mp': nuanceMpSvg,
    'mf': nuanceMfSvg,
    'f': nuanceFSvg,
    'ff': nuanceFfSvg,
    'fff': nuanceFffSvg
  };
  
  function getMarkSvg(mark) {
    return markToSvg[mark] || null;
  }

  let socketInstance = null;
  let currentCode = '';
  let currentMessage = '';
  let currentSettings = null;
  let playerIndex = 0;
  
  // Performance state
  let hasReceivedFirstCue = false; // Track if we've received the first cue
  let currentCue = null;
  let currentCountdown = null;
  let countdownSeconds = 0;
  let countdownLabel = '';
  let showCountdown = false;
  let performanceEnded = false;
  let endMessage = '';
  
  // Clock sync with smoothing to prevent late messages from corrupting drift
  let clockDrift = 0;
  let clockDriftSamples = 0;
  const DRIFT_SMOOTHING = 0.3; // How much to weight new samples (0-1, lower = more smoothing)
  let countdownInterval = null;
  
  // Visual state
  let currentState = 'rest'; // 'rest' | 'play'
  let currentMark = '';
  let currentLoudness = 0;
  
  let serverTimestamp = Date.now();

  // Contextual banner state for late joiners/reconnectors
  let showContextualBanner = false;
  let contextualMessage = '';
  let performanceRemainingTime = 0; // in seconds
  let contextualBannerTimer = null;
  let remainingTimeInterval = null;
  let isLateJoiner = false; // Track if this player joined during performance

  // Format time remaining for display
  function formatTimeRemaining(remainingMs) {
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    if (minutes > 0) {
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${seconds}`;
  }

  // Find player index
  function findPlayerIndex() {
    if (!socketInstance) return 0;
    let $players = [];
    const unsubscribe = players.subscribe(p => {
      $players = p || [];
    });
    unsubscribe();
    const index = $players.findIndex(p => p.id === socketInstance.id);
    return index >= 0 ? index : 0;
  }

  // Calculate countdown from server timestamp
  // Improved with tolerance for late-arriving messages
  function updateCountdown(countdown, serverTimeValue) {
    if (!countdown || !countdown.endsAt) {
      return { seconds: 0, show: false };
    }

    const now = Date.now();
    const adjustedNow = now - clockDrift;
    const msLeft = countdown.endsAt - adjustedNow;
    const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
    
    // Add tolerance: show countdown even if slightly expired (within 200ms)
    // This handles late-arriving messages gracefully
    const toleranceMs = 200;
    const isLateMessage = msLeft < 0 && Math.abs(msLeft) < toleranceMs;
    const showCountdown = secsLeft > 0 || isLateMessage;
    
    return {
      seconds: Math.max(0, secsLeft),
      show: showCountdown
    };
  }

  // Update visual state based on cue
  function updateVisualState(cue) {
    if (!cue) return;
    
    if (cue.state === 'Rest' || cue.state === 'rest') {
      currentState = 'rest';
      currentMark = '';
      currentLoudness = 0;
    } else if (cue.state === 'Play' || cue.state === 'play') {
      currentState = 'play';
      currentMark = cue.mark || '';
      currentLoudness = cue.loudness || 0;
    }
  }

  // Calculate font size based on loudness
  $: fontSize = currentLoudness > 0 
    ? `${2 + (currentLoudness / 7) * 3}rem` 
    : '2rem';

  // Calculate scale based on loudness
  $: scale = currentLoudness > 0 
    ? `${1 + (currentLoudness / 7) * 0.3}` 
    : '1';

  onMount(() => {
    socketInstance = initSocket();
    
    if (!socketInstance) {
      goto('/');
      return;
    }

    // Check for pending performance state (late join)
    const unsubscribePending = pendingPerformanceState.subscribe(pending => {
      if (pending && pending.inProgress) {
        const { startTime, serverTime: serverTimeValue, remaining, currentCues, currentCountdowns, joinedLate } = pending;
        
        // Set late joiner flag
        isLateJoiner = joinedLate || false;
        
        // Sync clock (for potential performance-ended timing)
        clockDrift = Date.now() - serverTimeValue;
        clockDriftSamples = 1;
        
        // Late joiners don't receive performance cues - they'll observe only
        // Don't set up visual state from cues
        if (!isLateJoiner) {
          // Update visual state with current cues (for reconnectors who were original participants)
          const index = findPlayerIndex();
          if (currentCues && currentCues[index] !== undefined) {
            currentCue = currentCues[index];
            updateVisualState(currentCue);
            hasReceivedFirstCue = true;
          }
          
          // Set up countdown if active
          if (currentCountdowns && currentCountdowns[index]) {
            currentCountdown = currentCountdowns[index];
            const cd = updateCountdown(currentCountdown, serverTimeValue);
            countdownSeconds = cd.seconds;
            showCountdown = cd.show;
          }
        }
        
        // Show contextual banner for late joiners
        if (joinedLate && remaining !== undefined) {
          performanceRemainingTime = Math.ceil(remaining / 1000);
          contextualMessage = `You have successfully joined the session. You will be invited to play in the next performance.\n\nTime remaining in current performance: ${formatTimeRemaining(remaining)}`;
          showContextualBanner = true;
          
          // Update message every second to countdown
          remainingTimeInterval = setInterval(() => {
            if (performanceRemainingTime > 0) {
              performanceRemainingTime--;
              const remainingMs = performanceRemainingTime * 1000;
              contextualMessage = `You have successfully joined the session. You will be invited to play in the next performance.\n\nTime remaining in current performance: ${formatTimeRemaining(remainingMs)}`;
            } else {
              clearInterval(remainingTimeInterval);
              remainingTimeInterval = null;
            }
          }, 1000);
          
          // Banner stays visible for the entire performance (no auto-dismiss)
        }
        
        // Clear pending state after handling
        pendingPerformanceState.set(null);
      }
    });

    // Subscribe to stores
    const unsubscribeCode = sessionCode.subscribe(code => {
      currentCode = code || '';
    });

    const unsubscribeMessage = instructionalMessage.subscribe(msg => {
      currentMessage = msg || '';
    });

    const unsubscribeSettings = sessionSettings.subscribe(settings => {
      currentSettings = settings;
    });

    const unsubscribePlayers = players.subscribe(p => {
      if (p) {
        playerIndex = findPlayerIndex();
      }
    });

    // Listen for performance-cue events FIRST (before performance-starting)
    // This ensures we're ready to receive cues immediately
    socketInstance.on('performance-cue', ({ cues, countdowns, serverTime: serverTimeValue }) => {
      // Late joiners don't receive performance cues during current performance
      // They observe only and will participate in the next performance
      if (isLateJoiner) {
        return;
      }
      
      serverTimestamp = serverTimeValue;
      const now = Date.now();
      
      // Improved clock drift calculation with exponential moving average
      // This prevents single late messages from corrupting drift calculation
      const newDrift = now - serverTimeValue;
      if (clockDriftSamples === 0) {
        clockDrift = newDrift;
      } else {
        // Use exponential moving average to smooth out drift calculation
        clockDrift = clockDrift * (1 - DRIFT_SMOOTHING) + newDrift * DRIFT_SMOOTHING;
      }
      clockDriftSamples++;
      
      // Get this player's cue
      const index = findPlayerIndex();
      if (cues && Array.isArray(cues) && cues[index] !== undefined) {
        currentCue = cues[index];
      }
      
      // CRITICAL: If server sends empty countdowns, this is the authoritative signal
      // that countdown has expired - update immediately (server authority)
      if (!countdowns || !countdowns[index] || countdowns[index] === null) {
        // Server says countdown is done - update visual state immediately
        showCountdown = false;
        currentCountdown = null;
        if (currentCue) {
          updateVisualState(currentCue);
          hasReceivedFirstCue = true;
        }
        return; // Early return - server is authoritative
      }
      
      // Otherwise, process countdown normally
      const countdown = countdowns[index];
      const adjustedNow = now - clockDrift;
      const msLeft = countdown.endsAt ? (countdown.endsAt - adjustedNow) : 0;
      
      // Show countdown if there's time remaining (with tolerance for late messages)
      const toleranceMs = 200;
      const hasTimeRemaining = msLeft > -toleranceMs;
      
      let hasActiveCountdown = false;
      if (hasTimeRemaining && countdown.endsAt) {
        currentCountdown = countdown;
        
        // Prefer server-provided label (reflects upcoming cue)
        countdownLabel = currentCountdown.label || '';
        
        // Fallback: build label from cue if server label is missing
        if (!countdownLabel && currentCue) {
          if (currentCue.state === 'Play' || currentCue.state === 'play') {
            const mark = currentCue.mark || '';
            countdownLabel = mark ? `Play (${mark})` : 'Play';
          } else {
            countdownLabel = 'Rest';
          }
        }
        
        // Update countdown immediately for display
        const cd = updateCountdown(currentCountdown, serverTimeValue);
        countdownSeconds = cd.seconds;
        hasActiveCountdown = cd.show || cd.seconds > 0;
        showCountdown = hasActiveCountdown;
      } else {
        // Countdown expired - clear it and update visual state immediately
        showCountdown = false;
        currentCountdown = null;
        hasActiveCountdown = false;
        
        // If we have a cue, update visual state immediately (don't wait)
        if (currentCue) {
          updateVisualState(currentCue);
          hasReceivedFirstCue = true;
        }
      }
      
      // If no countdown is active and we have a cue, ensure visual state is updated
      // This handles the case where server sends empty countdowns array (final state)
      if (!hasActiveCountdown && currentCue) {
        updateVisualState(currentCue);
        hasReceivedFirstCue = true;
      } else if (!hasReceivedFirstCue && !currentCue) {
        // No cue yet, ensure REST state
        currentState = 'rest';
        currentMark = '';
        currentLoudness = 0;
      }
    });

    // Listen for performance-starting event (after performance-cue listener is set up)
    socketInstance.on('performance-starting', ({ serverTime: serverTimeValue, settings, instructionalMessage: msg }) => {
      serverTimestamp = serverTimeValue;
      const now = Date.now();
      const newDrift = now - serverTimeValue;
      // Initialize clock drift (will be smoothed by subsequent messages)
      clockDrift = newDrift;
      clockDriftSamples = 1;
      currentSettings = settings;
      currentMessage = msg || currentMessage;
    });

    // Listen for performance-ended event
    socketInstance.on('performance-ended', ({ role }) => {
      performanceEnded = true;
      endMessage = 'The piece has ended';
      
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      
      // Clear countdown
      showCountdown = false;
      currentCountdown = null;
      
      // After 10 seconds, handle end
      setTimeout(() => {
        if (role === 'conductor') {
          // Conductor returns to conductor page automatically
          goto('/conductor');
        } else {
          // Performers also return to lobby automatically
          goto('/lobby');
        }
      }, 10000);
    });

    // Listen for return-to-lobby (conductor only)
    socketInstance.on('return-to-lobby', () => {
      goto('/conductor');
    });

    // Listen for session-joined (handles late join during performance)
    socketInstance.on('session-joined', (data) => {
      if (data.performanceState && data.performanceState.inProgress) {
        const { startTime, serverTime, remaining, currentCues, currentCountdowns, joinedLate } = data.performanceState;
        
        // Set late joiner flag
        isLateJoiner = joinedLate || false;
        
        // Sync clock (for potential performance-ended timing)
        clockDrift = Date.now() - serverTime;
        clockDriftSamples = 1;
        
        // Late joiners don't receive performance cues
        if (!isLateJoiner) {
          // Update visual state with current cues (for reconnectors)
          const index = findPlayerIndex();
          if (currentCues && currentCues[index] !== undefined) {
            currentCue = currentCues[index];
            updateVisualState(currentCue);
            hasReceivedFirstCue = true;
          }
          
          // Set up countdown if active
          if (currentCountdowns && currentCountdowns[index]) {
            currentCountdown = currentCountdowns[index];
            const cd = updateCountdown(currentCountdown, serverTime);
            countdownSeconds = cd.seconds;
            showCountdown = cd.show;
          }
        }
        
        // Show contextual banner for late joiners
        if (joinedLate && remaining !== undefined) {
          performanceRemainingTime = Math.ceil(remaining / 1000);
          contextualMessage = `You have successfully joined the session. You will be invited to play in the next performance.\n\nTime remaining in current performance: ${formatTimeRemaining(remaining)}`;
          showContextualBanner = true;
          
          // Update message every second to countdown
          remainingTimeInterval = setInterval(() => {
            if (performanceRemainingTime > 0) {
              performanceRemainingTime--;
              const remainingMs = performanceRemainingTime * 1000;
              contextualMessage = `You have successfully joined the session. You will be invited to play in the next performance.\n\nTime remaining in current performance: ${formatTimeRemaining(remainingMs)}`;
            } else {
              clearInterval(remainingTimeInterval);
              remainingTimeInterval = null;
            }
          }, 1000);
          
          // Banner stays visible for the entire performance (no auto-dismiss)
        }
      }
    });

    // Start countdown update interval
    countdownInterval = setInterval(() => {
      if (currentCountdown && !performanceEnded) {
        // Update serverTimestamp based on clock drift for more accurate countdown
        const now = Date.now();
        const adjustedServerTime = now - clockDrift;
        
        const cd = updateCountdown(currentCountdown, adjustedServerTime);
        const previousSeconds = countdownSeconds;
        countdownSeconds = cd.seconds;
        
        // Update showCountdown based on calculated value
        showCountdown = cd.show;
        
        // If countdown just reached 0 (was > 0, now is 0), update visual state IMMEDIATELY
        // Don't wait for server confirmation - this reduces delay
        if (previousSeconds > 0 && cd.seconds === 0) {
          showCountdown = false;
          // Update visual state immediately when countdown expires locally
          // Server message will override if there's a conflict, but this ensures responsiveness
          if (currentCue) {
            updateVisualState(currentCue);
            hasReceivedFirstCue = true;
          }
        }
      } else if (!currentCountdown && currentCue && !performanceEnded) {
        // Fallback: if we have a cue but no countdown, ensure visual state is updated
        // This handles cases where countdown message was missed but cue was received
        if (!hasReceivedFirstCue || (currentState === 'rest' && currentCue.state === 'Play')) {
          updateVisualState(currentCue);
          hasReceivedFirstCue = true;
        }
      }
    }, 200); // Update every 200ms

    return () => {
      unsubscribePending();
      unsubscribeCode();
      unsubscribeMessage();
      unsubscribeSettings();
      unsubscribePlayers();
      
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      
      if (contextualBannerTimer) {
        clearTimeout(contextualBannerTimer);
        contextualBannerTimer = null;
      }
      
      if (remainingTimeInterval) {
        clearInterval(remainingTimeInterval);
        remainingTimeInterval = null;
      }
      
      if (socketInstance) {
        socketInstance.off('performance-starting');
        socketInstance.off('performance-cue');
        socketInstance.off('performance-ended');
        socketInstance.off('return-to-lobby');
        socketInstance.off('session-joined');
      }
    };
  });

  function handleLeave() {
    if (socketInstance && currentCode) {
      socketInstance.emit('leave-session', { code: currentCode });
    }
    disconnectSocket();
    goto('/');
  }

  function handleReturnToLobby() {
    goto('/lobby');
  }
</script>

<div
  class="fixed inset-0 h-screen w-screen transition-all duration-300 {currentState === 'rest'
    ? 'text-brand-gray-light'
    : 'text-brand-gray'}"
  style="background-image: url({currentState === 'rest' ? base + '/assets/bgDark.png' : base + '/assets/bgLight.png'}); background-repeat: repeat;"
>
  <!-- Contextual Banner for late joiners/reconnectors -->
  {#if showContextualBanner}
    <div class="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
      <div class="bg-black bg-opacity-75 text-white px-6 py-3 rounded-lg shadow-lg">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm font-medium" style="white-space: pre-line;">{contextualMessage}</p>
          <button
            on:click={() => {
              showContextualBanner = false;
              if (remainingTimeInterval) {
                clearInterval(remainingTimeInterval);
                remainingTimeInterval = null;
              }
              if (contextualBannerTimer) {
                clearTimeout(contextualBannerTimer);
                contextualBannerTimer = null;
              }
            }}
            class="text-white opacity-60 hover:opacity-100 transition-opacity ml-4"
            aria-label="Dismiss"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Main performance display -->
  {#if !performanceEnded}
    <div class="h-full flex items-center justify-center relative">
      <!-- Countdown overlay -->
      {#if showCountdown && currentCountdown}
        <div class="absolute top-8 left-0 right-0 text-center">
          <div class="text-2xl sm:text-3xl font-semibold mb-2">
            {countdownLabel} in {countdownSeconds}...
          </div>
        </div>
      {/if}

      <!-- Main cue display -->
      <div
        class="text-center px-4 transition-all duration-300 flex items-center justify-center opacity-60"
        style="transform: scale({scale});"
      >
        {#if currentState === 'rest'}
          <img src={restSvg} alt="Rest" class="max-w-full h-auto" style="max-height: 15rem; filter: invert(1);" />
        {:else if currentState === 'play' && getMarkSvg(currentMark)}
          <img src={getMarkSvg(currentMark)} alt={currentMark} class="max-w-full h-auto" style="max-height: 15rem;" />
        {:else if currentState === 'play'}
          <!-- Fallback to text if SVG not found -->
          <div class="text-4xl sm:text-6xl font-bold">{currentMark}</div>
        {/if}
      </div>

      <!-- Leave button -->
      <button
        on:click={handleLeave}
        class="fixed bottom-4 right-4 px-3 py-2 text-xs opacity-50 hover:opacity-100 transition-opacity duration-200 border rounded z-10 {currentState === 'rest' ? 'bg-black text-brand-gray-light border-brand-gray-light' : 'bg-white text-brand-gray border-gray-300'}"
        aria-label="Leave performance"
      >
        Leave
      </button>
    </div>
  <!-- Performance ended -->
  {:else}
    <div class="h-full flex flex-col items-center justify-center">
      <div class="text-4xl sm:text-6xl font-bold mb-8">{endMessage}</div>
      
      {#if $isConductor}
        <div class="text-lg sm:text-xl text-center">
          Returning to conductor setup...
        </div>
      {:else}
        <div class="text-lg sm:text-xl text-center">
          Returning to lobby...
        </div>
      {/if}
    </div>
  {/if}
</div>

