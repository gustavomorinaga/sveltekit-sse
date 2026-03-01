<script lang="ts">
  import { Chat } from "$lib/components/chat";
  import { Notifications } from "$lib/components/notifications";
  import { Toolbar } from "$lib/components/toolbar";
  import { setEventsContext } from "$lib/contexts/events.context.svelte";

  setEventsContext();
</script>

<main class="flex w-full min-h-svh">
  <div class="container flex flex-col gap-4 mx-auto p-4">
    <Toolbar />

    <div class="flex flex-1 gap-4 [&>div]:flex [&>div]:flex-1">
      <div class="max-h-[62svh]">
        <Chat />
      </div>

      <div class="max-h-120">
        <Notifications />
      </div>
    </div>
  </div>
</main>
