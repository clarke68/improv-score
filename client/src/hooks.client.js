// Client-side error hook.
// SvelteKit calls this when navigating to (or rendering) a page throws.
// Without it, the user only sees a bare "500 / Internal Error" page.

// Messages browsers use when a page's code chunk fails to download
// (Chrome/Edge, Safari, Firefox respectively), plus generic fetch failures.
const NETWORK_ERROR_PATTERN =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|Load failed|NetworkError/i;

/** @type {import('@sveltejs/kit').HandleClientError} */
export function handleError({ error, status, message }) {
  const detail = error instanceof Error ? error.message : String(error ?? message);
  const isNetwork = NETWORK_ERROR_PATTERN.test(detail);

  console.error('Page error:', error);

  return {
    message: isNetwork
      ? "Couldn't load the next screen. Your connection may have dropped for a moment."
      : 'Something went wrong while loading this screen.',
    kind: isNetwork ? 'network' : 'unexpected',
    detail: `${status} – ${detail}`
  };
}
