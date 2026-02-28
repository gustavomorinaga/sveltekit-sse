<script lang="ts" module>
  import { slide } from "svelte/transition";
</script>

<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  let { chat } = getEventsContext();
</script>

<section class="flex flex-1 flex-col gap-4 p-4 rounded bg-zinc-800">
  <header class="flex justify-between">
    <div class="flex">
      <h3 class="text-lg font-bold">💬 Chat</h3>
    </div>
  </header>

  <div class="flex flex-1 overflow-hidden">
    <ul class="flex flex-1 flex-col-reverse gap-2 overflow-y-auto">
      {#each chat as message (message.id)}
        <li class="contents">
          <div
            class="flex flex-col gap-1 shrink-0 w-fit px-2 py-1.5 rounded bg-zinc-700 data-mine:self-end"
            data-mine={message.isMine}
            in:slide={{ axis: "y" }}
          >
            <span
              aria-hidden={message.isMine}
              class="text-sm font-bold aria-hidden:sr-only"
            >
              {message.user}
            </span>
            <p>{message.message}</p>
            <div class="flex justify-end">
              <span class="text-xs text-zinc-400">
                {message.timestamp.toLocaleString()}
              </span>
            </div>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</section>
