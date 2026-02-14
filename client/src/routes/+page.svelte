<script>
  import { goto } from '$lib/utils/navigation.js';
  import Logotype from '$lib/components/Logotype.svelte';
  import PrimaryButton from '$lib/components/PrimaryButton.svelte';
  import SecondaryButton from '$lib/components/SecondaryButton.svelte';
</script>

<div class="min-h-screen flex items-center justify-center bg-tiled-light">
  <div class="max-w-md w-full mx-4">
    <div class="text-center mb-12">
      <Logotype size="large" />
      <p class="text-brand-gray text-base">Real-time synchronized musical performances</p>
    </div>

    <div class="space-y-4">
      <PrimaryButton
        on:click={() => goto('/conductor')}
        className="w-full"
        shadow
      >
        Start a Session
      </PrimaryButton>

      <SecondaryButton
        variant="outlined"
        on:click={() => goto('/join')}
        className="w-full"
      >
        Join a Session
      </SecondaryButton>
    </div>
  </div>
</div>

