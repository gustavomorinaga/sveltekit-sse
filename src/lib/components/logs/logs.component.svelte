<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";
  import type { LogLevel } from "$lib/ts";

  const { logs, stream } = getEventsContext();

  const LEVEL_ICONS: Record<LogLevel, string> = {
    info: "i",
    debug: "⚙",
    warn: "⚠",
    error: "✕",
  };
</script>

<section class="flex flex-1 flex-col rounded bg-zinc-800">
  <header
    class="flex items-center justify-between p-4 border-b border-zinc-900 [&>div]:flex"
  >
    <div class="flex">
      <h3 class="text-lg font-bold">📜 Logs</h3>
    </div>
    {#if stream.topicCounters["logs"]}
      <div>
        <span
          class="bg-zinc-700 font-mono px-1.5 py-0.5 rounded tabular-nums text-white text-xs"
        >
          {stream.topicCounters["logs"]}
        </span>
      </div>
    {/if}
  </header>

  <div class="flex flex-1 flex-col overflow-hidden">
    <ul class="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {#if logs.length === 0}
        <li class="contents">
          <p class="text-zinc-600 italic text-center">No logs yet...</p>
        </li>
      {:else}
        {#each logs as entry (entry.id)}
          <li class="contents">
            <div
              class={`
                flex items-start gap-2 px-2 py-1.5 rounded border
                data-[level=info]:text-sky-300 data-[level=info]:bg-sky-900/30 data-[level=info]:border-sky-800
                data-[level=debug]:text-violet-300 data-[level=debug]:bg-violet-900/30 data-[level=debug]:border-violet-800
                data-[level=warn]:text-amber-300 data-[level=warn]:bg-amber-900/30 data-[level=warn]:border-amber-800
                data-[level=error]:text-red-300 data-[level=error]:bg-red-900/30 data-[level=error]:border-red-800
              `}
              data-level={entry.level}
            >
              <span class="font-bold shrink-0 text-center w-5">
                {LEVEL_ICONS[entry.level]}
              </span>
              <span class="text-zinc-400 shrink-0">[{entry.source}]</span>
              <span class="flex-1 break-all">{entry.message}</span>
              <span class="shrink-0 tabular-nums text-zinc-400">
                {entry.timestamp}
              </span>
            </div>
          </li>
        {/each}
      {/if}
    </ul>
  </div>
</section>
