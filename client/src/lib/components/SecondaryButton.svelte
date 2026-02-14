<script>
  /** @type {'outlined' | 'gray'} */
  export let variant = 'gray';
  /** @type {'button' | 'submit'} */
  export let type = 'button';
  /** @type {boolean} */
  export let disabled = false;
  /** @type {string} */
  export let className = '';

  const outlinedClass =
    'bg-white hover:bg-gray-50 text-brand-feature font-normal p-4 shadow-lg border border-brand-feature transition-colors duration-200 text-base leading-4';
  const grayClass =
    'bg-gray-200 hover:bg-gray-300 text-brand-gray font-normal p-4 transition-colors duration-200 text-base leading-4';
  $: baseClass = variant === 'outlined' ? outlinedClass : grayClass;
  $: buttonClass = className ? `${baseClass} ${className}` : baseClass;
</script>

<button
  {type}
  {disabled}
  class={buttonClass}
  on:click
>
  <slot />
</button>
