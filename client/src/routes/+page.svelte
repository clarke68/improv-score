<script>
  import { goto } from '$lib/utils/navigation.js';
  import { base } from '$app/paths';
  import Logotype from '$lib/components/Logotype.svelte';
</script>

<div class="min-h-screen flex items-center justify-center" style="background-image: url('{base}/assets/bgLight.png'); background-repeat: repeat;">
  <div class="max-w-md w-full mx-4">
    <div class="text-center mb-12">
      <Logotype size="large" />
      <p class="text-brand-gray text-base">Real-time synchronized musical performances</p>
    </div>

    <div class="space-y-4">
      <button
        on:click={() => goto('/conductor')}
        class="w-full bg-brand-feature hover:bg-brand-feature-dark text-white font-normal p-4 shadow-lg transition-colors duration-200 text-base leading-4"
      >
        Start a Session
      </button>

      <button
        on:click={() => goto('/join')}
        class="w-full bg-white hover:bg-gray-50 text-brand-feature font-normal p-4 shadow-lg border border-brand-feature transition-colors duration-200 text-base leading-4"
      >
        Join a Session
      </button>
    </div>
  </div>
</div>

