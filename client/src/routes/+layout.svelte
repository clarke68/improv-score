<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { initSocket } from '$lib/stores/socket.js';

  onMount(() => {
    initSocket();
    
    return () => {
      // Cleanup on unmount if needed
    };
  });
</script>

<main class="min-h-screen bg-gray-50">
  <slot />
</main>







