<script lang="ts">
  import { Chat } from "$lib/components/chat";
  import { Logs } from "$lib/components/logs";
  import { Notifications } from "$lib/components/notifications";
  import { Toolbar } from "$lib/components/toolbar";
  import { setEventsContext } from "$lib/contexts/events.context.svelte";

  setEventsContext();
</script>

<main class="flex w-full min-h-svh">
  <div class="container flex flex-col gap-4 mx-auto p-4">
    <Toolbar />

    <div
      class="flex flex-1 flex-col gap-4 [&>div]:flex [&>div]:flex-1 [&>div]:max-h-[50svh] [&>div]:min-h-0 lg:flex-row lg:max-h-[calc(100svh-104px-3rem)] lg:[&>div]:max-h-none"
    >
      <div>
        <Chat />
      </div>

      <div>
        <div
          class="flex flex-1 flex-col gap-4 [&>div]:flex [&>div]:flex-1 [&>div]:shrink-0 [&>div]:min-h-0"
        >
          <div>
            <Notifications />
          </div>

          <div>
            <Logs />
          </div>
        </div>
      </div>
    </div>
  </div>
</main>
