<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { initSocket } from '$lib/stores/socket.js';
  import { sessionCode, players, isConductor } from '$lib/stores/socket.js';

  let socketInstance = null;
  let nickname = '';
  let playerNumber = 1;
  let isConductorRole = false;
  let currentCode = '';
  let currentPlayers = [];

  onMount(() => {
    socketInstance = initSocket();
    
    if (!socketInstance) {
      goto('/');
      return;
    }
    
    // Get role from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const role = urlParams.get('role'); // 'conductor' or 'performer'
    isConductorRole = role === 'conductor';
    
    // Subscribe to stores
    const unsubscribeCode = sessionCode.subscribe(code => {
      if (code) {
        currentCode = code;
      }
    });
    
    const unsubscribePlayers = players.subscribe(p => {
      currentPlayers = p || [];
      // Calculate player number based on join order
      if (socketInstance && currentPlayers.length > 0) {
        const playerIndex = currentPlayers.findIndex(pl => pl.id === socketInstance.id);
        if (playerIndex >= 0) {
          playerNumber = playerIndex + 1;
          // Set default nickname if not already set
          if (!nickname) {
            if (currentPlayers[playerIndex].nickname && currentPlayers[playerIndex].nickname.startsWith('Player ')) {
              // Keep existing default, but allow editing
              nickname = currentPlayers[playerIndex].nickname;
            } else if (currentPlayers[playerIndex].nickname) {
              // Use existing custom nickname
              nickname = currentPlayers[playerIndex].nickname;
            } else {
              // Set default
              nickname = `Player ${playerNumber}`;
            }
          }
        } else {
          // Player not found yet, estimate based on current count
          playerNumber = currentPlayers.length + 1;
          if (!nickname) {
            nickname = `Player ${playerNumber}`;
          }
        }
      } else {
        if (!nickname) {
          nickname = `Player ${playerNumber}`;
        }
      }
    });
    
    const unsubscribeIsConductor = isConductor.subscribe(cond => {
      isConductorRole = cond;
    });

    // Listen for player updates after nickname change
    if (socketInstance) {
      socketInstance.on('player-joined', ({ players: updatedPlayers }) => {
        players.set(updatedPlayers);
      });
    }

    return () => {
      unsubscribeCode();
      unsubscribePlayers();
      unsubscribeIsConductor();
      if (socketInstance) {
        socketInstance.off('player-joined');
      }
    };
  });

  function handleSubmit() {
    // Ensure nickname is never null or empty
    if (!nickname || nickname.trim() === '') {
      nickname = `Player ${playerNumber}`;
    }
    
    const trimmedNickname = nickname.trim() || `Player ${playerNumber}`;
    
    // Wait for code if we don't have it yet (shouldn't take long)
    const updateNickname = () => {
      if (socketInstance && currentCode) {
        socketInstance.emit('update-nickname', {
          code: currentCode,
          nickname: trimmedNickname
        });
      }
    };
    
    // Try to get code from store if we don't have it
    if (!currentCode) {
      const codeCheck = sessionCode.subscribe(code => {
        if (code) {
          currentCode = code;
          updateNickname();
        }
      });
      codeCheck();
    } else {
      updateNickname();
    }
    
    // Navigate immediately (don't wait for server response)
    if (isConductorRole) {
      goto('/conductor');
    } else {
      goto('/lobby');
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4" style="background-image: url('/assets/bgLight.png'); background-repeat: repeat;">
  <div class="max-w-md w-full p-8">
    <div class="mb-8">
      <h1 class="text-[2.5rem] mb-8">
        <span class="font-thin text-brand-feature">improv</span><span class="font-thin text-brand-gray-darkest">score</span>
      </h1>
    </div>

    <form on:submit|preventDefault={handleSubmit} class="space-y-6">
      <div>
        <label for="nickname" class="block text-sm font-medium text-brand-gray mb-2">
          Enter your name for the session (optional):
        </label>
        <input
          id="nickname"
          type="text"
          bind:value={nickname}
          placeholder={`Player ${playerNumber}`}
          maxlength="20"
          class="w-full p-4 border border-gray-300 focus:border-brand-feature focus:outline-none text-center text-base leading-4 bg-white"
          autofocus
        />
      </div>

      <button
        type="submit"
        class="w-full bg-brand-feature hover:bg-brand-feature-dark text-white font-normal p-4 transition-colors duration-200 text-base leading-4"
      >
        Continue
      </button>
    </form>
  </div>
</div>

