import { goto as svelteGoto } from '$app/navigation';
import { base } from '$app/paths';

/**
 * Navigation helper that automatically prepends the base path
 * Uses SvelteKit's goto() for client-side navigation to preserve state
 * @param {string} path - The path to navigate to (with or without leading slash)
 */
export function goto(path) {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Build the full path with base
  const fullPath = `${base}${normalizedPath}`;
  
  console.log('🔵 Navigation:', { originalPath: path, fullPath });
  
  // Use SvelteKit's goto() for client-side navigation (preserves state)
  // SvelteKit should respect the base path configured in svelte.config.js
  return svelteGoto(fullPath);
}

