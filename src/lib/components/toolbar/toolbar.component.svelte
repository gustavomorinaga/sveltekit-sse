<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const { stream } = getEventsContext();
</script>

<header
  class="flex items-center justify-between p-4 bg-zinc-800 rounded shadow [&>div]:flex"
>
  <div>
    {#if stream.status === "connecting"}
      <span class="text-amber-400">🟡 Connecting...</span>
    {/if}

    {#if stream.status === "connected"}
      <span class="text-green-400">🟢 Connected</span>
    {/if}

    {#if stream.status === "idle"}
      <span class="text-zinc-300">⚪ Idle. Click connect to start.</span>
    {/if}

    {#if stream.status === "error" && stream.error}
      <span class="text-red-400">⚠️ {stream.error.message}</span>
    {/if}
  </div>

  <div>
    {#if stream.status === "connected"}
      <button
        class="cursor-pointer px-3 py-1.5 bg-zinc-500 text-white rounded hover:bg-gray-600 transition-colors"
        onclick={stream.close}
        type="button"
      >
        Disconnect
      </button>
    {:else}
      <button
        class="cursor-pointer px-3 py-1.5 bg-green-600 text-white rounded not-disabled:hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={stream.status === "connecting"}
        onclick={stream.connect}
        type="button"
      >
        {stream.status === "connecting" ? "Connecting..." : "Connect"}
      </button>
    {/if}
  </div>
</header>
