<script>
  /** @type {'button' | 'submit'} */
  export let type = 'button';
  /** @type {boolean} */
  export let disabled = false;
  /** @type {string} */
  export let className = '';
  /** @type {boolean} */
  export let shadow = false;
  /** @type {HTMLButtonElement | undefined} - Optional bind for focusing the button programmatically */
  export let buttonRef = undefined;

  const baseClass =
    'bg-brand-feature hover:bg-brand-feature-dark text-white font-normal p-4 transition-colors duration-200 text-base leading-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-brand-feature';
  $: buttonClass = [baseClass, shadow ? 'shadow-lg' : '', className].filter(Boolean).join(' ');
</script>

<button
  {type}
  {disabled}
  class={buttonClass}
  on:click
  bind:this={buttonRef}
>
  <slot />
</button>
