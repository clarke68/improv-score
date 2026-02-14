<script>
  import { goto } from '$lib/utils/navigation.js';
  import { onMount, onDestroy } from 'svelte';
  import { initSocket, disconnectSocket } from '$lib/stores/socket.js';
  import {
    socketStore,
    isConnected,
    sessionCode,
    isConductor,
    players,
    sessionSettings,
    instructionalMessage
  } from '$lib/stores/socket.js';
  import Logotype from '$lib/components/Logotype.svelte';
  import PrimaryButton from '$lib/components/PrimaryButton.svelte';
  import SecondaryButton from '$lib/components/SecondaryButton.svelte';
  import { generateArcPreview, generateArcPath } from '$lib/utils/arc-preview.js';
  import { createRangeSlider, createSingleSlider, destroySlider } from '$lib/utils/controls.js';
  import { resetRandomArcCache } from '$lib/utils/arc-preview.js';
  import { get } from 'svelte/store';

  let socketInstance = null;
  let currentCode = '';
  let currentMessage = '';
  let currentPlayers = [];
  let codeCopied = false;
  let currentSettings = {
    durationMin: 8,
    interval: [30, 60],
    dynRangeIdx: [0, 7],
    contrast: 0.6,
    arc: 'traditional',
    numPlayers: null
  };
  
  // Dynamic labels mapping
  const DYNAMIC_LABELS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

  let arcPreviewPoints = [];
  let sessionCreated = false; // Flag to prevent creating multiple sessions
  
  // Simulation mode
  let simulationMode = false;
  let simulationRunning = false;
  let simulationResults = null;
  let showSimulationResults = false;
  let simulatedPlayerCount = 8; // Default number of players for simulation
  
  // Pre-roll countdown
  let showPreRollCountdown = false;
  let preRollCountdown = 5;
  let preRollInterval = null;
  
  // Slider instances
  let intervalSlider = null;
  let dynRangeSlider = null;
  let contrastSlider = null;
  let durationSlider = null;
  
  // Slider element refs
  let intervalSliderEl;
  let dynRangeSliderEl;
  let contrastSliderEl;
  let durationSliderEl;

  // Reactive: update arc preview when settings change
  // Explicitly track dynRangeIdx to ensure updates when slider changes
  $: {
    const dynRange = currentSettings?.dynRangeIdx;
    if (currentSettings && dynRange) {
      arcPreviewPoints = generateArcPreview({
        ...currentSettings,
        numPlayers: currentPlayers.length || 8
      });
    }
  }

  onMount(() => {
    socketInstance = initSocket();
    
    if (!socketInstance) {
      goto('/');
      return;
    }

    // Get initial value from store if it exists
    const initialCode = get(sessionCode);
    if (initialCode) {
      currentCode = initialCode;
      sessionCreated = true;
    }
    
    // Get initial message from store if it exists
    const initialMessage = get(instructionalMessage);
    if (initialMessage) {
      currentMessage = initialMessage;
    }
    
    // Subscribe to stores
    const unsubscribeCode = sessionCode.subscribe(code => {
      if (code) {
        currentCode = code;
        // If we get a code, we already have a session - don't create another
        sessionCreated = true;
      } else {
        // If code is cleared, reset currentCode
        currentCode = '';
      }
    });

    const unsubscribeMessage = instructionalMessage.subscribe(msg => {
      currentMessage = msg || '';
    });

    const unsubscribePlayers = players.subscribe(p => {
      if (p && Array.isArray(p)) {
        currentPlayers = p;
      } else {
        currentPlayers = [];
      }
      // Update numPlayers automatically
      currentSettings.numPlayers = currentPlayers.length || null;
    });

    const unsubscribeSettings = sessionSettings.subscribe(settings => {
      if (settings) {
        currentSettings = { ...settings };
      }
    });

    // Check if we already have a session code (from nickname screen)
    // Get current value from store synchronously
    let hasExistingSession = false;
    const codeCheck = sessionCode.subscribe(code => {
      if (code) {
        hasExistingSession = true;
        currentCode = code;
        sessionCreated = true; // Mark as created so we don't create another
      }
    });
    codeCheck(); // Unsubscribe immediately after getting value
    
    // Only create session if we don't already have one and haven't created one
    if (!hasExistingSession && !sessionCreated) {
      sessionCreated = true; // Set flag before emitting
      // Create session on mount
      const defaultMessage = `When the performance begins, you will receive visual cues indicating when to play and at what dynamic level. 

Listen carefully to your fellow musicians and respond according to the dynamics shown on your screen. Rests are as important as playing - use them to listen and prepare.

The piece will end automatically after ${currentSettings.durationMin} minutes.`;
      
      socketInstance.emit('create-session', {
        settings: currentSettings,
        instructionalMessage: defaultMessage
      });
    }
    // If we already have a session, the stores will have the data and we'll just display it

    // Listen for session-created
    socketInstance.on('session-created', ({ code, conductorId, players: initialPlayers, instructionalMessage: msg }) => {
      sessionCode.set(code);
      isConductor.set(conductorId === socketInstance.id);
      // Note: Server handles room joining automatically
      
      // Set initial message from server (includes default message if none was provided)
      // This must happen BEFORE navigation so the store has the value
      if (msg) {
        instructionalMessage.set(msg);
      }
      
      // Set initial players (conductor should be included)
      if (initialPlayers && initialPlayers.length > 0) {
        players.set(initialPlayers);
        // Navigate to nickname screen first
        goto(`/nickname?role=conductor`);
        return;
      }
    });

    // Listen for player updates
    socketInstance.on('player-joined', ({ players: updatedPlayers }) => {
      players.set(updatedPlayers);
    });

    socketInstance.on('player-left', ({ players: updatedPlayers }) => {
      players.set(updatedPlayers);
    });

    // Listen for settings updates (from other devices)
    socketInstance.on('settings-updated', ({ settings }) => {
      sessionSettings.set(settings);
    });

    // Listen for message updates
    socketInstance.on('message-updated', ({ message }) => {
      instructionalMessage.set(message);
    });

    // Listen for conductor promotion
    socketInstance.on('conductor-promoted', ({ newConductorId }) => {
      isConductor.set(socketInstance.id === newConductorId);
    });

    // Listen for performance-starting to navigate to performance view
    socketInstance.on('performance-starting', () => {
      if (!simulationMode) {
        showPreRollCountdown = true;
        preRollCountdown = 5;
        
        preRollInterval = setInterval(() => {
          preRollCountdown--;
          if (preRollCountdown <= 0) {
            if (preRollInterval) {
              clearInterval(preRollInterval);
              preRollInterval = null;
            }
            goto('/performance');
          }
        }, 1000);
      }
    });

    // Listen for simulation results
    socketInstance.on('simulation-complete', ({ success, report, error }) => {
      simulationRunning = false;
      if (success && report) {
        simulationResults = report;
        showSimulationResults = true;
      } else {
        alert(`Simulation failed: ${error || 'Unknown error'}`);
      }
    });

    // Initialize noUiSlider sliders after a short delay to ensure DOM is ready
    let unsubscribePlayersForContrast;
    setTimeout(() => {
      // Interval Range: 10-360 seconds (alpha range)
      if (intervalSliderEl) {
        intervalSlider = createRangeSlider(
          intervalSliderEl,
          currentSettings.interval,
          { min: 10, max: 360, step: 1, tooltips: false },
          (values) => {
            currentSettings.interval = values;
            resetRandomArcCache();
            updateSettings();
            arcPreviewPoints = generateArcPreview({
              ...currentSettings,
              numPlayers: currentPlayers.length || 8
            });
          }
        );
      }

      // Dynamic Range: 0-7 with labels
      if (dynRangeSliderEl) {
        dynRangeSlider = createRangeSlider(
          dynRangeSliderEl,
          currentSettings.dynRangeIdx,
          { min: 0, max: 7, step: 1, tooltips: false },
          (values) => {
            handleDynRangeChange(values);
          }
        );
      }

      // Contrast: 0-1, step 0.01
      if (contrastSliderEl) {
        contrastSlider = createSingleSlider(
          contrastSliderEl,
          currentSettings.contrast,
          { 
            min: 0, 
            max: 1, 
            step: 0.01,
            tooltips: false,
            format: {
              to: (v) => +v.toFixed(2),
              from: (v) => Number(v)
            }
          },
          (value) => {
            handleContrastChange(value);
            resetRandomArcCache();
            arcPreviewPoints = generateArcPreview({
              ...currentSettings,
              numPlayers: currentPlayers.length || 8
            });
          }
        );
      }

      // Duration: 2-60 minutes (alpha range)
      if (durationSliderEl) {
        durationSlider = createSingleSlider(
          durationSliderEl,
          currentSettings.durationMin,
          { min: 2, max: 60, step: 1, tooltips: false },
          (value) => {
            handleDurationChange(value);
            resetRandomArcCache();
            arcPreviewPoints = generateArcPreview({
              ...currentSettings,
              numPlayers: currentPlayers.length || 8
            });
          }
        );
      }
      
      // Auto-adjust contrast based on numPlayers (alpha feature)
      const updateContrastForPlayers = () => {
        const numPlayers = currentPlayers.length || currentSettings.numPlayers || 4;
        let defaultContrast;
        if (numPlayers <= 2) defaultContrast = 0;
        else if (numPlayers <= 4) defaultContrast = 0.25;
        else if (numPlayers <= 6) defaultContrast = 0.4;
        else if (numPlayers <= 8) defaultContrast = 0.65;
        else defaultContrast = 0.8;
        
        if (contrastSlider && Math.abs(currentSettings.contrast - defaultContrast) > 0.01) {
          contrastSlider.set(defaultContrast);
          currentSettings.contrast = defaultContrast;
          updateSettings();
        }
      };
      
      // Update contrast when players change
      unsubscribePlayersForContrast = players.subscribe(p => {
        if (p && Array.isArray(p) && contrastSlider) {
          updateContrastForPlayers();
        }
      });
      
      // Initial contrast adjustment
      updateContrastForPlayers();
      
      // Setup tooltip click handlers (mobile-friendly)
      document.querySelectorAll('.info-icon').forEach((icon) => {
        icon.addEventListener('click', handleInfoIconClick);
      });
      
      // Close tooltips when clicking outside
      document.addEventListener('click', handleDocumentClick);
    }, 100);

    return () => {
      unsubscribeCode();
      unsubscribeMessage();
      unsubscribePlayers();
      unsubscribeSettings();
      if (unsubscribePlayersForContrast) unsubscribePlayersForContrast();
      
      // Destroy sliders
      if (intervalSlider) destroySlider(intervalSlider);
      if (dynRangeSlider) destroySlider(dynRangeSlider);
      if (contrastSlider) destroySlider(contrastSlider);
      if (durationSlider) destroySlider(durationSlider);
      
      if (preRollInterval) {
        clearInterval(preRollInterval);
        preRollInterval = null;
      }
      
      if (socketInstance) {
        socketInstance.off('session-created');
        socketInstance.off('player-joined');
        socketInstance.off('player-left');
        socketInstance.off('settings-updated');
        socketInstance.off('message-updated');
        socketInstance.off('conductor-promoted');
        socketInstance.off('performance-starting');
      }
      
      // Cleanup tooltip handlers
      document.querySelectorAll('.info-icon').forEach((icon) => {
        icon.removeEventListener('click', handleInfoIconClick);
      });
      document.removeEventListener('click', handleDocumentClick);
      
      // Cleanup tooltip handlers
      document.querySelectorAll('.info-icon').forEach((icon) => {
        icon.removeEventListener('click', handleInfoIconClick);
      });
      document.removeEventListener('click', handleDocumentClick);
    };
  });

  function handleDurationChange(value) {
    currentSettings.durationMin = typeof value === 'number' ? value : parseInt(value);
    updateSettings();
    
    // Update message with new duration
    const newMessage = currentMessage.replace(/\d+ minutes?/g, `${currentSettings.durationMin} minutes`);
    handleMessageChange(newMessage);
  }

  function handleIntervalChange(values) {
    if (Array.isArray(values)) {
      currentSettings.interval = [parseInt(values[0]), parseInt(values[1])];
    } else {
      currentSettings.interval = [parseInt(values), currentSettings.interval[1]];
    }
    updateSettings();
  }

  function handleDynRangeChange(values) {
    if (Array.isArray(values)) {
      currentSettings = {
        ...currentSettings,
        dynRangeIdx: [parseInt(values[0]), parseInt(values[1])]
      };
    } else {
      currentSettings = {
        ...currentSettings,
        dynRangeIdx: [parseInt(values), currentSettings.dynRangeIdx[1]]
      };
    }
    updateSettings();
  }
  
  // Get dynamic label for display
  function getDynamicLabel(idx) {
    return DYNAMIC_LABELS[idx] || '—';
  }

  function handleContrastChange(value) {
    currentSettings.contrast = typeof value === 'number' ? value : parseFloat(value);
    updateSettings();
  }

  function handleArcChange(value) {
    currentSettings.arc = value;
    updateSettings();
  }

  function handleMessageChange(newMessage) {
    currentMessage = newMessage;
    if (socketInstance && currentCode) {
      socketInstance.emit('update-message', {
        code: currentCode,
        message: newMessage
      });
    }
  }

  function updateSettings() {
    if (socketInstance && currentCode) {
      socketInstance.emit('update-settings', {
        code: currentCode,
        settings: currentSettings
      });
      sessionSettings.set({ ...currentSettings });
    }
  }
  
  // Tooltip toggle handler (mobile-friendly)
  function handleInfoIconClick(event) {
    event.stopPropagation();
    const icon = event.currentTarget;
    icon.classList.toggle('active');
  }
  
  // Close tooltips when clicking outside
  function handleDocumentClick() {
    document.querySelectorAll('.info-icon.active').forEach((icon) => {
      icon.classList.remove('active');
    });
  }

  function handleStartPerformance() {
    if (socketInstance && currentCode && currentPlayers.length >= 1) {
      if (simulationMode) {
        // Run simulation instead
        handleRunSimulation();
      } else {
        socketInstance.emit('start-performance', { code: currentCode });
        // Navigation will happen via performance-starting event
      }
    }
  }

  function handleRunSimulation() {
    if (socketInstance && currentCode && !simulationRunning) {
      simulationRunning = true;
      simulationResults = null;
      showSimulationResults = false;
      
      // Create simulation settings with specified player count
      const simSettings = {
        ...currentSettings,
        numPlayers: simulatedPlayerCount
      };
      
      socketInstance.emit('simulate-performance', {
        code: currentCode,
        settings: simSettings
      });
    }
  }

  function closeSimulationResults() {
    showSimulationResults = false;
  }

  function handleCancel() {
    if (socketInstance && currentCode) {
      socketInstance.emit('leave-session', { code: currentCode });
    }
    disconnectSocket();
    goto('/');
  }

  function copyCode() {
    if (currentCode) {
      navigator.clipboard.writeText(currentCode);
      codeCopied = true;
      setTimeout(() => {
        codeCopied = false;
      }, 2000);
    }
  }
</script>

<div class="min-h-screen py-8 px-4 bg-tiled-light">
  <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
    <!-- Logotype -->
    <div class="mb-8">
      <Logotype />
    </div>
    <!-- Session Code Display -->
    <div class="mb-8">
      <div class="flex items-start space-x-4">
        <div class="text-6xl font-bold tracking-widest text-brand-feature cursor-pointer hover:text-brand-feature-dark"
             on:click={copyCode}
             title="Click to copy">
          {currentCode || '----'}
        </div>
        <div class="flex flex-col pt-2">
          <p class="text-brand-gray text-sm">Share this code with your musicians</p>
          <button
            on:click={copyCode}
            class="text-sm underline self-start mt-2 transition-colors duration-200 {codeCopied ? 'text-green-600' : 'text-brand-feature hover:text-brand-feature-dark'}"
          >
            {codeCopied ? '✓ Copied' : 'Click to copy'}
          </button>
        </div>
      </div>
    </div>

    <!-- Two-column layout for controls -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
      <!-- Column 1 -->
      <div class="space-y-6">
        <!-- Instructional Message -->
        <div>
          <label for="message" class="block text-sm font-medium text-brand-gray mb-2">
            Message to players:
            <span class="info-icon" on:click={handleInfoIconClick}>
              ⓘ
              <span class="tooltip">This message will be presented to players who join this session. Any changes you make will appear in real time.</span>
            </span>
          </label>
          <textarea
            id="message"
            bind:value={currentMessage}
            on:input={(e) => handleMessageChange(e.target.value)}
            maxlength="500"
            rows="4"
            class="w-full px-4 py-3 border border-gray-300 focus:border-gray-500 focus:outline-none resize-none text-sm"
            placeholder="Enter instructions for performers..."
          ></textarea>
          <p class="text-xs text-brand-gray mt-1" style="opacity: 0.7;">{currentMessage.length}/500 characters</p>
        </div>

        <!-- Performance Duration -->
        <div>
          <label class="block text-sm font-medium text-brand-gray mb-2">
            Performance duration (minutes):
            <span class="info-icon" on:click={handleInfoIconClick}>
              ⓘ
              <span class="tooltip">Sets the total length of the piece.</span>
            </span>
          </label>
          <div bind:this={durationSliderEl} class="mb-2"></div>
          <div class="flex justify-between text-xs text-brand-gray" style="opacity: 0.7;">
            <span>{currentSettings.durationMin} min</span>
          </div>
        </div>

        <!-- Prompt Interval Range -->
        <div>
          <label class="block text-sm font-medium text-brand-gray mb-2">
            Prompt interval range (seconds):
            <span class="info-icon" on:click={handleInfoIconClick}>
              ⓘ
              <span class="tooltip">Defines how often players receive new prompts.</span>
            </span>
          </label>
          <div bind:this={intervalSliderEl} class="mb-2"></div>
          <div class="flex justify-between text-xs text-brand-gray" style="opacity: 0.7;">
            <span>Range: {currentSettings.interval[0]}s to {currentSettings.interval[1]}s</span>
          </div>
        </div>

        <!-- List of Players -->
        <div>
          <label class="block text-sm font-medium text-brand-gray mb-2">
            Players ({$players?.length || 0})
          </label>
          {#if $players && $players.length > 0}
            <div class="grid grid-cols-2 gap-2">
              {#each $players as player, index}
                <span class="text-brand-gray text-sm font-light">
                  {player.nickname || `Player ${index + 1}`}
                </span>
              {/each}
            </div>
          {:else}
            <p class="text-brand-gray" style="opacity: 0.7;">Waiting for players to join...</p>
          {/if}
        </div>
      </div>

      <!-- Column 2 -->
      <div class="space-y-6">
        <!-- Compositional Arc (controls the Arc Preview) -->
        <div>
          <div class="flex items-center gap-2">
            <label class="text-sm font-medium text-brand-gray">
              Compositional Arc:
              <span class="info-icon" on:click={handleInfoIconClick}>
                ⓘ
                <span class="tooltip">
                  Outlines the overall dynamic contour of the piece.
                </span>
              </span>
            </label>
            <select
              value={currentSettings.arc}
              on:change={(e) => handleArcChange(e.target.value)}
              class="p-1 border border-gray-300 focus:border-gray-500 focus:outline-none text-sm"
            >
              <option value="traditional">Traditional</option>
              <option value="arch">Arch</option>
              <option value="swell">Ramp Up</option>
              <option value="wave">Wave</option>
              <option value="plateau">Plateau</option>
              <option value="random">Random</option>
            </select>
          </div>
        </div>

        <!-- Arc Preview -->
        {#if arcPreviewPoints.length > 0}
          <div class="w-full h-24 relative -mt-4">
            <svg viewBox="0 0 100 100" class="w-full h-full" preserveAspectRatio="none">
              <!-- Grid lines -->
              <line x1="0" y1="0" x2="0" y2="100" stroke="#e5e7eb" stroke-width="0.5" />
              <line x1="0" y1="50" x2="100" y2="50" stroke="#e5e7eb" stroke-width="0.5" />
              <line x1="0" y1="100" x2="100" y2="100" stroke="#e5e7eb" stroke-width="0.5" />
              <!-- Arc line -->
              <path
                d={generateArcPath(arcPreviewPoints)}
                fill="none"
                stroke="#474747"
                stroke-width="1"
                vector-effect="non-scaling-stroke"
                shape-rendering="geometricPrecision"
                class="transition-all duration-300"
              />
            </svg>
          </div>
        {/if}

        <!-- Dynamic Range -->
        <div>
          <label class="block text-sm font-medium text-brand-gray mb-2">
            Dynamic Range (ppp–fff):
            <span class="info-icon" on:click={handleInfoIconClick}>
              ⓘ
              <span class="tooltip">
                Determines the range of dynamic notation that will be presented to the players.
              </span>
            </span>
          </label>
          <div bind:this={dynRangeSliderEl} class="mb-2"></div>
          <div class="flex justify-between text-xs text-brand-gray" style="opacity: 0.7;">
            <span>{getDynamicLabel(currentSettings.dynRangeIdx[0])} - {getDynamicLabel(currentSettings.dynRangeIdx[1])}</span>
          </div>
        </div>

        <!-- Micro-Dynamics -->
        <div>
          <label class="block text-sm font-medium text-brand-gray mb-2">
            Micro-Dynamics:
            <span class="info-icon" on:click={handleInfoIconClick}>
              ⓘ
              <span class="tooltip">
                Influences the variation between prompts and the number of active players at any given time. Default settings are lower for small groups, higher for large groups.
              </span>
            </span>
          </label>
          <div bind:this={contrastSliderEl} class="mb-2"></div>
          <div class="flex justify-between text-xs text-brand-gray" style="opacity: 0.7;">
            <span>{currentSettings.contrast.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Simulation Mode Checkbox -->
    <div class="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
      <label class="flex items-center space-x-3 cursor-pointer mb-3">
        <input
          type="checkbox"
          bind:checked={simulationMode}
          class="w-5 h-5 text-brand-feature rounded focus:ring-brand-feature"
        />
        <div>
          <div class="text-sm font-semibold text-brand-gray">Simulation Mode</div>
          <div class="text-xs text-brand-gray">
            Run a fast simulation to test performance parameters without real players
          </div>
        </div>
      </label>
      
      {#if simulationMode}
        <div class="mt-3 pl-8">
          <label for="simulated-players" class="block text-sm font-medium text-brand-gray mb-2">
            Number of Simulated Players:
          </label>
          <input
            id="simulated-players"
            type="number"
            min="1"
            max="12"
            bind:value={simulatedPlayerCount}
            disabled={simulationRunning}
            class="w-24 px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-brand-feature focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
          <p class="text-xs text-brand-gray mt-1" style="opacity: 0.7;">Set how many players to simulate (1-12)</p>
        </div>
      {/if}
    </div>

    <!-- Pre-roll Countdown Message -->
    {#if showPreRollCountdown}
      <div class="text-center mb-6">
        <div class="inline-flex items-center space-x-2 text-brand-gray">
          <span class="font-medium">Performance begins in {preRollCountdown}...</span>
        </div>
      </div>
    {/if}

    <!-- Action Buttons -->
    <div class="flex space-x-4">
      <SecondaryButton
        variant="gray"
        on:click={handleCancel}
        className="flex-1"
      >
        Cancel Session
      </SecondaryButton>
      <PrimaryButton
        on:click={handleStartPerformance}
        disabled={currentPlayers.length < 1 || simulationRunning}
        className="flex-1"
      >
        {#if simulationRunning}
          Running Simulation...
        {:else if simulationMode}
          Run Simulation
        {:else}
          Start Performance
        {/if}
      </PrimaryButton>
    </div>
  </div>
</div>

<!-- Simulation Results Modal -->
{#if showSimulationResults && simulationResults}
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div class="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b">
        <h2 class="text-2xl font-bold text-brand-gray">Simulation Results</h2>
        <button
          on:click={closeSimulationResults}
          class="text-brand-gray text-2xl font-bold" style="opacity: 0.6;"
        >
          ×
        </button>
      </div>

      <!-- Content -->
      <div class="overflow-y-auto p-6 flex-1">
        <!-- Summary -->
        <div class="mb-6">
            <h3 class="text-lg font-semibold text-brand-gray mb-3">Summary</h3>
          <div class="grid grid-cols-3 gap-4">
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-brand-gray">Total Prompts</div>
              <div class="text-2xl font-bold text-brand-gray">{simulationResults.summary.totalPrompts}</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-brand-gray">Duration</div>
              <div class="text-2xl font-bold text-brand-gray">{simulationResults.summary.duration} min</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-brand-gray">Players</div>
              <div class="text-2xl font-bold text-brand-gray">{simulationResults.summary.players}</div>
            </div>
          </div>
        </div>

        <!-- Fairness Metrics -->
        {#if simulationResults.fairness}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-brand-gray mb-3">Fairness Metrics</h3>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div class="text-sm text-brand-gray">Min Plays</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.fairness.minPlays != null ? simulationResults.fairness.minPlays : '—'}
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Max Plays</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.fairness.maxPlays != null ? simulationResults.fairness.maxPlays : '—'}
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Std Dev</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.fairness.stdDev != null ? simulationResults.fairness.stdDev.toFixed(2) : '—'}
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Variance</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.fairness.variance != null ? simulationResults.fairness.variance.toFixed(2) : '—'}
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Coefficient</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.fairness.coefficient != null ? simulationResults.fairness.coefficient.toFixed(3) : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Interval Statistics -->
        {#if simulationResults.intervalStats && simulationResults.intervalStats.mean != null}
          <div class="mb-6">
            <h3 class="text-lg font-semibold text-brand-gray mb-3">Interval Statistics</h3>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="grid grid-cols-3 gap-4">
                <div>
                  <div class="text-sm text-brand-gray">Mean Interval</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.intervalStats.mean != null ? simulationResults.intervalStats.mean.toFixed(1) : '—'}s
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Min Interval</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.intervalStats.min != null ? simulationResults.intervalStats.min.toFixed(1) : '—'}s
                  </div>
                </div>
                <div>
                  <div class="text-sm text-brand-gray">Max Interval</div>
                  <div class="text-xl font-bold text-brand-gray">
                    {simulationResults.intervalStats.max != null ? simulationResults.intervalStats.max.toFixed(1) : '—'}s
                  </div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Dynamic Distribution -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold text-brand-gray mb-3">Dynamic Distribution</h3>
          <div class="bg-gray-50 p-4 rounded-lg">
            <div class="flex flex-wrap gap-3">
              {#each Object.entries(simulationResults.dynamicDistribution).sort((a, b) => b[1] - a[1]) as [dyn, count]}
                <div class="bg-white px-4 py-2 rounded border">
                  <span class="font-semibold text-brand-gray">{dyn}:</span>
                  <span class="text-brand-gray ml-2">{count}</span>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Player Breakdown -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold text-brand-gray mb-3">Player Breakdown</h3>
          <div class="bg-gray-50 p-4 rounded-lg">
            <div class="space-y-2">
              {#each simulationResults.playerBreakdown as player}
                <div class="bg-white p-3 rounded border flex items-center justify-between">
                  <div class="flex items-center space-x-4">
                    <span class="font-semibold text-brand-gray">Player {player.playerIndex + 1}</span>
                    <span class="text-sm text-brand-gray">
                      {player.totalPlays} plays ({player.playPercentage != null ? player.playPercentage.toFixed(1) : '0.0'}%)
                    </span>
                  </div>
                  <div class="flex space-x-2">
                    {#each Object.entries(player.dynamics).sort((a, b) => b[1] - a[1]) as [dyn, count]}
                      <span class="text-xs bg-brand-feature-light text-brand-feature-dark px-2 py-1 rounded">
                        {dyn}: {count}
                      </span>
                    {/each}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="mb-6">
          <h3 class="text-lg font-semibold text-brand-gray mb-3">
            Timeline ({simulationResults.timeline.length} prompts)
          </h3>
          <div class="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b">
                  <th class="text-left py-2 text-brand-gray">Time</th>
                  <th class="text-left py-2 text-brand-gray">Interval</th>
                  <th class="text-left py-2 text-brand-gray">Playing</th>
                  <th class="text-left py-2 text-brand-gray">Dynamics</th>
                </tr>
              </thead>
              <tbody>
                {#each simulationResults.timeline as event}
                  <tr class="border-b">
                    <td class="py-2 text-brand-gray">{event.time}</td>
                    <td class="py-2 text-brand-gray">{event.interval}</td>
                    <td class="py-2 text-brand-gray">{event.playing}</td>
                    <td class="py-2 text-brand-gray">{event.dynamics || '—'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="border-t p-4 flex justify-end">
        <PrimaryButton on:click={closeSimulationResults}>
          Close
        </PrimaryButton>
      </div>
    </div>
  </div>
{/if}

