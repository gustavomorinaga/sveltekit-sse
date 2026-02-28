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

    <div class="flex flex-1 gap-4 max-h-[62svh] [&>div]:flex [&>div]:flex-1">
      <div>
        <Chat />
      </div>

      <div>
        <Notifications />
      </div>
    </div>
  </div>
</main>
