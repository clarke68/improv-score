<script>
  import { goto } from '$app/navigation';
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
    serverTime
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
  
  // Clock sync
  let clockDrift = 0;
  let countdownInterval = null;
  
  // Visual state
  let currentState = 'rest'; // 'rest' | 'play'
  let currentMark = '';
  let currentLoudness = 0;
  
  let serverTimestamp = Date.now();

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
  function updateCountdown(countdown, serverTimeValue) {
    if (!countdown || !countdown.endsAt) {
      return { seconds: 0, show: false };
    }

    const now = Date.now();
    const adjustedNow = now - clockDrift;
    const msLeft = countdown.endsAt - adjustedNow;
    const secsLeft = Math.max(0, Math.ceil(msLeft / 1000));
    
    return {
      seconds: secsLeft,
      show: secsLeft > 0 && msLeft > 0
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
      
      serverTimestamp = serverTimeValue;
      
      // Update clock drift estimate
      const now = Date.now();
      clockDrift = now - serverTimeValue;
      
      // Get this player's cue
      const index = findPlayerIndex();
      if (cues && Array.isArray(cues) && cues[index] !== undefined) {
        currentCue = cues[index];
      }
      
      // Get this player's countdown first
      let hasActiveCountdown = false;
      if (countdowns && Array.isArray(countdowns) && countdowns[index]) {
        const countdown = countdowns[index];
        // Check if countdown exists and has time remaining (either secs > 0 or endsAt in future)
        const hasTimeRemaining = (countdown.secs > 0) || (countdown.endsAt && countdown.endsAt > serverTimeValue);
        
        if (hasTimeRemaining) {
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
          
          // Trust the hasTimeRemaining check - if countdown has time, it's active
          // Even if updateCountdown shows 0 due to timing edge cases, we should still show REST
          hasActiveCountdown = true;
          // Force showCountdown to true if we have an active countdown, regardless of cd.show
          // This ensures the countdown displays even if timing calculations are slightly off
          showCountdown = true;
        } else {
          showCountdown = false;
          currentCountdown = null;
        }
      } else {
        showCountdown = false;
        currentCountdown = null;
      }
      
      // Only update visual state if there's no active countdown
      // If there's a countdown, keep current state until countdown ends
      if (currentCue) {
        if (!hasActiveCountdown) {
          updateVisualState(currentCue);
          hasReceivedFirstCue = true;
        }
        // If there's a countdown, don't update visual state yet - keep current state
        // The state will be updated when countdown completes (handled in interval)
      } else if (!hasReceivedFirstCue) {
        // No cue yet, ensure REST state
        currentState = 'rest';
        currentMark = '';
        currentLoudness = 0;
      }
    });

    // Listen for performance-starting event (after performance-cue listener is set up)
    socketInstance.on('performance-starting', ({ serverTime: serverTimeValue, settings, instructionalMessage: msg }) => {
      serverTimestamp = serverTimeValue;
      clockDrift = Date.now() - serverTimeValue;
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
          // Conductor returns to lobby automatically
          goto('/conductor');
        } else {
          // Performers see return button (handled in template)
        }
      }, 10000);
    });

    // Listen for return-to-lobby (conductor only)
    socketInstance.on('return-to-lobby', () => {
      goto('/conductor');
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
        
        // Only hide countdown if it's truly expired (seconds is 0 AND show is false)
        // Keep showing it if seconds > 0, even if show is false due to timing edge cases
        if (cd.seconds > 0) {
          showCountdown = true;
        } else {
          showCountdown = cd.show;
        }
        
        // If countdown just reached 0 (was > 0, now is 0), update visual state to the current cue
        if (previousSeconds > 0 && cd.seconds === 0) {
          showCountdown = false;
          // Now update to the actual cue state
          if (currentCue) {
            updateVisualState(currentCue);
            hasReceivedFirstCue = true;
          }
        }
      }
    }, 200); // Update every 200ms

    return () => {
      unsubscribeCode();
      unsubscribeMessage();
      unsubscribeSettings();
      unsubscribePlayers();
      
      if (countdownInterval) {
        clearInterval(countdownInterval);
      }
      
      if (socketInstance) {
        socketInstance.off('performance-starting');
        socketInstance.off('performance-cue');
        socketInstance.off('performance-ended');
        socketInstance.off('return-to-lobby');
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
  style="background-image: url({currentState === 'rest' ? '/assets/bgDark.png' : '/assets/bgLight.png'}); background-repeat: repeat;"
>
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

      <!-- Leave button (minimal) -->
      <button
        on:click={handleLeave}
        class="absolute bottom-4 right-4 px-3 py-2 text-xs opacity-50 hover:opacity-100 transition-opacity duration-200 border rounded"
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
        <button
          on:click={handleReturnToLobby}
          class="mt-8 bg-brand-feature hover:bg-brand-feature-dark text-white font-normal p-4 transition-colors duration-200 text-base leading-4"
        >
          Return to Lobby
        </button>
      {/if}
    </div>
  {/if}
</div>

