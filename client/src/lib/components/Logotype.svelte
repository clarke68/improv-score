<script>
  /** @type {'large' | 'standard'} */
  export let size = 'standard';

  const h1Class = size === 'large' ? 'text-5xl mb-4' : 'text-[2.5rem] mb-8';
</script>

<h1 class={h1Class}>
  <span class="font-thin text-brand-feature">improv</span><span class="font-thin text-brand-gray-darkest">score</span>
</h1>
