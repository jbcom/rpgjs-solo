import {
  sendChatMessage,
  type ChatClientOptions,
} from "@rpgjs/chat";

const clientOptions: ChatClientOptions = {
  maxLength: 320,
};

void clientOptions;
void sendChatMessage("Hello");

// @ts-expect-error The browser root must not expose server-only options.
type BrowserServerOptions = import("@rpgjs/chat").ChatServerOptions;
