// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
  namespace App {
    interface Error {
      message: string;
      kind?: 'network' | 'unexpected';
      detail?: string;
    }
    // interface Locals {}
    // interface PageData {}
    // interface Platform {}
  }
}

export {};







