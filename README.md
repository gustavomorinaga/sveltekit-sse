# SvelteKit SSE

Complete and type-safe **Server-Sent Events (SSE)** implementation for **Svelte 5** and **SvelteKit**, with automatic reconnection, reactive state, multiple topics support, and TypeScript.

## 📋 Table of Contents

- [🚀 Key Features](#-key-features)
- [⚡ Quickstart Guide](#-quickstart-guide)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture and Patterns](#️-architecture-and-patterns)
- [🔥 Advanced Features](#-advanced-features)
- [🏗️ Architecture Deep Dive](#️-architecture-deep-dive)
- [📖 What is Server-Sent Events (SSE)?](#-what-is-server-sent-events-sse)
  - [🎯 Perfect Use Cases](#-perfect-use-cases)
  - [⚔️ SSE vs WebSocket vs Long Polling](#️-sse-vs-websocket-vs-long-polling)
  - [✅ Advantages of SSE](#-advantages-of-sse)
  - [❌ When NOT to Use SSE](#-when-not-to-use-sse)
- [🔍 How It Works](#-how-it-works)
- [⚙️ Prerequisites](#️-prerequisites)
- [🚀 Installation and Setup](#-installation-and-setup)
- [🏃‍♂️ Running the Project](#️-running-the-project)
- [📝 Available Scripts](#-available-scripts)
- [📁 Project Structure](#-project-structure)
- [🔧 Client API (SSEClient)](#-client-api-sseclient)
- [🔧 Server API (produceSSE)](#-server-api-producesse)
- [📊 Demo: Interactive Chat + Notifications System](#-demo-interactive-chat--notifications-system)
- [🎯 Use Cases and Patterns](#-use-cases-and-patterns)
- [🔒 Security and Best Practices](#-security-and-best-practices)
- [🐛 Debugging and Troubleshooting](#-debugging-and-troubleshooting)
- [❓ Frequently Asked Questions (FAQ)](#-frequently-asked-questions-faq)
- [🚀 Deploy](#-deploy)
- [🤝 Contributing](#-contributing)
- [📚 Additional Resources](#-additional-resources)
- [🎓 Key Takeaways](#-key-takeaways)
- [📄 License](#-license)

## 🚀 Key Features

- ⚡ **Reactive SSE client** with Svelte 5 runes (`$state`, `$effect`)
- 🎯 **Multi-topic support** — Subscribe to multiple event types in a single connection
- 🔄 **Automatic reconnection** with message replay (no data loss on network issues)
- 🧠 **Smart topic-safety analysis** — Detects new topics and replays full history for them
- 🆔 **Global sequence IDs** — Monotonic message tracking for reliable state restoration
- 🔄 **Dynamic topic updates** — Add/remove topics without losing connection state
- 📊 **Per-topic message counters** — Reactive tracking of activity per topic
- 🔒 **Type-safe** with TypeScript generics for each topic
- 📡 **Automatic keep-alive** to maintain stable connections (15s interval)
- 🎨 **State management** (idle, connecting, connected, error) with reactive properties
- 🔌 **Simple and intuitive API** for both client and server
- 🛡️ **Robust error handling** with visual feedback
- 🧹 **Automatic cleanup** of resources and subscriptions
- 📦 **Zero external dependencies** (only Svelte and SvelteKit)
- 🐛 **Debug mode** for development and troubleshooting

## ⚡ Quickstart Guide

Get SSE working in your SvelteKit project in 3 simple steps:

### 1. Create the SSE Server Endpoint

Create a file at `src/routes/api/events/+server.ts`:

```typescript
import type { RequestHandler } from './$types';

// Define your event types
interface SSETopics {
  notification: { message: string; timestamp: number };
  counter: { count: number };
}

export const GET: RequestHandler = () => {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Keep-alive mechanism
      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15000);
      
      // Send a notification every 3 seconds
      let count = 0;
      const interval = setInterval(() => {
        const notification = {
          message: `Notification #${count}`,
          timestamp: Date.now()
        };
        
        const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
        controller.enqueue(encoder.encode(payload));
        
        count++;
      }, 3000);
      
      // Cleanup on disconnect
      return () => {
        clearInterval(keepAlive);
        clearInterval(interval);
      };
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
```

### 2. Create the SSE Client Hook

Create a file at `src/lib/hooks/sse.hook.svelte.ts`:

```typescript
interface SSEOptions<TTopics> {
  topics: { [K in keyof TTopics]?: (data: TTopics[K]) => void };
  autoConnect?: boolean;
  debug?: boolean;
}

export class SSEClient<TTopics extends Record<string, any>> {
  status = $state<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  error = $state<Error | null>(null);
  
  #eventSource: EventSource | null = null;
  #baseURL: string;
  #options: SSEOptions<TTopics>;
  
  constructor(baseURL: string, options: SSEOptions<TTopics>) {
    this.#baseURL = baseURL;
    this.#options = { autoConnect: true, ...options };
    
    if (this.#options.autoConnect) {
      $effect(() => {
        this.connect();
        return () => this.close();
      });
    }
  }
  
  connect = () => {
    if (this.#eventSource) return;
    
    this.status = 'connecting';
    this.#eventSource = new EventSource(this.#baseURL);
    
    this.#eventSource.onopen = () => {
      this.status = 'connected';
      this.error = null;
    };
    
    this.#eventSource.onerror = () => {
      this.status = 'error';
      this.error = new Error('Connection lost');
    };
    
    // Subscribe to topics
    for (const [topic, callback] of Object.entries(this.#options.topics)) {
      this.#eventSource.addEventListener(topic, (event: MessageEvent) => {
        const data = JSON.parse(event.data);
        callback?.(data);
      });
    }
  };
  
  close = () => {
    this.#eventSource?.close();
    this.#eventSource = null;
    this.status = 'idle';
  };
}
```

### 3. Use in Your Component

```svelte
<script lang="ts">
  import { SSEClient } from '$lib/hooks/sse.hook.svelte';
  
  interface SSETopics {
    notification: { message: string; timestamp: number };
  }
  
  let notifications = $state<{ message: string; timestamp: number }[]>([]);
  
  const stream = new SSEClient<SSETopics>('/api/events', {
    topics: {
      notification: (data) => {
        notifications.push(data);
        notifications = notifications.slice(-5); // Keep last 5
      }
    },
    debug: true
  });
</script>

<div>
  <h2>Connection: {stream.status}</h2>
  
  {#each notifications as notif}
    <div class="notification">
      {notif.message} - {new Date(notif.timestamp).toLocaleTimeString()}
    </div>
  {/each}
</div>
```

That's it! You now have a working SSE implementation. For production use with advanced features like message replay and dynamic topics, see the full implementation in this repository.

---

## 🛠️ Tech Stack

### 🎨 Frontend

- **[Svelte 5](https://svelte.dev/)** — reactive framework with runes
- **[SvelteKit 2](https://kit.svelte.dev/)** — full-stack framework for Svelte
- **[TypeScript](https://www.typescriptlang.org/)** — static typing
- **[Tailwind CSS 4](https://tailwindcss.com/)** — utility-first CSS framework
- **[Vite 7](https://vitejs.dev/)** — ultra-fast build tool and dev server

### 🔧 Development Tools

- **[Biome](https://biomejs.dev/)** — linting and formatting
- **[Ultracite](https://ultracite.dev/)** — unified CLI for linting
- **[pnpm](https://pnpm.io/)** — fast and efficient package manager

## 🏗️ Architecture and Patterns

This implementation follows modern web development patterns:

- **🎯 Type-safe:** TypeScript generics ensure compile-time safety for all event types
- **⚛️ Native reactivity:** Leverages Svelte 5 runes (`$state`, `$effect`, `$derived`) for automatic UI updates
- **🔌 SSE standard:** Complete implementation of the Server-Sent Events protocol (EventSource API)
- **🔄 Resilient:** Automatic reconnection with exponential backoff in case of failures
- **📊 State management:** Clear connection states (idle, connecting, connected, error)
- **🧩 Modular:** Clear separation between client hooks, server utilities, and context management
- **♻️ Lifecycle management:** Automatic resource cleanup prevents memory leaks
- **🎭 Topics-based:** Subscribe to multiple event types on a single connection
- **🔐 Secure by default:** Works with SvelteKit's built-in authentication and session management

## 🔥 Advanced Features

This implementation goes beyond basic SSE with several production-ready features:

### 1. Message Replay on Reconnection

When a client reconnects (due to network issues or manual reconnection), the server automatically replays any missed messages:

- **Global Sequence IDs**: Every message gets a monotonic ID that tracks its position in the event stream
- **Last-Event-ID tracking**: The client remembers the last received message ID
- **Smart replay**: On reconnect, only messages after the last ID are sent

```typescript
// Server automatically handles replay
// Client receives:
// id: 42
// event: message
// data: {"text": "Hello"}
//
// On reconnect with Last-Event-ID: 42
// Client receives messages 43, 44, 45...
```

### 2. Topic Safety Analysis

When clients dynamically add new topics to an existing connection, the server detects this and handles it intelligently:

- **Existing topics**: Replay only missed messages (delta sync)
- **New topics**: Replay complete history for that topic (full sync)

```typescript
// Initial connection: topics = ["chat"]
// User enables notifications: topics = ["chat", "notifications"]
// Server detects "notifications" is NEW
// → Replays ALL notification history
// → Replays only MISSED chat messages
```

This prevents data loss when users toggle features on/off.

### 3. Dynamic Topic Updates

Add or remove topics without losing your connection state:

```typescript
// Start with chat only
const stream = new SSEClient<Topics>("/api/events", {
  topics: {
    chat: (msg) => console.log(msg)
  }
});

// Later, add notifications dynamically
stream.updateTopics({
  addTopics: ["notifications"],
  // Server will replay any missed notifications automatically
});

// Remove a topic
stream.updateTopics({
  removeTopics: ["chat"]
});
```

### 4. Per-Topic Message Counters

Track activity on each topic in real-time:

```typescript
const stream = new SSEClient<Topics>("/api/events", {
  topics: {
    chat: (msg) => console.log(msg),
    notifications: (notif) => console.log(notif)
  }
});

// Access reactive counters
console.log(stream.topicCounters.chat); // 42
console.log(stream.topicCounters.notifications); // 7
```

Perfect for showing unread counts or activity indicators in the UI.

### 5. Session-Based History

Server maintains a ring buffer of recent messages per session:

```typescript
// Server-side session management
const session = {
  id: sessionID,
  history: [], // Ring buffer of recent messages
  emitter: null, // Current SSE emitter
};

// Automatically persists messages
function emitWithHistory({ event, data }) {
  const message = {
    id: globalSequenceID++,
    topic: event,
    data: data,
    timestamp: Date.now(),
  };
  
  session.history.push(message);
  emit({ event, data, id: message.id });
}
```

This enables:
- State restoration after page refresh
- Reliable message delivery even with flaky connections
- No data loss during brief disconnections

---

## 🏗️ Architecture Deep Dive

### Message Flow with Replay

```mermaid
sequenceDiagram
  participant C as Client
  participant S as Server
  participant H as History Buffer

  Note over C,S: Initial Connection
  C->>S: GET /api/events?topics=chat
  S->>H: Create session history
  S-->>C: 200 OK (SSE stream)
  
  S->>H: Store message #1
  S->>C: id: 1, event: chat, data: {...}
  
  S->>H: Store message #2
  S->>C: id: 2, event: chat, data: {...}
  
  Note over C,S: Connection Lost
  C-xS: Network error
  S->>H: Store message #3
  S->>H: Store message #4
  
  Note over C,S: Reconnect with Last-Event-ID
  C->>S: GET /api/events?topics=chat<br/>Last-Event-ID: 2
  S->>H: Query messages since ID 2
  H-->>S: Messages 3, 4
  S->>C: id: 3, event: chat, data: {...}
  S->>C: id: 4, event: chat, data: {...}
  Note over C: No messages lost!
  
  Note over C,S: Add New Topic
  C->>C: User enables notifications
  C->>S: GET /api/events?topics=chat,notifications<br/>lastEventID: 4
  S->>S: analyzeTopicSafety()
  Note right of S: "notifications" is NEW<br/>"chat" is SAFE
  S->>H: Get ALL notifications
  S->>H: Get chat messages since 4
  S->>C: Full notification history
  S->>C: Missed chat messages
```

### Browser Compatibility

| Browser | Support         |
| ------- | --------------- |
| Chrome  | ✅ All versions  |
| Firefox | ✅ All versions  |
| Safari  | ✅ All versions  |
| Edge    | ✅ All versions  |
| Opera   | ✅ All versions  |
| IE 11   | ❌ Not supported |

**Note for IE support:** Use the [event-source-polyfill](https://github.com/Yaffle/EventSource) package:

```bash
pnpm add event-source-polyfill
```

```typescript
// src/lib/hooks/sse.hook.svelte.ts
import { EventSourcePolyfill } from "event-source-polyfill";

// Replace native EventSource with polyfill
const EventSourceClass = typeof EventSource !== "undefined" 
  ? EventSource 
  : EventSourcePolyfill;

this.#eventSource = new EventSourceClass(url.toString());
```

## 📖 What is Server-Sent Events (SSE)?

**Server-Sent Events (SSE)** is a web technology that enables servers to push real-time updates to clients over a persistent HTTP connection. It's part of the HTML5 standard and provides a simple, efficient way to stream data from server to client.

### 🎯 Perfect Use Cases

- 📢 **Real-time notifications** — New messages, alerts, mentions
- 📊 **Live dashboards** — Stock prices, analytics, monitoring
- 📈 **Progress tracking** — Upload/download status, task completion
- 💬 **Activity feeds** — Social media updates, news feeds
- 🔔 **System alerts** — Server status, error notifications
- 🎮 **Live scores** — Sports, gaming leaderboards
- 💬 **Chat applications** — Message streaming (receive-only)
- 🤖 **AI streaming responses** — GPT-style text generation

### ⚔️ SSE vs WebSocket vs Long Polling

| Feature             | SSE                  | WebSocket             | Long Polling              |
| ------------------- | -------------------- | --------------------- | ------------------------- |
| **Direction**       | Server → Client only | Bidirectional         | Client → Server (request) |
| **Protocol**        | HTTP                 | WebSocket (ws://)     | HTTP                      |
| **Complexity**      | Simple               | Complex               | Very Simple               |
| **Auto-reconnect**  | ✅ Built-in           | ❌ Manual              | ❌ Manual                  |
| **Event Types**     | ✅ Named events       | ❌ Raw messages        | ❌ Raw messages            |
| **Browser Support** | ✅ All modern         | ✅ All modern          | ✅ Universal               |
| **Firewall/Proxy**  | ✅ Compatible         | ⚠️ May block           | ✅ Compatible              |
| **Overhead**        | Low                  | Very Low              | High (repeated requests)  |
| **Best for**        | Real-time updates    | Real-time chat, games | Simple polling            |

### ✅ Advantages of SSE

- **Standard HTTP** — No special protocol required
- **Automatic reconnection** — Built into the browser's EventSource API
- **Event IDs** — Resume from last received event after reconnection
- **Simple implementation** — Less boilerplate than WebSocket
- **Better compatibility** — Works through most proxies and CDNs
- **Named events** — Multiple event types on the same connection
- **Text-based** — Easy to debug with browser DevTools
- **Efficient** — One persistent connection, no polling overhead

### ❌ When NOT to Use SSE

- **Bidirectional communication** — Use WebSocket instead
- **Binary data** — WebSocket handles binary better
- **Very high frequency** — WebSocket has lower overhead
- **IE support required** — SSE not supported in IE (use polyfill or WebSocket)

## 🔍 How It Works

### Connection Flow Diagram

```mermaid
sequenceDiagram
  autonumber
  participant C as Client (SSEClient)
  participant B as Browser (EventSource API)
  participant S as Server (produceSSE)

  Note over C,S: Initial Connection
  C->>C: new SSEClient() with topics
  C->>B: Create EventSource with topics in URL
  B->>+S: GET /api/events?topics=chat&topics=notifications
  S-->>B: 200 OK (Content-Type: text/event-stream)
  Note over B,S: Persistent Connection Established

  S->>B: event: chat\ndata: {"text":"Hello"}\n\n
  B->>C: Trigger "chat" event listener
  C->>C: Update $state reactively

  S->>B: : keep-alive\n\n
  Note right of S: Every 15s to prevent timeout

  rect rgba(100, 200, 100, 0.1)
    Note over S: Server emits notification
    S->>B: event: notifications\ndata: {"message":"Alert!"}\n\n
    B->>C: Trigger "notifications" listener
    C->>C: Update $state
  end

  Note over C,S: Connection Lost (Network/Server Issue)
  S-xB: Connection dropped
  B->>C: onerror triggered
  C->>C: status = "error"
  Note right of C: Wait reconnectWait (3s)

  C->>B: Reconnect automatically
  B->>S: GET /api/events?topics=chat&topics=notifications
  S-->>B: Connection restored
  Note over B,S: Client receives missed events (if implemented)

  Note over C,S: Manual Cleanup
  C->>B: close()
  B->>S: Close connection
  S->>S: cleanup() called
```

### SSE Message Format

SSE uses a simple text-based protocol. Messages are sent as UTF-8 text with specific field formats:

```text
event: notification
data: {"id": "123", "message": "Hello World"}

: This is a comment (keep-alive)

event: message
data: {"text": "Multi-line messages"}
data: {"can": "span multiple data fields"}
```

**Field types:**
- `event:` — Event name (e.g., "notification", "message")
- `data:` — Event data (usually JSON)
- `id:` — Event ID for resumption (this project doesn't use it yet)
- `retry:` — Reconnection time in milliseconds
- `:` — Comment (used for keep-alive)

Each message ends with **two newlines** (`\n\n`).

## ⚙️ Prerequisites

Before you begin, make sure you have installed:

- **[Node.js](https://nodejs.org/)** >= 18.0.0
- **[pnpm](https://pnpm.io/)** >= 9.0.0 (package manager)

## 🚀 Installation and Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/gustavomorinaga/sveltekit-sse.git
cd sveltekit-sse
```

### 2️⃣ Install dependencies

```bash
pnpm install
```

### 3️⃣ Start the development server

```bash
pnpm dev
```

The project will be available at:
- **Application:** <http://localhost:5173>

## 🏃‍♂️ Running the Project

### Development

```bash
pnpm dev
```

### Production Build

```bash
pnpm build
```

### Build Preview

```bash
pnpm preview
```

## 📝 Available Scripts

- `pnpm dev` — starts development server
- `pnpm build` — creates production build
- `pnpm preview` — previews production build
- `pnpm check` — checks TypeScript and Svelte types
- `pnpm check:watch` — checks types in watch mode
- `pnpm format` — formats code with Ultracite
- `pnpm lint` — runs linting with Ultracite

## 📁 Project Structure

```text
sveltekit-sse/
├─ src/
│  ├─ lib/
│  │  ├─ components/                           # Svelte components
│  │  │  ├─ chat/
│  │  │  │  ├─ chat.component.svelte           # Interactive chat UI
│  │  │  │  └─ index.ts                        # Component exports
│  │  │  ├─ notifications/
│  │  │  │  ├─ notifications.component.svelte  # Notifications display
│  │  │  │  └─ index.ts
│  │  │  └─ toolbar/
│  │  │      ├─ toolbar.component.svelte       # Connection status toolbar
│  │  │      └─ index.ts
│  │  ├─ contexts/                             # Svelte 5 contexts
│  │  │  └─ events.context.svelte.ts           # Global SSE state management
│  │  ├─ hooks/                                # Custom Svelte hooks
│  │  │  └─ sse.hook.svelte.ts                 # Reactive SSE client class
│  │  ├─ mock/                                 # Mock data for demo
│  │  │  ├─ chat.mock.ts                       # Story script data
│  │  │  └─ notifications.mock.ts              # Sample notifications
│  │  ├─ server/                               # Server-side utilities
│  │  │  ├─ sse.ts                             # SSE response producer
│  │  │  └─ story-engine.ts                    # Chat story state machine
│  │  └─ ts/                                   # TypeScript definitions
│  │      ├─ chat.ts                           # Chat message types
│  │      ├─ notification.ts                   # Notification types
│  │      ├─ sse-topics.ts                     # SSE topics map (type-safe)
│  │      └─ index.ts                          # Type exports
│  ├─ routes/                                  # SvelteKit routes
│  │  ├─ +layout.svelte                        # Root layout
│  │  ├─ +page.svelte                          # Home page (demo)
│  │  ├─ layout.css                            # Global styles
│  │  └─ api/                                  # API endpoints
│  │      ├─ chat/
│  │      │  └─ +server.ts                     # HTTP POST for chat actions
│  │      └─ events/
│  │          └─ +server.ts                    # SSE endpoint (main)
│  ├─ app.d.ts                                 # TypeScript app definitions
│  └─ app.html                                 # HTML template
├─ static/                                     # Static assets
│  ├─ assets/                                  # Images, fonts, etc.
│  └─ robots.txt
├─ .nvmrc                                      # Node version specification
├─ biome.jsonc                                 # Biome (linter/formatter) config
├─ package.json                                # Dependencies and scripts
├─ pnpm-lock.yaml                              # pnpm lock file
├─ pnpm-workspace.yaml                         # pnpm workspace configuration
├─ svelte.config.js                            # SvelteKit configuration
├─ tsconfig.json                               # TypeScript configuration
├─ vite.config.ts                              # Vite configuration
└─ README.md                                   # This documentation
```

### Key Files Explained

| File                                        | Purpose                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `src/lib/hooks/sse.hook.svelte.ts`          | **Core SSE client** — Reactive EventSource wrapper with auto-reconnect |
| `src/lib/server/sse.ts`                     | **Server producer** — Creates SSE Response with keep-alive             |
| `src/lib/contexts/events.context.svelte.ts` | **Global state** — Manages SSE connection and data across components   |
| `src/lib/ts/sse-topics.ts`                  | **Type safety** — Defines all SSE topics and their data shapes         |
| `src/routes/api/events/+server.ts`          | **Main SSE endpoint** — Streams multiple topics (chat, notifications)  |
| `src/routes/api/chat/+server.ts`            | **Chat actions** — HTTP POST endpoint for user interactions            |
| `src/lib/server/story-engine.ts`            | **Story logic** — State machine for interactive chat demo              |
| `src/lib/components/*/`                     | **UI components** — Reusable Svelte 5 components with runes            |

## 🔧 Client API (SSEClient)

### Type-Safe Topics System

This implementation uses a **topics-based approach** where you define a map of event types and their corresponding data shapes:

```typescript
// Define your topics and their data types
interface SSETopicsMap {
  chat: { id: string; text: string; sender: string };
  notification: { id: string; message: string; type: "info" | "error" };
  progress: { percent: number; taskId: string };
}
```

### Creating an SSEClient Instance

```typescript
import { SSEClient } from "$lib/hooks/sse.hook.svelte";

const client = new SSEClient<SSETopicsMap>("/api/events", {
  topics: {
    // Subscribe to specific topics with callbacks
    chat: (data) => {
      console.log("New chat message:", data.text);
    },
    notification: (data) => {
      console.log(`${data.type}: ${data.message}`);
    },
    // You can subscribe to some topics and ignore others
  },
  reconnectWait: 3000,     // Wait time for reconnection (default: 3000ms)
  autoConnect: true,       // Connect automatically (default: true)
  debug: false,            // Enable console logs (default: false)
});
```

### Constructor Options

```typescript
interface SSEOptions<TTopics> {
  // Map of topic names to their callback functions
  topics: {
    [K in keyof TTopics]?: (data: TTopics[K]) => void;
  };
  
  // Automatically connect on instantiation
  autoConnect?: boolean; // default: true
  
  // Enable debug logging in console
  debug?: boolean; // default: false
}
```

### Reactive Properties

The client exposes reactive properties using Svelte 5 runes:

```typescript
// Connection status (reactive)
client.status // "idle" | "connecting" | "connected" | "error"

// Error object if status is "error" (reactive)
client.error // Error | null

// Last global sequence ID received (reactive)
client.lastEventID // string | null

// Per-topic message counters (reactive)
client.topicCounters // Record<string, number>
// Example: { chat: 42, notifications: 7 }
```

### Methods

```typescript
// Manually connect (if autoConnect: false)
client.connect();

// Disconnect and cleanup
client.close();

// Dynamically update subscribed topics
client.updateTopics({
  addTopics?: ["newTopic1", "newTopic2"],
  removeTopics?: ["oldTopic"],
  // OR completely replace:
  nextTopics?: { topic1: callback1, topic2: callback2 }
});
```

### Dynamic Topic Updates Example

```typescript
const stream = new SSEClient<TopicsMap>("/api/events", {
  topics: {
    chat: (msg) => console.log("Chat:", msg)
  }
});

// Later, user enables notifications
stream.updateTopics({
  addTopics: ["notifications"]
});
// Server will automatically replay missed notifications

// User disables chat
stream.updateTopics({
  removeTopics: ["chat"]
});

// Or replace everything at once
stream.updateTopics({
  nextTopics: {
    notifications: (notif) => console.log("Notification:", notif),
    logs: (log) => console.log("Log:", log)
  }
});
```

### Complete Component Example

```svelte
<script lang="ts">
  import { SSEClient } from "$lib/hooks/sse.hook.svelte";

  interface Message {
    id: string;
    text: string;
    timestamp: number;
  }
  
  interface Notification {
    id: string;
    message: string;
    type: "info" | "error";
  }
  
  interface TopicsMap {
    message: Message;
    notification: Notification;
  }

  let messages = $state<Message[]>([]);
  let notifications = $state<Notification[]>([]);

  // Subscribe to multiple topics in one connection
  const stream = new SSEClient<TopicsMap>("/api/stream", {
    topics: {
      message: (msg) => {
        messages = [...messages, msg];
      },
      notification: (notif) => {
        notifications = [notif, ...notifications].slice(0, 5); // Keep last 5
      },
    },
    debug: true, // See logs in console
  });
</script>

<div class="dashboard">
  <!-- Connection Status Indicator -->
  <div class="status" data-status={stream.status}>
    {#if stream.status === "connected"}
      🟢 Connected
    {:else if stream.status === "connecting"}
      🟡 Connecting...
    {:else if stream.status === "error"}
      🔴 Error: {stream.error?.message}
      <button onclick={stream.connect}>Retry</button>
    {:else}
      ⚪ Disconnected
      <button onclick={stream.connect}>Connect</button>
    {/if}
  </div>

  <!-- Messages List -->
  <section>
    <h2>Messages</h2>
    {#each messages as message (message.id)}
      <div class="message">
        {message.text}
        <small>{new Date(message.timestamp).toLocaleTimeString()}</small>
      </div>
    {/each}
  </section>

  <!-- Notifications List -->
  <section>
    <h2>Notifications</h2>
    {#each notifications as notification (notification.id)}
      <div class="notification" data-type={notification.type}>
        {notification.message}
      </div>
    {/each}
  </section>
</div>

<style>
  .status[data-status="connected"] { color: green; }
  .status[data-status="error"] { color: red; }
  .notification[data-type="error"] { background: #fee; }
</style>
```

### Using with Svelte Context API

For global state management across components:

```typescript
// events.context.svelte.ts
import { getContext, setContext } from "svelte";
import { SSEClient } from "$lib/hooks/sse.hook.svelte";

interface TopicsMap {
  message: { text: string };
  notification: { message: string };
}

class EventsContext {
  messages = $state<string[]>([]);
  
  readonly stream = new SSEClient<TopicsMap>("/api/events", {
    topics: {
      message: (data) => this.messages.push(data.text),
      notification: (data) => alert(data.message),
    },
  });
}

const KEY = Symbol("events");

export function setEventsContext() {
  return setContext(KEY, new EventsContext());
}

export function getEventsContext() {
  return getContext<EventsContext>(KEY);
}
```

```svelte
<!-- +layout.svelte -->
<script lang="ts">
  import { setEventsContext } from "$lib/contexts/events.context.svelte";
  setEventsContext();
</script>

<slot />
```

```svelte
<!-- +page.svelte -->
<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";
  
  const { messages, stream } = getEventsContext();
</script>

<div>
  Status: {stream.status}
  {#each messages as message}
    <p>{message}</p>
  {/each}
</div>
```

## 🔧 Server API (produceSSE)

### Basic Usage

The `produceSSE` function creates a Server-Sent Events response stream with automatic keep-alive and proper cleanup.

### Creating an SSE Endpoint

```typescript
// src/routes/api/events/+server.ts
import { produceSSE } from "$lib/server/sse";

interface TopicsMap {
  message: { id: string; text: string };
  notification: { id: string; message: string; type: string };
}

export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    // Send events periodically
    const interval = setInterval(() => {
      emit({
        event: "message",
        data: {
          id: crypto.randomUUID(),
          text: "New message!",
        },
        id: String(Date.now()) // Optional: sequence ID for replay
      });
    }, 1000);

    // Cleanup function (called when connection closes)
    return () => {
      clearInterval(interval);
      console.log("Client disconnected");
    };
  });
};
```

### produceSSE Function Signature

```typescript
interface SSEEmitOptions<TTopics, K extends keyof TTopics> {
  /** The event/topic name */
  event: K;
  /** The event data payload */
  data: TTopics[K];
  /** Optional unique ID for message recovery on reconnection */
  id?: string;
}

type SSEEmitter<TTopics> = <K extends keyof TTopics>(
  options: SSEEmitOptions<TTopics, K>
) => void;

type SSEProducer<TTopics> = (
  emit: SSEEmitter<TTopics>
) => () => void;

function produceSSE<TTopics>(
  producer: SSEProducer<TTopics>
): Response
```

**Parameters:**
- `producer`: Function that receives an `emit` callback and returns a cleanup function
  - `emit({ event, data, id? })`: Sends a typed event to the client with optional sequence ID
  - `return`: Cleanup function executed when the connection is closed

**Returns:**
- `Response`: HTTP response with configured SSE stream and headers:
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache, no-transform`
  - `Connection: keep-alive`

**Automatic Features:**
- ✅ Keep-alive ping every 15 seconds (`: keep-alive\n\n`)
- ✅ Proper cleanup on client disconnect
- ✅ Error handling and logging
- ✅ Message ID tracking for replay support

### Advanced: Message Replay with History

For production use, implement message replay to handle reconnections:

```typescript
import { produceSSE } from "$lib/server/sse";
import { 
  createEmitWithHistory, 
  replayMissedMessages,
  setTopicSubscription 
} from "$lib/server/sse-helpers";

export const GET = ({ cookies, request, url }) => {
  const requestedTopics = url.searchParams.getAll("topics");
  const lastEventID = 
    request.headers.get("last-event-id") ?? 
    url.searchParams.get("lastEventID");
  
  let sessionID = cookies.get("session_id");
  if (!sessionID) {
    sessionID = crypto.randomUUID();
    cookies.set("session_id", sessionID, { path: "/" });
  }

  return produceSSE<TopicsMap>((emit) => {
    // Wrap emitter to automatically track history
    const emitWithHistory = createEmitWithHistory({ sessionID, emit });
    
    // Replay missed messages on reconnection
    if (lastEventID) {
      replayMissedMessages({
        sessionID,
        lastEventID,
        requestedTopics,
        emit
      });
    }
    
    // Remember current topics for next reconnection
    setTopicSubscription(sessionID, requestedTopics);
    
    // Now emit using the history-aware wrapper
    const interval = setInterval(() => {
      emitWithHistory({
        event: "message",
        data: { text: "Hello" }
        // ID is auto-assigned by createEmitWithHistory
      });
    }, 1000);
    
    return () => clearInterval(interval);
  });
};
```

### Helper Functions

#### `createEmitWithHistory`

Wraps your emitter to automatically persist messages to a session history buffer with global sequence IDs:

```typescript
const emitWithHistory = createEmitWithHistory({ sessionID, emit });

// Every call is automatically stored with an ID
emitWithHistory({ event: "chat", data: { text: "Hello" } });
// → Stored as { id: "123", topic: "chat", data: {...}, timestamp: ... }
// → Sent to client with id: 123
```

#### `replayMissedMessages`

Intelligently replays messages based on topic safety analysis:

```typescript
replayMissedMessages({
  sessionID,
  lastEventID: "42",
  requestedTopics: ["chat", "notifications"], // notifications is NEW
  emit
});

// Behavior:
// - "chat" was already subscribed → replay only messages > 42
// - "notifications" is new → replay ALL notification history
```

#### `analyzeTopicSafety`

Determines which topics are new vs. previously subscribed:

```typescript
const { safeTopics, newTopics } = analyzeTopicSafety(
  sessionID,
  ["chat", "notifications"]
);

// safeTopics: ["chat"] - was in previous connection
// newTopics: ["notifications"] - newly added
```

### Accessing Request Data

Use SvelteKit's `RequestEvent` parameter to access cookies, headers, URL params, etc.:

```typescript
import type { RequestEvent } from "@sveltejs/kit";

export const GET = ({ cookies, url, request, locals }: RequestEvent) => {
  // Get requested topics from URL query params
  const topics = url.searchParams.getAll("topics");
  
  // Access authentication
  const userId = locals.user?.id;
  
  // Get session
  const sessionId = cookies.get("session_id");

  return produceSSE<TopicsMap>((emit) => {
    // Only send events for requested topics
    if (topics.includes("notifications")) {
      const interval = setInterval(() => {
        emit({
          event: "notifications",
          data: {
            userId,
            message: "New notification",
          }
        });
      }, 5000);
      
      return () => clearInterval(interval);
    }

    return () => {}; // Empty cleanup if no topics
  });
};
```

### Example: Multiple Topics with Different Sources

```typescript
interface TopicsMap {
  chat: { id: string; text: string; sender: string };
  notifications: { id: string; message: string };
  metrics: { cpu: number; memory: number };
}

export const GET = ({ url }) => {
  const requestedTopics = url.searchParams.getAll("topics");

  return produceSSE<TopicsMap>((emit) => {
    const cleanupFunctions: Array<() => void> = [];

    // Chat messages (if requested)
    if (requestedTopics.includes("chat")) {
      const unsubscribeChat = subscribeToChat((message) => {
        emit({ event: "chat", data: message });
      });
      cleanupFunctions.push(unsubscribeChat);
    }

    // Notifications (if requested)
    if (requestedTopics.includes("notifications")) {
      const unsubscribeNotif = subscribeToNotifications((notif) => {
        emit({ event: "notifications", data: notif });
      });
      cleanupFunctions.push(unsubscribeNotif);
    }

    // System metrics (if requested)
    if (requestedTopics.includes("metrics")) {
      const metricsInterval = setInterval(async () => {
        const metrics = await getSystemMetrics();
        emit({ event: "metrics", data: metrics });
      }, 5000);
      cleanupFunctions.push(() => clearInterval(metricsInterval));
    }

    // Cleanup all subscriptions
    return () => {
      cleanupFunctions.forEach(fn => fn());
    };
  });
};
```

### Example: Database Changes

```typescript
import { db } from "$lib/server/db";

interface TopicsMap {
  order: {
    id: string;
    status: "pending" | "completed";
    total: number;
  };
}

export const GET = ({ locals }) => {
  if (!locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return produceSSE<TopicsMap>((emit) => {
    // Subscribe to database changes
    const unsubscribe = db.orders
      .where("userId", "==", locals.user.id)
      .onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === "modified" || change.type === "added") {
            const order = change.doc.data();
            emit({
              event: "order",
              data: {
                id: order.id,
                status: order.status,
                total: order.total,
              }
            });
          }
        });
      });

    return () => {
      unsubscribe();
      console.log(`User ${locals.user.id} disconnected`);
    };
  });
};
```

### Example: External API Webhook

```typescript
interface TopicsMap {
  payment: {
    orderId: string;
    status: "success" | "failed";
    amount: number;
  };
}

// Global event emitter for webhooks
const paymentEmitter = new EventEmitter();

// Webhook endpoint
export const POST = async ({ request }) => {
  const webhook = await request.json();
  
  // Emit to all connected SSE clients
  paymentEmitter.emit("payment", {
    orderId: webhook.orderId,
    status: webhook.status,
    amount: webhook.amount,
  });
  
  return json({ received: true });
};

// SSE endpoint
export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    const handler = (data: TopicsMap["payment"]) => {
      emit({ event: "payment", data });
    };
    
    paymentEmitter.on("payment", handler);
    
    return () => {
      paymentEmitter.off("payment", handler);
    };
  });
};
```

## 📊 Demo: Interactive Chat + Notifications + Logs System

This project includes a complete demo showcasing SSE capabilities with **three real-time features** running simultaneously:

### 🎮 1. Interactive Story-based Chat

An interactive text adventure that demonstrates:
- **Bidirectional communication** (SSE for receiving, HTTP POST for sending)
- **Session management** with cookies
- **Message replay** on reconnection (no lost messages)
- **State restoration** after page refresh (chat history)
- **Conditional prompts** (wait for user input)
- **Timed events** (story progresses automatically)

#### Server Implementation

```typescript
// src/routes/api/events/+server.ts
export const GET = ({ cookies, request, url }) => {
  const requestedTopics = url.searchParams.getAll("topics");
  const lastEventID =
    request.headers.get("last-event-id") ?? url.searchParams.get("lastEventID");

  let sessionID = cookies.get("story_session");
  if (!sessionID) {
    sessionID = crypto.randomUUID();
    cookies.set("story_session", sessionID, { path: "/", httpOnly: true });
  }

  const connectionType = lastEventID ? "RECONNECT" : "NEW";
  console.log(`[SSE] ${connectionType} connection for session ${sessionID}`);

  return produceSSE<SSETopicsMap>((emit) => {
    const session = getSession(sessionID);
    const emitWithHistory = createEmitWithHistory({ sessionID, emit });

    session.emitter = emitWithHistory;

    // Replay missed messages if reconnecting (topic-safety-aware)
    if (lastEventID) {
      replayMissedMessages({ sessionID, lastEventID, requestedTopics, emit });
    }

    // Persist current topic subscription for next reconnect
    setTopicSubscription(sessionID, requestedTopics);

    // Handle chat topics if requested
    const chatTopics = ["message", "prompt", "end", "history"];
    const isChatTopicRequested = requestedTopics.some((topic) =>
      chatTopics.includes(topic)
    );

    if (isChatTopicRequested) {
      handleChatTopics({ sessionID, lastEventID, emitWithHistory, request });
    }

    // Setup polling for notifications and logs
    const notificationsInterval = setupNotificationsPolling({
      requestedTopics,
      emitWithHistory,
    });

    const logsInterval = setupLogsPolling({ requestedTopics, emitWithHistory });

    // Cleanup on disconnect
    return () => {
      if (session.timeoutID) clearTimeout(session.timeoutID);
      clearInterval(notificationsInterval);
      clearInterval(logsInterval);
    };
  });
};
```

#### Story Engine (Server-side State Machine)

```typescript
// src/lib/server/story-engine.ts
interface PlayerSession {
  step: number;
  timeoutID?: ReturnType<typeof setTimeout>;
  emitter: SSEEmitter<SSETopicsMap> | null;
  history: ChatMessage[];
}

export function playStory(sessionId: string) {
  const session = getSession(sessionId);
  if (!session?.emitter) return;

  const node = SCRIPT[session.step];

  if (node.type === "npc") {
    // NPC message - send and auto-advance after delay
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      sender: node.name,
      text: node.text,
    };
    session.history.push(message);
    session.emitter({ event: "message", data: message });
    session.step++;
    session.timeoutID = setTimeout(() => playStory(sessionId), node.delay);
    
  } else if (node.type === "prompt") {
    // User input required - send prompt and wait
    session.emitter({ 
      event: "prompt", 
      data: {
        id: crypto.randomUUID(),
        sender: "System",
        text: node.text,
      }
    });
  }
}
```

#### Client-side Context with Dynamic Topics

```typescript
// src/lib/contexts/events.context.svelte.ts
class EventsContext {
  readonly stream = new SSEClient<SSETopicsMap>(resolve("/api/events"), {
    debug: dev,
    topics: this.#buildTopicHandlers(["notifications", "logs"]),
  });

  activeTopics = new SvelteSet<StreamTopic>(["notifications", "logs"]);
  
  chat = $state<ChatMessage[]>([]);
  notifications = $state<Notification[]>([]);
  logs = $state<LogEntry[]>([]);

  toggleTopic(topic: StreamTopic) {
    if (this.activeTopics.has(topic)) {
      this.activeTopics.delete(topic);
      this.stream.updateTopics({ removeTopics: [topic] });
    } else {
      this.activeTopics.add(topic);
      this.stream.updateTopics({
        addTopics: [topic],
        nextTopics: this.#buildTopicHandlers([...this.activeTopics])
      });
    }
  }
  
  #buildTopicHandlers(streamTopics: StreamTopic[]) {
    const handlers = {
      // Chat handlers (always active)
      message: (data) => this.chat.unshift(data),
      prompt: (data) => (this.expectedPrompt = data.text),
      end: (data) => {
        this.chat.unshift(data);
        this.ended = true;
      },
      history: (data) => (this.chat = [...data].reverse()),
    };

    // Optional stream handlers
    if (streamTopics.includes("notifications")) {
      handlers.notifications = (data) => {
        this.notifications.unshift(data);
        if (this.notifications.length > 5) this.notifications.pop();
      };
    }

    if (streamTopics.includes("logs")) {
      handlers.logs = (data) => {
        this.logs.unshift(data);
        if (this.logs.length > 30) this.logs.pop();
      };
    }

    return handlers;
  }
}
```

#### Client-side Chat Component

```svelte
<!-- src/lib/components/chat/chat.component.svelte -->
<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const { chat, expectedPrompt, sendPrompt, resetChat } = getEventsContext();
  
  const isWaitingForUser = $derived(expectedPrompt !== null);
</script>

<section class="chat">
  <header>
    <h3>💬 Chat</h3>
    <button onclick={resetChat}>Reset</button>
  </header>

  <!-- Messages displayed in reverse chronological order -->
  <ul class="messages">
    {#each chat as message (message.id)}
      <li class:mine={message.isMe}>
        <strong>{message.sender}</strong>
        <p>{message.text}</p>
      </li>
    {/each}
  </ul>

  <!-- User input -->
  <footer>
    <form onsubmit={sendPrompt}>
      <input 
        value={expectedPrompt || "Waiting for story..."}
        readonly 
        disabled={!isWaitingForUser}
      />
      <button type="submit" disabled={!isWaitingForUser}>
        Send
      </button>
    </form>
  </footer>
</section>
```

### 🔔 2. Real-Time Notifications

Demonstrates periodic server-sent notifications with topic toggling:

#### Server

```typescript
// Part of the same /api/events endpoint
export function setupNotificationsPolling({ requestedTopics, emitWithHistory }) {
  return setInterval(() => {
    if (requestedTopics.includes("notifications")) {
      const randomNotification = getRandomNotification();
      
      emitWithHistory({
        event: "notifications",
        data: {
          id: crypto.randomUUID(),
          ...randomNotification,
          timestamp: new Date().toLocaleTimeString(),
        }
      });
    }
  }, 3000); // Every 3 seconds
}
```

#### Client

```svelte
<!-- src/lib/components/notifications/notifications.component.svelte -->
<script lang="ts">
  import { getEventsContext } from "$lib/contexts/events.context.svelte";

  const { notifications, stream, toggleTopic, activeTopics } = getEventsContext();
  const isActive = $derived(activeTopics.has("notifications"));
  const count = $derived(stream.topicCounters.notifications ?? 0);
</script>

<section class="notifications">
  <header>
    <h3>🔔 Notifications</h3>
    <button onclick={() => toggleTopic("notifications")}>
      {isActive ? "Disable" : "Enable"}
    </button>
    <span class="count">{count} total</span>
  </header>

  <ul>
    {#each notifications as notif (notif.id)}
      <li class:error={notif.type === "error"}>
        <strong>{notif.timestamp}</strong>
        {notif.message}
      </li>
    {/each}
  </ul>
</section>
```

### 📝 3. Real-Time Logs

Demonstrates a third topic that can be toggled independently:

```typescript
// Server
export function setupLogsPolling({ requestedTopics, emitWithHistory }) {
  return setInterval(() => {
    if (requestedTopics.includes("logs")) {
      const randomLog = getRandomLog();
      
      emitWithHistory({
        event: "logs",
        data: {
          id: crypto.randomUUID(),
          ...randomLog,
          timestamp: Date.now(),
        }
      });
    }
  }, 2000); // Every 2 seconds
}
```

### 🎯 Key Learnings from the Demo

1. **Multiple Topics in One Connection**
   - Chat, notifications, and logs use the same SSE connection
   - Topics are filtered server-side based on URL parameters
   - Reduces overhead compared to multiple connections
   - Can dynamically add/remove topics without reconnecting

2. **Message Replay on Reconnection**
   - No messages are lost during brief disconnections
   - Server tracks global sequence IDs for all messages
   - Client sends Last-Event-ID on reconnect
   - Server replays all missed messages in order

3. **Topic Safety Analysis**
   - When adding new topics, server detects this automatically
   - New topics get full history replay
   - Existing topics only get delta (missed messages)
   - Prevents data inconsistency across topic changes

4. **Session Persistence**
   - Chat history survives page reloads and reconnections
   - Server maintains state per session with cookies
   - Reconnection restores full context automatically
   - Ring buffer keeps recent history for each session

5. **Hybrid Communication**
   - SSE for server → client (messages, notifications, logs)
   - HTTP POST for client → server (user responses, actions)
   - Best of both worlds for interactive apps
   - Lower overhead than WebSocket for one-way streams

6. **Proper Resource Management**
   - Cleanup functions clear intervals and timeouts
   - Session state is properly managed
   - No memory leaks on disconnect
   - Per-topic counters track activity

7. **Dynamic UI Updates**
   - Users can enable/disable notifications and logs
   - Topic changes trigger smart reconnection
   - Reactive counters show per-topic activity
   - Connection status is always visible

## 🎯 Use Cases and Patterns

### 1. Real-Time Dashboard with Live Metrics

**Scenario:** Monitor system health with live CPU, memory, and network metrics.

```typescript
// Server: src/routes/api/dashboard/+server.ts
interface DashboardTopics {
  metrics: {
    cpu: number;
    memory: number;
    network: { in: number; out: number };
  };
  alerts: {
    level: "info" | "warning" | "critical";
    message: string;
  };
}

export const GET = () => {
  return produceSSE<DashboardTopics>((emit) => {
    // Send metrics every 2 seconds
    const metricsInterval = setInterval(async () => {
      const metrics = await getSystemMetrics();
      emit({ event: "metrics", data: metrics });
      
      // Send alert if CPU is high
      if (metrics.cpu > 80) {
        emit({
          event: "alerts",
          data: {
            level: "warning",
            message: `High CPU usage: ${metrics.cpu}%`,
          }
        });
      }
    }, 2000);

    return () => clearInterval(metricsInterval);
  });
};
```

```svelte
<!-- Client -->
<script lang="ts">
  let cpuHistory = $state<number[]>([]);
  
  const stream = new SSEClient<DashboardTopics>("/api/dashboard", {
    topics: {
      metrics: (data) => {
        cpuHistory = [...cpuHistory, data.cpu].slice(-20); // Keep last 20
      },
      alerts: (data) => {
        toast.show(data.message, data.level);
      },
    },
  });
</script>

<Dashboard {cpuHistory} status={stream.status} />
```

### 2. Multi-User Activity Feed

**Scenario:** Social feed with likes, comments, and follows in real-time.

```typescript
// Server
interface FeedTopics {
  like: { postId: string; userId: string; userName: string };
  comment: { postId: string; text: string; userId: string };
  follow: { followerId: string; followingId: string };
}

export const GET = ({ locals }) => {
  if (!locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return produceSSE<FeedTopics>((emit) => {
    const userId = locals.user.id;
    
    // Subscribe to relevant activities
    const unsubscribeLikes = subscribeToLikes(userId, (like) => {
      emit({ event: "like", data: like });
    });
    
    const unsubscribeComments = subscribeToComments(userId, (comment) => {
      emit({ event: "comment", data: comment });
    });
    
    const unsubscribeFollows = subscribeToFollows(userId, (follow) => {
      emit({ event: "follow", data: follow });
    });

    return () => {
      unsubscribeLikes();
      unsubscribeComments();
      unsubscribeFollows();
    };
  });
};
```

```svelte
<!-- Client -->
<script lang="ts">
  let activities = $state<Activity[]>([]);
  
  const feed = new SSEClient<FeedTopics>("/api/feed", {
    topics: {
      like: (data) => {
        activities.unshift({
          type: "like",
          text: `${data.userName} liked your post`,
          timestamp: Date.now(),
        });
      },
      comment: (data) => {
        activities.unshift({
          type: "comment",
          text: `New comment: "${data.text}"`,
          timestamp: Date.now(),
        });
        // Update post comments count
        updatePostComments(data.postId);
      },
      follow: (data) => {
        activities.unshift({
          type: "follow",
          text: "Someone started following you",
          timestamp: Date.now(),
        });
      },
    },
  });
</script>
```

### 3. Long-Running Task Progress

**Scenario:** Track progress of file uploads, data processing, or batch operations.

```typescript
// Server
interface TaskTopics {
  progress: { taskId: string; percent: number; step: string };
  complete: { taskId: string; result: unknown };
  error: { taskId: string; error: string };
}

export const GET = ({ url, locals }) => {
  const taskId = url.searchParams.get("taskId");
  if (!taskId) {
    return new Response("Missing taskId", { status: 400 });
  }

  return produceSSE<TaskTopics>((emit) => {
    const task = getTask(taskId);
    
    // Task progress updates
    task.on("progress", (data) => {
      emit({
        event: "progress",
        data: {
          taskId,
          percent: data.percent,
          step: data.step,
        }
      });
    });
    
    // Task completion
    task.on("complete", (result) => {
      emit({ event: "complete", data: { taskId, result } });
    });
    
    // Task errors
    task.on("error", (error) => {
      emit({ event: "error", data: { taskId, error: error.message } });
    });

    return () => task.cleanup();
  });
};
```

```svelte
<!-- Client -->
<script lang="ts">
  let progress = $state(0);
  let currentStep = $state("Initializing...");
  let result = $state<unknown>(null);
  
  const taskStream = new SSEClient<TaskTopics>(
    `/api/task?taskId=${taskId}`,
    {
      topics: {
        progress: (data) => {
          progress = data.percent;
          currentStep = data.step;
        },
        complete: (data) => {
          result = data.result;
          taskStream.close();
        },
        error: (data) => {
          alert(`Error: ${data.error}`);
          taskStream.close();
        },
      },
    }
  );
</script>

<div>
  <progress value={progress} max="100" />
  <p>{currentStep} - {progress}%</p>
  {#if result}
    <div>✅ Task completed! Result: {JSON.stringify(result)}</div>
  {/if}
</div>
```

### 4. Collaborative Editing (Presence & Cursors)

**Scenario:** Show who's online and where they're editing in real-time.

```typescript
// Server
interface CollabTopics {
  presence: { userId: string; userName: string; status: "online" | "offline" };
  cursor: { userId: string; position: { line: number; column: number } };
  edit: { userId: string; changes: TextChange[] };
}

export const GET = ({ url, locals }) => {
  const documentId = url.searchParams.get("docId");
  
  return produceSSE<CollabTopics>((emit) => {
    const userId = locals.user.id;
    
    // Broadcast user presence
    broadcastPresence(documentId, {
      userId,
      userName: locals.user.name,
      status: "online",
    });
    
    // Subscribe to other users' activities
    const unsubPresence = subscribeToPresence(documentId, (data) => {
      if (data.userId !== userId) emit({ event: "presence", data });
    });
    
    const unsubCursors = subscribeToCursors(documentId, (data) => {
      if (data.userId !== userId) emit({ event: "cursor", data });
    });
    
    const unsubEdits = subscribeToEdits(documentId, (data) => {
      if (data.userId !== userId) emit({ event: "edit", data });
    });

    return () => {
      // Broadcast offline status
      broadcastPresence(documentId, {
        userId,
        userName: locals.user.name,
        status: "offline",
      });
      
      unsubPresence();
      unsubCursors();
      unsubEdits();
    };
  });
};
```

### 5. AI Streaming Responses (ChatGPT-style)

**Scenario:** Stream AI-generated text token by token.

```typescript
// Server
interface AITopics {
  token: { text: string; index: number };
  complete: { fullText: string; tokensUsed: number };
}

export const POST = async ({ request }) => {
  const { prompt } = await request.json();
  
  return produceSSE<AITopics>((emit) => {
    let index = 0;
    let fullText = "";
    
    // Stream tokens from AI model
    const stream = openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      stream: true,
    });
    
    (async () => {
      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || "";
        if (token) {
          fullText += token;
          emit({ event: "token", data: { text: token, index: index++ } });
        }
      }
      
      emit({
        event: "complete",
        data: {
          fullText,
          tokensUsed: index,
        }
      });
    })();

    return () => {
      // Cancel stream if client disconnects
      stream.controller?.abort();
    };
  });
};
```

```svelte
<!-- Client -->
<script lang="ts">
  let response = $state("");
  let isComplete = $state(false);
  
  function askAI(prompt: string) {
    response = "";
    isComplete = false;
    
    const stream = new SSEClient<AITopics>("/api/ai", {
      topics: {
        token: (data) => {
          response += data.text;
        },
        complete: (data) => {
          isComplete = true;
          console.log(`Used ${data.tokensUsed} tokens`);
          stream.close();
        },
      },
    });
  }
</script>

<div>
  <input onsubmit={() => askAI(promptValue)} />
  <div class="response">
    {response}
    {#if !isComplete}<span class="cursor">▋</span>{/if}
  </div>
</div>
```

## 🔒 Security and Best Practices

### 1. Authentication and Authorization

**Always verify user identity** before sending sensitive data:

```typescript
import type { RequestEvent } from "@sveltejs/kit";

export const GET = async ({ locals, cookies }: RequestEvent) => {
  // Check if user is authenticated
  if (!locals.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return produceSSE<TopicsMap>((emit) => {
    const userId = locals.user.id;
    
    // Only send events relevant to this user
    const unsubscribe = subscribeToUserEvents(userId, (event) => {
      emit({ event: "notification", data: event });
    });

    return unsubscribe;
  });
};
```

### 2. Rate Limiting

**Prevent abuse** by limiting connections per IP or user:

```typescript
// src/lib/server/rate-limit.ts
const connections = new Map<string, number>();

export function checkRateLimit(identifier: string, max = 5): boolean {
  const count = connections.get(identifier) || 0;
  
  if (count >= max) {
    return false; // Exceeded limit
  }
  
  connections.set(identifier, count + 1);
  
  // Cleanup after 1 minute
  setTimeout(() => {
    connections.set(identifier, (connections.get(identifier) || 1) - 1);
  }, 60_000);
  
  return true;
}
```

```typescript
// src/routes/api/events/+server.ts
export const GET = ({ getClientAddress, locals }) => {
  const identifier = locals.user?.id || getClientAddress();
  
  if (!checkRateLimit(identifier)) {
    return new Response("Too Many Requests", { 
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }

  return produceSSE<TopicsMap>((emit) => {
    // ...
  });
};
```

### 3. Connection Timeout

**Prevent infinite connections** that consume server resources:

```typescript
const MAX_CONNECTION_TIME = 15 * 60 * 1000; // 15 minutes

export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    // Auto-close after timeout
    const timeout = setTimeout(() => {
      emit({
        event: "timeout",
        data: { 
          message: "Connection expired. Please reconnect.",
        }
      });
      // Connection will be closed automatically
    }, MAX_CONNECTION_TIME);

    return () => {
      clearTimeout(timeout);
    };
  });
};
```

### 4. Input Validation

**Validate topic subscriptions** to prevent abuse:

```typescript
const ALLOWED_TOPICS = ["chat", "notifications", "metrics"] as const;

export const GET = ({ url }) => {
  const requestedTopics = url.searchParams.getAll("topics");
  
  // Validate topics
  const invalidTopics = requestedTopics.filter(
    (topic) => !ALLOWED_TOPICS.includes(topic as any)
  );
  
  if (invalidTopics.length > 0) {
    return new Response(`Invalid topics: ${invalidTopics.join(", ")}`, {
      status: 400,
    });
  }
  
  // Limit number of topics
  if (requestedTopics.length > 10) {
    return new Response("Too many topics requested", { status: 400 });
  }

  return produceSSE<TopicsMap>((emit) => {
    // ...
  });
};
```

### 5. Data Sanitization

**Never send sensitive data** without filtering:

```typescript
export const GET = ({ locals }) => {
  return produceSSE<TopicsMap>((emit) => {
    const userId = locals.user.id;
    
    const unsubscribe = db.users.onChange((user) => {
      // ❌ BAD: Sending everything
      // emit({ event: "user", data: user });
      
      // ✅ GOOD: Only send what's needed
      emit({
        event: "user",
        data: {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          // Don't send: password, email, tokens, etc.
        }
      });
    });

    return unsubscribe;
  });
};
```

### 6. Error Handling

**Don't expose internal errors** to clients:

```typescript
export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    try {
      const interval = setInterval(async () => {
        try {
          const data = await fetchExternalAPI();
          emit({ event: "data", data });
        } catch (error) {
          // Log internally
          console.error("[SSE] Error fetching data:", error);
          
          // Send generic error to client
          emit({
            event: "error",
            data: {
              message: "Failed to fetch data. Retrying...",
            }
          });
            message: "Failed to fetch data. Please try again.",
            // Don't send: error.stack, internal details
          });
        }
      }, 5000);

      return () => clearInterval(interval);
    } catch (error) {
      console.error("[SSE] Fatal error:", error);
      throw error; // Will send 500 to client
    }
  });
};
```

### 7. CORS Configuration

**Configure CORS** properly for cross-origin requests:

```typescript
// svelte.config.js
export default {
  kit: {
    cors: {
      origin: process.env.NODE_ENV === "production"
        ? ["https://your-domain.com"]
        : "*",
      credentials: true,
    },
  },
};
```

```typescript
// For specific endpoints
export const GET = () => {
  const response = produceSSE<TopicsMap>((emit) => {
    // ...
  });
  
  // Add CORS headers if needed
  response.headers.set("Access-Control-Allow-Origin", "https://your-domain.com");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  
  return response;
};
```

### 8. Resource Cleanup Checklist

**Always cleanup resources** to prevent memory leaks:

```typescript
export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    // ✅ Track all resources
    const intervals: ReturnType<typeof setInterval>[] = [];
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const subscriptions: Array<() => void> = [];
    
    // Create interval
    const interval = setInterval(() => {
      emit("ping", { timestamp: Date.now() });
    }, 5000);
    intervals.push(interval);
    
    // Subscribe to events
    const unsubscribe = eventEmitter.on("data", (data) => {
      emit("data", data);
    });
    subscriptions.push(unsubscribe);
    
    // ✅ Cleanup ALL resources
    return () => {
      intervals.forEach((id) => clearInterval(id));
      timeouts.forEach((id) => clearTimeout(id));
      subscriptions.forEach((unsub) => unsub());
      
      console.log("[SSE] All resources cleaned up");
    };
  });
};
```

### 9. Performance Tips

**Optimize for scalability:**

```typescript
// ❌ BAD: Sending too much data too frequently
const interval = setInterval(() => {
  emit("data", hugeObject); // Large payload
}, 100); // Every 100ms

// ✅ GOOD: Throttle and compress
const interval = setInterval(() => {
  const summary = compressData(data); // Send only what's needed
  emit("data", summary);
}, 5000); // Reasonable interval
```

**Batch multiple updates:**

```typescript
// ❌ BAD: Emit on every change
db.collection.onChange((doc) => {
  emit("update", doc); // Can fire 100s of times per second
});

// ✅ GOOD: Batch updates
let batch: Doc[] = [];
let batchTimeout: ReturnType<typeof setTimeout>;

db.collection.onChange((doc) => {
  batch.push(doc);
  
  clearTimeout(batchTimeout);
  batchTimeout = setTimeout(() => {
    emit("updates", batch); // Send batch
    batch = [];
  }, 1000); // Wait 1s for more changes
});
```

### 10. Monitoring and Logging

**Track SSE connections** for debugging and analytics:

```typescript
// src/lib/server/sse-monitor.ts
export const activeConnections = new Map<string, {
  userId: string;
  connectedAt: Date;
  topics: string[];
}>();

export function trackConnection(id: string, metadata: any) {
  activeConnections.set(id, {
    ...metadata,
    connectedAt: new Date(),
  });
  
  console.log(`[SSE] Active connections: ${activeConnections.size}`);
}

export function untrackConnection(id: string) {
  activeConnections.delete(id);
  console.log(`[SSE] Active connections: ${activeConnections.size}`);
}
```

```typescript
// Use in endpoint
export const GET = ({ locals }) => {
  const connectionId = crypto.randomUUID();
  
  trackConnection(connectionId, {
    userId: locals.user?.id,
    topics: requestedTopics,
  });

  return produceSSE<TopicsMap>((emit) => {
    // ...
    
    return () => {
      untrackConnection(connectionId);
    };
  });
};
```

## 🐛 Debugging and Troubleshooting

### Enable Debug Mode

```typescript
// Client-side debugging
const client = new SSEClient<TopicsMap>("/api/events", {
  topics: { /* ... */ },
  debug: true, // Enable console logs
});

// Now you'll see:
// [SSE] SSEClient initialized { baseURL: "/api/events", options: {...} }
// [SSE] Connecting to SSE { url: "...", topics: ["chat", "notifications"] }
// [SSE] SSE connection opened
// [SSE] Event received on topic "chat" { id: "...", text: "..." }
```

### Browser DevTools

**1. Network Tab**
- Look for the SSE request (usually shows as "pending")
- Check Headers: `Content-Type: text/event-stream`
- View EventStream tab to see real-time events

**2. Console**
- With `debug: true`, see all client-side logs
- Look for connection errors

### Server-Side Logging

```typescript
export const GET = ({ locals }) => {
  const userId = locals.user?.id || "anonymous";
  console.log(`[SSE] New connection from user: ${userId}`);

  return produceSSE<TopicsMap>((emit) => {
    console.log(`[SSE] Starting event stream for ${userId}`);
    
    const interval = setInterval(() => {
      console.log(`[SSE] Emitting event to ${userId}`);
      emit("data", { timestamp: Date.now() });
    }, 5000);

    return () => {
      console.log(`[SSE] Connection closed for ${userId}`);
      clearInterval(interval);
    };
  });
};
```

### Common Issues and Solutions

#### ❌ Issue: Connection immediately closes

**Symptoms:**
- `status` transitions from "connecting" to "error" or "idle"
- No events received

**Possible causes:**
1. **Server error before streaming starts**
   ```typescript
   // ❌ BAD: Error before produceSSE
   export const GET = () => {
     throw new Error("Oops"); // Kills connection
     return produceSSE((emit) => { /* ... */ });
   };
   
   // ✅ GOOD: Error handling
   export const GET = () => {
     try {
       validateRequest();
       return produceSSE((emit) => { /* ... */ });
     } catch (error) {
       console.error(error);
       return new Response("Internal Error", { status: 500 });
     }
   };
   ```

2. **Missing return statement**
   ```typescript
   // ❌ BAD: No Response returned
   export const GET = () => {
     produceSSE((emit) => { /* ... */ }); // Missing return!
   };
   
   // ✅ GOOD
   export const GET = () => {
     return produceSSE((emit) => { /* ... */ });
   };
   ```

#### ❌ Issue: No events received

**Symptoms:**
- Connection stays open
- `status === "connected"`
- No data in client

**Possible causes:**
1. **Topic mismatch**
   ```typescript
   // Client subscribes to "message"
   const client = new SSEClient<TopicsMap>("/api/events", {
     topics: {
       message: (data) => console.log(data),
     },
   });
   
   // Server sends "msg" (different name!)
   emit("msg", { text: "Hello" }); // ❌ Won't be received
   
   // Fix: Match topic names
   emit("message", { text: "Hello" }); // ✅
   ```

2. **Client not subscribed to topic**
   ```typescript
   // Client only subscribes to "chat"
   const client = new SSEClient<TopicsMap>("/api/events", {
     topics: {
       chat: (data) => console.log(data),
       // notifications: ... (not subscribed)
     },
   });
   
   // Server sends "notifications" - client ignores it
   emit("notifications", { message: "Hello" }); // Client won't receive
   ```

3. **Server not checking requested topics**
   ```typescript
   // ❌ BAD: Sending all topics regardless of request
   export const GET = () => {
     return produceSSE<TopicsMap>((emit) => {
       // Always sends chat, even if client doesn't want it
       setInterval(() => emit("chat", {...}), 1000);
     });
   };
   
   // ✅ GOOD: Check requested topics
   export const GET = ({ url }) => {
     const topics = url.searchParams.getAll("topics");
     
     return produceSSE<TopicsMap>((emit) => {
       if (topics.includes("chat")) {
         setInterval(() => emit("chat", {...}), 1000);
       }
     });
   };
   ```

#### ❌ Issue: Connection keeps reconnecting

**Symptoms:**
- Constant "connecting" → "connected" → "error" cycle
- Multiple connection attempts in Network tab

**Possible causes:**
1. **Server immediately closing connection**
   ```typescript
   // ❌ BAD: Returns empty cleanup (connection closes immediately)
   return produceSSE((emit) => {
     emit("message", { text: "Hello" });
     return () => {}; // Connection closed after emit!
   });
   
   // ✅ GOOD: Keep connection alive
   return produceSSE((emit) => {
     const interval = setInterval(() => {
       emit("message", { text: "Hello" });
     }, 1000);
     
     return () => clearInterval(interval);
   });
   ```

2. **Server error in emit callback**
   ```typescript
   return produceSSE((emit) => {
     const interval = setInterval(() => {
       // ❌ This throws and kills connection
       const data = null;
       emit("message", { text: data.text });
     }, 1000);
     
     return () => clearInterval(interval);
   });
   
   // ✅ GOOD: Error handling
   return produceSSE((emit) => {
     const interval = setInterval(() => {
       try {
         const data = getData();
         emit("message", { text: data.text });
       } catch (error) {
         console.error("[SSE] Error:", error);
         // Connection stays open
       }
     }, 1000);
     
     return () => clearInterval(interval);
   });
   ```

#### ❌ Issue: Memory leaks

**Symptoms:**
- Server memory usage grows over time
- Slowdown after many connections

**Solution:** Always cleanup resources

```typescript
// ✅ Comprehensive cleanup
export const GET = () => {
  return produceSSE<TopicsMap>((emit) => {
    const intervals: ReturnType<typeof setInterval>[] = [];
    const subscriptions: Array<() => void> = [];
    
    // Track all resources
    const i1 = setInterval(() => emit("data1", {}), 1000);
    const i2 = setInterval(() => emit("data2", {}), 2000);
    intervals.push(i1, i2);
    
    const unsub = eventEmitter.on("event", (data) => emit("event", data));
    subscriptions.push(unsub);
    
    // Clean up EVERYTHING
    return () => {
      intervals.forEach(clearInterval);
      subscriptions.forEach((fn) => fn());
      console.log("[SSE] Cleanup completed");
    };
  });
};
```

#### ❌ Issue: TypeScript errors

**Symptoms:**
- Type errors when calling `emit()`
- `data` parameter has wrong type

**Solution:** Define proper TopicsMap

```typescript
// ❌ BAD: No type safety
const client = new SSEClient<any>("/api/events", {
  topics: {
    message: (data) => console.log(data.text), // No autocomplete
  },
});

// ✅ GOOD: Proper types
interface TopicsMap {
  message: { id: string; text: string };
  notification: { id: string; message: string };
}

const client = new SSEClient<TopicsMap>("/api/events", {
  topics: {
    message: (data) => console.log(data.text), // ✅ Autocomplete works!
  },
});
```

### Testing SSE Endpoints

**Using curl:**
```bash
# Test SSE endpoint
curl -N -H "Accept: text/event-stream" http://localhost:5173/api/events?topics=chat

# You should see:
# : keep-alive
#
# event: chat
# data: {"id":"123","text":"Hello"}
#
```

**Using JavaScript:**
```javascript
// Quick test in browser console
const es = new EventSource("/api/events?topics=chat");
es.addEventListener("chat", (e) => console.log(JSON.parse(e.data)));
es.onerror = (e) => console.error("Error:", e);
```

### Performance Metrics

**Monitor connection health:**

```svelte
<script lang="ts">
  let eventCount = $state(0);
  let lastEventTime = $state<Date | null>(null);
  let avgLatency = $state(0);
  
  const client = new SSEClient<TopicsMap>("/api/events", {
    topics: {
      message: (data) => {
        eventCount++;
        lastEventTime = new Date();
        
        // Calculate latency if timestamp is included
        if ("timestamp" in data) {
          const latency = Date.now() - (data as any).timestamp;
          avgLatency = (avgLatency * (eventCount - 1) + latency) / eventCount;
        }
      },
    },
  });
</script>

<div class="metrics">
  <div>Status: {client.status}</div>
  <div>Events received: {eventCount}</div>
  <div>Last event: {lastEventTime?.toLocaleTimeString() || "N/A"}</div>
  <div>Avg latency: {avgLatency.toFixed(0)}ms</div>
</div>
```

## ❓ Frequently Asked Questions (FAQ)

### General Questions

<details>
<summary><strong>Q: Can I use SSE for bidirectional communication?</strong></summary>

**A:** No, SSE is unidirectional (server → client only). For client → server communication:
- Use regular HTTP POST/PUT requests
- Combine SSE (for receiving) + HTTP (for sending)
- For true bidirectional, consider WebSocket

**Example:**
```typescript
// Receive via SSE
const stream = new SSEClient<TopicsMap>("/api/events", { /* ... */ });

// Send via HTTP POST
async function sendMessage(text: string) {
  await fetch("/api/messages", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
```
</details>

<details>
<summary><strong>Q: How many concurrent SSE connections can I have?</strong></summary>

**A:** 
- **Browser limit:** 6 connections per domain (HTTP/1.1)
- **HTTP/2:** Much higher limit (typically 100+)
- **Server limit:** Depends on server resources

**Best practice:** Use one connection with multiple topics instead of multiple connections.

```typescript
// ❌ BAD: Multiple connections
const chatStream = new SSEClient<{chat: Message}>("/api/chat", ...);
const notifStream = new SSEClient<{notif: Notif}>("/api/notifications", ...);

// ✅ GOOD: One connection, multiple topics
const stream = new SSEClient<{chat: Message, notif: Notif}>("/api/events", {
  topics: {
    chat: (msg) => handleChat(msg),
    notif: (n) => handleNotif(n),
  },
});
```
</details>

<details>
<summary><strong>Q: What happens if the server restarts?</strong></summary>

**A:** The client will automatically:
1. Detect connection loss (`onerror` triggered)
2. Wait `reconnectWait` milliseconds (default: 3000ms)
3. Attempt to reconnect
4. Continue retrying until connection is restored

**Note:** Any server-side state (like session data) will be lost unless persisted to a database.
</details>

<details>
<summary><strong>Q: Can I use SSE with serverless functions?</strong></summary>

**A:** It depends:
- ✅ **Vercel, Netlify:** Yes, but with time limits (10-30 seconds for Hobby plans)
- ✅ **AWS Lambda (with ALB):** Yes, but complex setup
- ❌ **Cloudflare Workers:** Limited support (use Durable Objects)
- ✅ **Traditional servers (Node, Deno):** Full support

For long-lived connections, prefer traditional servers or platforms with SSE support.
</details>

<details>
<summary><strong>Q: How do I handle authentication with SSE?</strong></summary>

**A:** Use cookies or query parameters (cookies are better for security):

```typescript
// Client: cookies are sent automatically
const stream = new SSEClient<TopicsMap>("/api/events", { /* ... */ });

// Server: access via locals or cookies
export const GET = ({ locals, cookies }) => {
  const user = locals.user; // From session middleware
  
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return produceSSE<TopicsMap>((emit) => {
    // Send user-specific events
    subscribeToUserEvents(user.id, emit);
  });
};
```

**Avoid tokens in URL:** They can leak in logs and browser history.
</details>

### Technical Questions

<details>
<summary><strong>Q: How does message replay work on reconnection?</strong></summary>

**A:** The system uses global sequence IDs to track and replay missed messages:

1. **Each message gets a unique sequential ID** when emitted
2. **Client tracks the last ID received** in `lastEventID` state
3. **On reconnect, client sends Last-Event-ID** (header or query param)
4. **Server replays all messages after that ID** from the history buffer

```typescript
// Server automatically assigns IDs
const emitWithHistory = createEmitWithHistory({ sessionID, emit });
emitWithHistory({ event: "chat", data: { text: "Hello" } });
// → Sent with id: 42

// Client receives and tracks
// lastEventID = "42"

// On network drop + reconnect:
// Client: GET /api/events?lastEventID=42
// Server: Replays messages 43, 44, 45...
```

**Benefits:**
- No message loss during brief disconnections
- Deterministic ordering
- Works automatically with browser native reconnection
</details>

<details>
<summary><strong>Q: What is "topic safety" and why does it matter?</strong></summary>

**A:** Topic safety prevents data inconsistency when dynamically changing subscriptions.

**The Problem:**
```typescript
// Connection 1: subscribed to ["chat"]
// Last-Event-ID: 100

// User enables notifications
// Connection 2: subscribed to ["chat", "notifications"]
// If we just replay from ID 100...
// → We'd miss all notifications sent before ID 100!
```

**The Solution:**
Server analyzes which topics are NEW vs. SAFE:
- **Safe topics** (previously subscribed): Replay from Last-Event-ID
- **New topics** (just added): Replay entire history

```typescript
const { safeTopics, newTopics } = analyzeTopicSafety(
  sessionID,
  ["chat", "notifications"] // Current request
);
// safeTopics: ["chat"] → delta replay
// newTopics: ["notifications"] → full replay
```

This ensures you get all notification history even if they were sent while you had them disabled.
</details>

<details>
<summary><strong>Q: How do I dynamically add/remove topics?</strong></summary>

**A:** Use the `updateTopics` method:

```typescript
const stream = new SSEClient<Topics>("/api/events", {
  topics: {
    chat: (msg) => console.log(msg)
  }
});

// Add notifications later
stream.updateTopics({
  addTopics: ["notifications"]
});
// → Closes current connection
// → Opens new with topics=chat,notifications
// → Server replays missed notifications

// Remove chat
stream.updateTopics({
  removeTopics: ["chat"]
});

// Replace all topics
stream.updateTopics({
  nextTopics: {
    logs: (log) => console.log(log)
  }
});
```

The `lastEventID` is automatically preserved across topic changes for intelligent replay.
</details>

<details>
<summary><strong>Q: What are per-topic message counters used for?</strong></summary>

**A:** The `topicCounters` property tracks how many messages were received per topic:

```typescript
const stream = new SSEClient<Topics>("/api/events", {
  topics: {
    chat: (msg) => handleChat(msg),
    notifications: (n) => handleNotification(n)
  }
});

// Access counters reactively
console.log(stream.topicCounters.chat); // 42
console.log(stream.topicCounters.notifications); // 7
```

**Use cases:**
- Show unread counts: "3 new notifications"
- Activity indicators: "127 messages in #general"
- Debug: Verify events are being received
- Analytics: Track topic usage

Example UI:
```svelte
<button>
  Notifications
  {#if stream.topicCounters.notifications > 0}
    <badge>{stream.topicCounters.notifications}</badge>
  {/if}
</button>
```
</details>

<details>
<summary><strong>Q: How large should my history buffer be?</strong></summary>

**A:** It depends on your use case:

**Small buffer (50-100 messages):**
- ✅ Low memory usage
- ✅ Fast replay
- ❌ Only covers brief disconnections (few seconds)

**Large buffer (1000+ messages):**
- ✅ Covers longer disconnections
- ✅ Better user experience
- ❌ Higher memory usage per session

**Best practice:** Use a ring buffer with TTL:

```typescript
const MAX_HISTORY_SIZE = 100;
const MAX_HISTORY_AGE = 5 * 60 * 1000; // 5 minutes

function pushMessage({ sessionID, topic, data }) {
  const session = getSession(sessionID);
  
  // Add message
  session.history.push({
    id: String(globalSequenceID++),
    topic,
    data,
    timestamp: Date.now(),
  });
  
  // Remove old messages (by size)
  if (session.history.length > MAX_HISTORY_SIZE) {
    session.history.shift();
  }
  
  // Remove old messages (by age)
  const now = Date.now();
  session.history = session.history.filter(
    (msg) => now - msg.timestamp < MAX_HISTORY_AGE
  );
}
```

**For production:** Consider persisting to Redis or a database for longer retention.
</details>

<details>
<summary><strong>Q: Can I use SSE across multiple server instances?</strong></summary>

**A:** Yes, but you need centralized state management:

**Problem:** Each server instance has its own memory
- Session A connects to Server 1
- Session A reconnects → load balancer sends to Server 2
- Server 2 has no history for Session A

**Solution 1: Sticky sessions** (load balancer)
```nginx
# Nginx
upstream backend {
  ip_hash; # Routes same IP to same server
  server backend1:3000;
  server backend2:3000;
}
```

**Solution 2: Shared state** (Redis)
```typescript
import { Redis } from "ioredis";
const redis = new Redis();

// Store history in Redis
function pushMessage({ sessionID, topic, data }) {
  const message = {
    id: String(Date.now()),
    topic,
    data,
  };
  
  redis.lpush(`history:${sessionID}`, JSON.stringify(message));
  redis.ltrim(`history:${sessionID}`, 0, 99); // Keep last 100
  redis.expire(`history:${sessionID}`, 300); // 5 min TTL
}

// Retrieve on reconnect
async function getHistory(sessionID: string) {
  const items = await redis.lrange(`history:${sessionID}`, 0, -1);
  return items.map((item) => JSON.parse(item));
}
```

**Solution 3: Pub/Sub** (for live messages)
```typescript
// Server 1 emits event
redis.publish("events:chat", JSON.stringify(message));

// All servers listen
redis.subscribe("events:chat");
redis.on("message", (channel, message) => {
  // Forward to connected clients on this instance
  broadcastToLocalClients(JSON.parse(message));
});
```
</details>

<details>
<summary><strong>Q: What's the difference between SSEClient and EventSource?</strong></summary>

**A:** `SSEClient` is a wrapper around the browser's native `EventSource` API with additional features:
- ✅ Reactive state with Svelte runes ($state)
- ✅ Type-safe topics with TypeScript generics
- ✅ Automatic Last-Event-ID tracking across topic changes
- ✅ Dynamic topic updates (updateTopics method)
- ✅ Per-topic message counters
- ✅ Debug mode with detailed logging
- ✅ URL-based topic subscription

`EventSource` is the low-level browser API that only provides basic SSE functionality.
</details>

<details>
<summary><strong>Q: Can I send binary data with SSE?</strong></summary>

**A:** No, SSE only supports text (UTF-8). For binary data:
- Base64 encode it (increases size by ~33%)
- Use WebSocket instead
- Split into text chunks

```typescript
// ❌ BAD: Binary not supported
emit({ event: "image", data: binaryImageData });

// ✅ OPTION 1: Base64 encode
emit({
  event: "image",
  data: {
    data: Buffer.from(binaryImageData).toString("base64"),
    type: "image/png",
  }
});

// ✅ OPTION 2: Send URL instead
emit({
  event: "image",
  data: {
    url: "/api/images/123.png",
  }
});
```
</details>

<details>
<summary><strong>Q: How do I test SSE locally?</strong></summary>

**A:** Multiple ways:

**1. Browser DevTools:**
- Network tab → EventStream
- See real-time events

**2. curl:**
```bash
curl -N -H "Accept: text/event-stream" http://localhost:5173/api/events
```

**3. Browser console:**
```javascript
const es = new EventSource("/api/events?topics=chat");
es.addEventListener("chat", (e) => console.log(e.data));
```

**4. Enable debug mode:**
```typescript
const client = new SSEClient<TopicsMap>("/api/events", {
  topics: { /* ... */ },
  debug: true, // See all logs
});
```
</details>

<details>
<summary><strong>Q: Can I pause/resume the stream?</strong></summary>

**A:** Not directly, but you can control it:

```typescript
const client = new SSEClient<TopicsMap>("/api/events", {
  autoConnect: false, // Don't connect automatically
  topics: { /* ... */ },
});

// Manually control
function play() {
  client.connect();
}

function pause() {
  client.close();
}
```

**Note:** Closing and reopening creates a new connection.
</details>

<details>
<summary><strong>Q: How do I handle slow clients?</strong></summary>

**A:** The server's `ReadableStream` automatically handles backpressure. If a client is slow:
- Events queue up in memory
- Can lead to memory issues for very slow clients

**Solution:** Implement client timeouts and limits:

```typescript
const MAX_QUEUE_SIZE = 100;
let queueSize = 0;

return produceSSE<TopicsMap>((emit) => {
  const originalEmit = emit;
  
  // Wrapped emit with queue tracking
  const safeEmit: typeof emit = (topic, data) => {
    if (queueSize > MAX_QUEUE_SIZE) {
      console.warn("[SSE] Client too slow, disconnecting");
      return; // Stop sending
    }
    queueSize++;
    originalEmit(topic, data);
    setTimeout(() => queueSize--, 100);
  };
  
  // Use safeEmit instead of emit
});
```
</details>

### Performance Questions

<details>
<summary><strong>Q: What's the overhead of keep-alive pings?</strong></summary>

**A:** Minimal:
- Sent every 15 seconds
- Only 14 bytes (`: keep-alive\n\n`)
- ~0.93 bytes/second

For 1000 concurrent connections: ~930 bytes/second total.
</details>

<details>
<summary><strong>Q: Should I use one SSE connection or multiple?</strong></summary>

**A:** One connection with multiple topics is more efficient:

**One connection:**
- ✅ Lower overhead
- ✅ Avoids browser connection limit
- ✅ Easier to manage

**Multiple connections:**
- ❌ Higher overhead (6x keep-alive pings)
- ❌ Hits browser limit (6 per domain)
- ❌ More complex state management

**Exception:** If topics have very different data rates or lifetimes, separate connections might make sense.
</details>

<details>
<summary><strong>Q: How much memory does each SSE connection use?</strong></summary>

**A:** Depends on:
- Event frequency and size
- Server language/runtime
- Buffering strategy

**Rough estimates:**
- **Node.js:** ~50-100 KB per connection (idle)
- **With active events:** + event data size + buffers

**1000 concurrent connections:** ~50-100 MB (idle) + event data

**Tip:** Monitor your server's memory usage and implement connection limits.
</details>

## 🚀 Deploy

### Vercel

SvelteKit works perfectly on Vercel with SSE, but be aware of time limits:

**Install adapter:**
```bash
pnpm add -D @sveltejs/adapter-vercel
```

**Configure:**
```javascript
// svelte.config.js
import adapter from "@sveltejs/adapter-vercel";

export default {
  kit: {
    adapter: adapter({
      // Function execution time limits
      maxDuration: 60, // Pro plan: up to 900s (15 min)
    }),
  },
};
```

**⚠️ Important notes:**
- **Hobby plan:** 10-second timeout (not suitable for long-lived SSE)
- **Pro plan:** Up to 60 seconds default, 900s max
- **Consider upgrading** for production SSE apps
- **Alternative:** Use Vercel + external WebSocket service for long connections

### Netlify

Similar to Vercel, with function timeout limits:

```bash
pnpm add -D @sveltejs/adapter-netlify
```

```javascript
// svelte.config.js
import adapter from "@sveltejs/adapter-netlify";

export default {
  kit: {
    adapter: adapter(),
  },
};
```

**Limits:**
- **Free:** 10-second timeout
- **Pro:** 26-second timeout (background functions: 15 min)

### Node.js (Self-Hosted or PM2)

**Best option for long-lived SSE connections.**

```bash
pnpm add -D @sveltejs/adapter-node
```

```javascript
// svelte.config.js
import adapter from "@sveltejs/adapter-node";

export default {
  kit: {
    adapter: adapter({
      out: "build",
    }),
  },
};
```

**Build and run:**
```bash
# Build
pnpm build

# Run
node build/index.js

# Or with PM2
pm2 start build/index.js --name sveltekit-sse
```

**Advantages:**
- ✅ No timeout limits
- ✅ Full control
- ✅ Can handle thousands of concurrent connections
- ✅ Works with any VPS (DigitalOcean, AWS EC2, Linode, etc.)

### Docker

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm

# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built files
COPY build ./build
COPY package.json ./

EXPOSE 3000

CMD ["node", "build/index.js"]
```

**Deploy:**
```bash
# Build SvelteKit app
pnpm build

# Build Docker image
docker build -t sveltekit-sse .

# Run container
docker run -p 3000:3000 sveltekit-sse
```

### Cloudflare Pages

⚠️ **Limited SSE support** on edge runtime. Consider alternatives:

**Option 1: Use Durable Objects (advanced)**
```bash
pnpm add -D @sveltejs/adapter-cloudflare
```

**Option 2: Use Workers with WebSocket**
- Cloudflare Workers support WebSocket
- Better for real-time on CF edge

**Option 3: Hybrid approach**
- Static site on CF Pages
- SSE backend on external server

### Railway / Render / Fly.io

These platforms work great with SSE (no time limits):

```bash
pnpm add -D @sveltejs/adapter-node
```

**Railway:**
```bash
railway up
```

**Render:**
```yaml
# render.yaml
services:
  - type: web
    name: sveltekit-sse
    env: node
    buildCommand: pnpm install && pnpm build
    startCommand: node build/index.js
```

**Fly.io:**
```toml
# fly.toml
app = "sveltekit-sse"

[build]
  builder = "paketobuildpacks/builder:base"
  buildpacks = ["gcr.io/paketo-buildpacks/nodejs"]

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]
```

### Environment Variables

```bash
# .env
PUBLIC_API_URL=https://your-domain.com
ORIGIN=https://your-domain.com
```

```typescript
// Access in SvelteKit
import { PUBLIC_API_URL } from "$env/static/public";

const stream = new SSEClient<TopicsMap>(`${PUBLIC_API_URL}/api/events`, {
  // ...
});
```

### Reverse Proxy (Nginx)

If using Nginx in front of your Node.js server:

```nginx
# /etc/nginx/sites-available/sveltekit-sse
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    
    # SSE-specific headers
    proxy_set_header Connection '';
    proxy_set_header Cache-Control 'no-cache';
    proxy_set_header X-Accel-Buffering 'no';
    proxy_buffering off;
    
    # Standard proxy headers
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # Timeouts (important for SSE)
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
  }
}
```

**Key settings for SSE:**
- `proxy_buffering off` — Disable buffering
- `X-Accel-Buffering 'no'` — Disable Nginx buffering
- `Connection ''` — Clear connection header
- `proxy_read_timeout 1h` — Long timeout for SSE

### Monitoring in Production

**Health check endpoint:**
```typescript
// src/routes/api/health/+server.ts
export const GET = () => {
  return new Response(JSON.stringify({
    status: "ok",
    timestamp: new Date().toISOString(),
    activeConnections: getActiveConnectionCount(),
  }), {
    headers: { "Content-Type": "application/json" },
  });
};
```

**Connection monitoring:**
```typescript
// src/lib/server/monitor.ts
let connectionCount = 0;

export function incrementConnections() {
  connectionCount++;
  console.log(`[SSE] Active connections: ${connectionCount}`);
}

export function decrementConnections() {
  connectionCount--;
  console.log(`[SSE] Active connections: ${connectionCount}`);
}

export function getActiveConnectionCount() {
  return connectionCount;
}
```

```typescript
// Use in SSE endpoint
import { incrementConnections, decrementConnections } from "$lib/server/monitor";

export const GET = () => {
  incrementConnections();
  
  return produceSSE<TopicsMap>((emit) => {
    // ...
    
    return () => {
      decrementConnections();
    };
  });
};
```

## 🤝 Contributing

Contributions are welcome! Feel free to:

1. **Fork the project**
2. **Create a feature branch** (`git checkout -b feat/my-feature`)
3. **Commit your changes** (`git commit -m 'feat: add my feature'`)
4. **Push to the branch** (`git push origin feat/my-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow existing code style (Biome)
- Add TypeScript types for new features
- Update README if adding new features
- Test your changes locally

## 📚 Additional Resources

### Official Documentation

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [HTML5 Spec: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SvelteKit Documentation](https://svelte.dev/docs/kit)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/what-are-runes)

### Related Projects

- [sveltekit-superforms](https://github.com/ciscoheat/sveltekit-superforms) — Form handling
- [sveltekit-rate-limiter](https://github.com/ciscoheat/sveltekit-rate-limiter) — Rate limiting
- [lucia-auth](https://github.com/lucia-auth/lucia) — Authentication

### Articles and Tutorials

- [Stream All The Things! by Jake Archibald](https://jakearchibald.com/2016/streams-ftw/)
- [SSE vs WebSocket](https://ably.com/blog/websockets-vs-sse)

### Community

- [Svelte Discord](https://svelte.dev/chat)
- [SvelteKit GitHub Discussions](https://github.com/sveltejs/kit/discussions)

## 🎓 Key Takeaways

### When to Use SSE

✅ **Perfect for:**
- Real-time notifications and alerts
- Live dashboards and metrics
- Activity feeds and timelines
- Progress tracking
- AI streaming responses
- One-way data flow from server to client
- Applications that need message replay on reconnection
- Dynamic topic subscriptions

❌ **Not ideal for:**
- Bidirectional chat (use WebSocket)
- High-frequency updates (>10/second)
- Binary data streaming
- Very old browser support (IE)

### Best Practices Summary

1. **Use one connection with multiple topics** instead of multiple connections
2. **Always implement cleanup functions** to prevent memory leaks
3. **Add authentication and rate limiting** for production
4. **Handle reconnection gracefully** with proper state restoration and message replay
5. **Type your topics** for compile-time safety
6. **Monitor active connections** in production
7. **Use debug mode** during development
8. **Test with slow networks** to ensure resilience
9. **Implement message history** for reliable delivery
10. **Use topic safety analysis** when dynamically changing subscriptions
11. **Track message counters** for activity monitoring
12. **Leverage global sequence IDs** for deterministic replay

### Advanced Features Checklist

When implementing SSE in production, consider these features:

- ✅ **Message replay** — No data loss on reconnection
- ✅ **Topic safety** — Smart handling of dynamic topic changes
- ✅ **Session persistence** — Survive page reloads
- ✅ **Global sequence IDs** — Deterministic message ordering
- ✅ **Ring buffer history** — Configurable message retention
- ✅ **Per-topic counters** — Activity tracking
- ✅ **Dynamic subscriptions** — Add/remove topics at runtime
- ✅ **Keep-alive** — Maintain connection through proxies
- ✅ **Type safety** — Compile-time validation
- ✅ **Debug mode** — Development visibility

### Architecture Patterns

**Simple pattern (single endpoint):**
```
Client → SSE(/api/events?topics=chat,notifications) → Server
```

**Hybrid pattern (SSE + HTTP):**
```
Client ← SSE(/api/events) ← Server (receive)
Client → POST(/api/messages) → Server (send)
```

**Scalable pattern (with pub/sub):**
```
Client ← SSE → App Server ← Redis Pub/Sub → Background Workers
```

**With message replay:**
```
Client (reconnect with Last-Event-ID: 42)
  ↓
Server checks history buffer
  ↓
Replays messages 43, 44, 45...
  ↓
Resumes live stream from 46+
```

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more details.

---

<div align="center">

⭐ **Made with ❤️ by [Gustavo Morinaga](https://gustavomorinaga.dev)**

If you found this project helpful, please consider:  

⭐ Giving it a star on GitHub\
🐦 Sharing it on social media\
💬 Contributing with improvements or bug reports

**Happy coding!** 🚀

</div>
