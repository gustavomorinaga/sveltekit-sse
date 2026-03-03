<script lang="ts" module>
  const STREAM_TOPICS = ["notifications", "logs"] as const;
  type StreamTopic = (typeof STREAM_TOPICS)[number];

  const TOPIC_LABELS: Record<StreamTopic, string> = {
    notifications: "Notifications",
    logs: "Logs",
  };
</script>

<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const { stream, activeTopics, toggleTopic } = getEventsContext();
</script>

<header class="flex flex-col gap-3 p-4 bg-zinc-800 rounded shadow">
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      {#if stream.status === "connecting"}
        <span class="text-amber-400">🟡 Connecting...</span>
      {:else if stream.status === "connected"}
        <span class="text-green-400">🟢 Connected</span>
      {:else if stream.status === "idle"}
        <span class="text-zinc-300">⚪ Idle</span>
      {:else if stream.status === "error" && stream.error}
        <span class="text-red-400">⚠️ {stream.error.message}</span>
      {/if}

      {#if stream.lastEventID !== null}
        <span
          class="text-xs font-mono px-2 py-0.5 rounded bg-zinc-700 text-zinc-400"
          title="Last global sequence ID received from server"
        >
          seq
          <span class="tabular-nums text-zinc-200">{stream.lastEventID}</span>
        </span>
      {/if}
    </div>

    <div class="flex gap-2">
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
  </div>

  <div class="flex items-center justify-between gap-2 flex-wrap">
    <div class="flex items-center gap-2">
      <span class="text-xs text-zinc-400 uppercase tracking-wider">
        Topics:
      </span>

      {#each STREAM_TOPICS as topic}
        {@const active = activeTopics.has(topic)}
        {@const count = stream.topicCounters[topic] ?? 0}

        <button
          class="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer bg-zinc-700 text-zinc-300 hover:bg-zinc-600 data-[active=true]:bg-indigo-600 data-[active=true]:text-white data-[active=true]:hover:bg-indigo-700"
          data-active={active}
          onclick={() => toggleTopic(topic)}
          title="{active ? 'Unsubscribe from' : 'Subscribe to'} {TOPIC_LABELS[topic]}"
          type="button"
        >
          {TOPIC_LABELS[topic]}
          <span class="px-1 rounded tabular-nums text-[10px] bg-black/20">
            {count}
          </span>
        </button>
      {/each}
    </div>

    <span class="text-xs text-zinc-400 italic">(Chat always active)</span>
  </div>
</header>
