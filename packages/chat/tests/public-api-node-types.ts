import {
  createChatServer,
  type ChatServerOptions,
} from "@rpgjs/chat";

const serverOptions: ChatServerOptions = {
  maxLength: 320,
};

void createChatServer(serverOptions);

// @ts-expect-error The Node root must not expose client-only options.
type NodeClientOptions = import("@rpgjs/chat").ChatClientOptions;
