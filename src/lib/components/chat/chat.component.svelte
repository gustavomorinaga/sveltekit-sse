<script lang="ts" module>
  import { slide } from "svelte/transition";
</script>

<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const { chat, ended, expectedPrompt, resetChat, sendPrompt } = $derived(
    getEventsContext()
  );

  const isWaitingForUser = $derived(expectedPrompt !== null);
  const inputValue = $derived.by(() => {
    if (ended) {
      return "The story has ended. Please reset the chat to start a new one.";
    }
    return expectedPrompt || "Waiting for the story to unfold...";
  });
</script>

<section class="flex flex-1 flex-col rounded bg-zinc-800">
  <header
    class="flex items-center justify-between border-b border-zinc-900 p-4"
  >
    <div class="flex">
      <h3 class="text-lg font-bold">💬 Chat</h3>
    </div>
    <button
      class="cursor-pointer px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      disabled={!chat.length}
      onclick={resetChat}
      type="button"
    >
      Reset
    </button>
  </header>

  <div class="flex flex-1 flex-col overflow-hidden">
    <ul class="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
      {#each chat as message (message.id)}
        <li class="contents">
          <div
            class="flex flex-col gap-1 shrink-0 w-fit px-2 py-1.5 bg-zinc-700 rounded shadow data-mine:self-end"
            data-mine={message.isMe}
            in:slide={{ axis: "y" }}
          >
            <span
              aria-hidden={message.isMe}
              class="text-sm font-bold aria-hidden:sr-only"
            >
              {message.sender}
            </span>
            <p>{message.text}</p>
          </div>
        </li>
      {/each}
    </ul>
  </div>

  <footer class="flex gap-2 p-4 border-t border-zinc-900">
    <form class="contents" onsubmit={sendPrompt}>
      <fieldset
        aria-busy={isWaitingForUser}
        class="contents"
        disabled={!isWaitingForUser}
      >
        <legend class="sr-only">Chat Input</legend>
        <input
          class="flex-1 rounded bg-zinc-700 px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          id="chat-input"
          readonly
          value={inputValue}
        >
        <button
          class="cursor-pointer rounded bg-blue-600 px-4 py-1.5 text-white disabled:cursor-not-allowed disabled:opacity-60"
          type="submit"
        >
          Send
        </button>
      </fieldset>
    </form>
  </footer>
</section>
