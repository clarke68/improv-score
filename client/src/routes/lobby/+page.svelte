<script>
  import { goto } from '$lib/utils/navigation.js';
  import { onMount } from 'svelte';
  import Logotype from '$lib/components/Logotype.svelte';
  import { socketStore, isConnected, sessionCode, isConductor, players, instructionalMessage } from '$lib/stores/socket.js';
  import { initSocket, disconnectSocket } from '$lib/stores/socket.js';

  let socketInstance = null;
  let currentCode = '';
  let currentMessage = '';
  let currentPlayers = [];
  let isWaiting = true;
  let connectionStatus = false;
  let showPreRollCountdown = false;
  let preRollCountdown = 5;
  let preRollInterval = null;

  onMount(() => {
    socketInstance = initSocket();
    
    if (!socketInstance) {
      goto('/join');
      return;
    }

    // Subscribe to stores
    const unsubscribeCode = sessionCode.subscribe(code => {
      currentCode = code || '';
    });

    const unsubscribeMessage = instructionalMessage.subscribe(msg => {
      currentMessage = msg || '';
    });

    const unsubscribePlayers = players.subscribe(p => {
      currentPlayers = p || [];
    });

    const unsubscribeConnected = isConnected.subscribe(connected => {
      connectionStatus = connected;
    });

    // Listen for performance-starting event
    socketInstance.on('performance-starting', () => {
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
    });

    // Listen for player updates
    socketInstance.on('player-joined', ({ players: updatedPlayers }) => {
      players.set(updatedPlayers);
    });

    socketInstance.on('player-left', ({ players: updatedPlayers }) => {
      players.set(updatedPlayers);
    });

    // Listen for message updates
    socketInstance.on('message-updated', ({ message }) => {
      instructionalMessage.set(message);
    });

    // Listen for conductor promotion
    socketInstance.on('conductor-promoted', ({ newConductorId }) => {
      isConductor.set(socketInstance.id === newConductorId);
    });

    return () => {
      unsubscribeCode();
      unsubscribeMessage();
      unsubscribePlayers();
      unsubscribeConnected();
      
      if (preRollInterval) {
        clearInterval(preRollInterval);
        preRollInterval = null;
      }
      
      if (socketInstance) {
        socketInstance.off('performance-starting');
        socketInstance.off('player-joined');
        socketInstance.off('player-left');
        socketInstance.off('message-updated');
        socketInstance.off('conductor-promoted');
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
</script>

<div class="min-h-screen flex items-center justify-center px-4 bg-tiled-light">
  <div class="max-w-2xl w-full p-8">
    <!-- Logotype -->
    <div class="mb-8">
      <Logotype />
    </div>
    <!-- Session Code Display -->
    <div class="text-center mb-8">
      <label class="block text-sm font-medium text-brand-gray">Session code:</label>
      <div class="text-4xl text-brand-feature mb-2">{currentCode || '----'}</div>
      <div class="flex items-center justify-center space-x-2 text-sm">
        {#if connectionStatus}
          <span class="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
          <span class="text-green-600">Connected</span>
        {:else}
          <span class="inline-block w-2 h-2 bg-red-500 rounded-full"></span>
          <span class="text-red-600">Disconnected</span>
        {/if}
      </div>
    </div>

    <!-- Instructional Message -->
    {#if currentMessage}
      <div class="mb-12">
        <p class="text-brand-gray whitespace-pre-wrap leading-relaxed">{currentMessage}</p>
      </div>
    {/if}

    <!-- Player Roster -->
    <div class="mb-8">
      <label class="block text-sm font-medium text-brand-gray mb-2">
        Players ({$players?.length || 0})
      </label>
      {#if $players && $players.length > 0}
        <div class="grid grid-cols-2 gap-2">
          {#each $players as player, index}
            <span class="text-brand-gray text-sm font-light">
              {player.nickname || `Player ${index + 1}`}{#if player.id === socketInstance?.id}&nbsp;<span class="text-brand-feature">(You)</span>{/if}
            </span>
          {/each}
        </div>
      {:else}
        <p class="text-brand-gray" style="opacity: 0.7;">No players yet</p>
      {/if}
    </div>

    <!-- Waiting Message / Pre-roll Countdown -->
    <div class="text-center mb-8">
      {#if showPreRollCountdown}
        <div class="inline-flex items-center space-x-2 text-brand-gray">
          <span class="font-medium">Performance begins in {preRollCountdown}...</span>
        </div>
      {:else}
        <div class="inline-flex items-center space-x-2 text-brand-gray">
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span class="font-medium">Waiting for performance to begin...</span>
        </div>
      {/if}
    </div>

    <!-- Leave Button -->
    <div class="flex justify-center">
      <button
        on:click={handleLeave}
        class="px-3 py-2 text-xs opacity-50 hover:opacity-100 transition-opacity duration-200 border rounded"
      >
        Leave
      </button>
    </div>
  </div>
</div>

