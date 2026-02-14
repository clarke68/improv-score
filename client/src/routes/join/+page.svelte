<script>
  import { goto } from '$lib/utils/navigation.js';
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import Logotype from '$lib/components/Logotype.svelte';
import { sessionCode, isConductor, players, sessionSettings, instructionalMessage, pendingPerformanceState } from '$lib/stores/socket.js';
import { initSocket } from '$lib/stores/socket.js';

  let codeInput = '';
  let error = '';
  let isLoading = false;

  let socketInstance = null;

  onMount(() => {
    socketInstance = initSocket();
    
    if (!socketInstance) {
      error = 'Failed to connect to server';
      return;
    }

    // Listen for session-joined event
    socketInstance.on('session-joined', (data) => {
      console.log('Session joined:', data);
      sessionCode.set(data.code);
      isConductor.set(data.isConductor);
      players.set(data.players);
      sessionSettings.set(data.settings);
      instructionalMessage.set(data.instructionalMessage);
      isLoading = false;
      
      // If joining during performance, store performance state and go directly to performance page
      // Otherwise go to nickname screen first
      if (data.performanceState && data.performanceState.inProgress) {
        pendingPerformanceState.set(data.performanceState);
        goto('/performance');
      } else {
        pendingPerformanceState.set(null);
        goto(`/nickname?role=performer`);
      }
    });

    // Listen for errors
    socketInstance.on('session-not-found', ({ code }) => {
      error = `Session "${code}" not found. Please check the code and try again.`;
      isLoading = false;
    });

    socketInstance.on('session-full', ({ code }) => {
      error = `Session "${code}" is full. Maximum 12 players allowed.`;
      isLoading = false;
    });

    socketInstance.on('error', ({ message }) => {
      error = message || 'An error occurred';
      isLoading = false;
    });

    return () => {
      // Cleanup
      if (socketInstance) {
        socketInstance.off('session-joined');
        socketInstance.off('session-not-found');
        socketInstance.off('session-full');
        socketInstance.off('error');
      }
    };
  });

  function handleCodeInput(e) {
    // Auto-uppercase and only allow letters
    const value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    codeInput = value;
    error = '';
  }

  function handleJoin() {
    if (codeInput.length !== 4) {
      error = 'Please enter a 4-letter code';
      return;
    }

    if (!socketInstance || !socketInstance.connected) {
      error = 'Not connected to server. Please refresh the page.';
      return;
    }

    error = '';
    isLoading = true;

    socketInstance.emit('join-session', {
      code: codeInput,
      nickname: null // Will be set on nickname screen
    });
  }
</script>

<div class="min-h-screen flex items-center justify-center px-4" style="background-image: url('{base}/assets/bgLight.png'); background-repeat: repeat;">
  <div class="max-w-md w-full p-8">
    <div class="mb-8">
      <Logotype />
    </div>

    {#if error}
      <div class="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p class="text-red-800 text-sm">{error}</p>
      </div>
    {/if}

    <form on:submit|preventDefault={handleJoin} class="space-y-6">
      <div>
        <label for="code" class="block text-sm font-medium text-brand-gray mb-2">
          Enter the 4-letter session code:
        </label>
        <input
          id="code"
          type="text"
          bind:value={codeInput}
          on:input={handleCodeInput}
          maxlength="4"
          placeholder="----"
          class="w-full text-center text-4xl font-bold tracking-widest uppercase p-4 border border-gray-300 focus:border-brand-feature focus:outline-none bg-white"
          disabled={isLoading}
        />
      </div>


      <div class="flex space-x-4">
        <button
          type="button"
          on:click={() => goto('/')}
          class="flex-1 bg-gray-200 hover:bg-gray-300 text-brand-gray font-normal p-4 transition-colors duration-200 text-base leading-4"
          disabled={isLoading}
        >
          Back
        </button>
        <button
          type="submit"
          class="flex-1 bg-brand-feature hover:bg-brand-feature-dark text-white font-normal p-4 transition-colors duration-200 text-base leading-4 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={isLoading || codeInput.length !== 4}
        >
          {isLoading ? 'Joining...' : 'Join'}
        </button>
      </div>
    </form>
  </div>
</div>

