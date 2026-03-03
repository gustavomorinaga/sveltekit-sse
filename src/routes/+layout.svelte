<script lang="ts">
  import { asset } from "$app/paths";
  import "$lib/styles/global.css";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={asset('/assets/favicon.svg')}>
  <title>SvelteKit SSE</title>
</svelte:head>

{@render children()}
