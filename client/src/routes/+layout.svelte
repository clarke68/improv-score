<script>
  import '../app.css';
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { initSocket } from '$lib/stores/socket.js';

  onMount(() => {
    initSocket();
    
    return () => {
      // Cleanup on unmount if needed
    };
  });
</script>

<main
  class="min-h-screen bg-gray-50"
  style="--bg-light: url('{base}/assets/bgLight.png'); --bg-dark: url('{base}/assets/bgDark.png');"
>
  <slot />
</main>







