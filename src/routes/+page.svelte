<script lang="ts">
  import { fade, slide } from "svelte/transition";

  import { SSEClient } from "$lib/hooks/sse.hook.svelte";

  interface Notification {
    id: string;
    message: string;
    type: "info" | "error";
    timestamp: string;
  }

  let notifications = $state<Notification[]>([]);

  const stream = new SSEClient<Notification>("/api/notifications", {
    eventName: "notification",
    onMessage: (newNotification) =>
      (notifications = [newNotification, ...notifications].slice(0, 10)),
  });

  function clearNotifications() {
    notifications = [];
    stream.data = null;
  }
</script>

<main class="flex w-full h-screen">
  <div class="container flex-1 mx-auto p-4">
    <section class="flex flex-col gap-4">
      <header class="flex justify-between">
        <div class="flex">
          <h3 class="text-lg font-bold">Notifications Stream</h3>
        </div>

        <div class="flex gap-2">
          <button
            class="cursor-pointer px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
            onclick={clearNotifications}
            type="button"
          >
            Clear All
          </button>

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

      <div class="p-4 bg-zinc-700 rounded shadow">
        {#if stream.status === "connecting"}
          <span class="text-amber-400">🟡 Connecting...</span>
        {/if}

        {#if stream.status === "connected"}
          <span class="text-green-400">
            🟢 Connected to the channel in real time.
          </span>
        {/if}

        {#if stream.status === "idle"}
          <span class="text-zinc-300">⚪ Idle. Click connect to start.</span>
        {/if}

        {#if stream.status === "error" && stream.error}
          <span class="text-red-400">⚠️ {stream.error.message}</span>
        {/if}
      </div>

      <ul class="flex flex-col gap-2">
        {#each notifications as notification (notification.id)}
          <li class="contents">
            <div
              class="p-4 bg-zinc-800 rounded shadow data-[type=info]:border-blue-400 data-[type=error]:border-red-400 border-l-4"
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
    </section>
  </div>
</main>
