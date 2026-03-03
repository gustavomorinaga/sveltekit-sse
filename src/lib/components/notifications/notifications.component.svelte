<script lang="ts" module>
  import { fade, slide } from "svelte/transition";
</script>

<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const eventsContext = getEventsContext();

  function clearNotifications() {
    eventsContext.notifications.length = 0;
  }
</script>

<section class="flex flex-1 flex-col rounded bg-zinc-800">
  <header
    class="flex items-center justify-between p-4 border-b border-zinc-900 [&>div]:flex"
  >
    <div>
      <h3 class="text-lg font-bold">🔔 Notifications</h3>
    </div>

    <div>
      <button
        class="cursor-pointer px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        disabled={!eventsContext.notifications.length}
        onclick={clearNotifications}
        type="button"
      >
        Clear All
      </button>
    </div>
  </header>

  <div class="flex flex-1 overflow-hidden p-4">
    <ul class="flex flex-1 flex-col gap-2">
      {#each eventsContext.notifications as notification (notification.id)}
        <li class="contents">
          <div
            class="p-2 bg-zinc-700 rounded shadow data-[type=info]:border-blue-400 data-[type=error]:border-red-400 border-l-4"
            data-type={notification.type}
            in:slide={{ axis: "y" }}
            out:fade
          >
            <span>{notification.timestamp.toLocaleString()} - </span>
            <span class="font-semibold">
              {notification.type.toUpperCase()}:
            </span>
            <span>{notification.message}</span>
          </div>
        </li>
      {/each}
    </ul>
  </div>
</section>
