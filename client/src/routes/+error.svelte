<script>
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$lib/utils/navigation.js';
  import Logotype from '$lib/components/Logotype.svelte';
  import PrimaryButton from '$lib/components/PrimaryButton.svelte';
  import SecondaryButton from '$lib/components/SecondaryButton.svelte';
  import { sessionCode } from '$lib/stores/socket.js';

  // Path of the page that failed, relative to the base path (e.g. "/performance")
  $: failedPath = $page.url.pathname.startsWith(base)
    ? $page.url.pathname.slice(base.length) || '/'
    : $page.url.pathname;
  $: inSession = !!$sessionCode;
  $: isNotFound = $page.status === 404;

  // Client-side retry keeps the socket connection (and session membership) alive,
  // so a performer can get straight back into a running piece.
  function retry() {
    goto(`${failedPath}${$page.url.search}`);
  }
</script>

<div class="min-h-screen flex items-start justify-center px-4 pt-8 sm:pt-16 bg-tiled-light">
  <div class="max-w-2xl w-full p-8">
    <div class="mb-8">
      <Logotype />
    </div>

    <div class="text-center mb-8 text-brand-gray">
      {#if isNotFound}
        <p class="text-xl mb-4">This page doesn't exist.</p>
      {:else}
        <p class="text-xl mb-4">{$page.error?.message || 'Something went wrong.'}</p>
        {#if inSession}
          <p class="mb-4">
            You're still connected to session <span class="text-brand-feature">{$sessionCode}</span>.
            Tap <strong>Try again</strong> to rejoin where the piece is now.
          </p>
        {:else}
          <p class="mb-4">Your session connection was lost. Please join the session again.</p>
        {/if}
      {/if}
    </div>

    <div class="flex flex-col sm:flex-row gap-3 justify-center mb-8">
      {#if !isNotFound && inSession}
        <PrimaryButton on:click={retry}>Try again</PrimaryButton>
        <SecondaryButton on:click={() => goto('/lobby')}>Back to lobby</SecondaryButton>
      {:else}
        <PrimaryButton on:click={() => goto('/join')}>Join a session</PrimaryButton>
        <SecondaryButton on:click={() => goto('/')}>Home</SecondaryButton>
      {/if}
    </div>

    {#if $page.error?.detail}
      <p class="text-center text-xs text-brand-gray" style="opacity: 0.6;">
        Details (for troubleshooting): {$page.error.detail}
      </p>
    {/if}
  </div>
</div>
