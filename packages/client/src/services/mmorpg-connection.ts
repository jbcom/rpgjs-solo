export function parseSocketMessage(data: any) {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data);
  }
  catch {
    return undefined;
  }
}

export function isNativeSocketEvent(event: string) {
  return event === "open" || event === "close" || event === "error";
}

export function waitForRpgjsConnected(
  conn: any,
  timeoutMs = 10000,
  options: { ignoreCleanClose?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeoutId: number | undefined;

    const cleanup = () => {
      conn.removeEventListener("message", onMessage);
      conn.removeEventListener("close", onClose);
      conn.removeEventListener("error", onError);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
    const rejectWith = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onMessage = (event: MessageEvent) => {
      const data = parseSocketMessage(event.data);
      if (data?.type !== "connected") {
        return;
      }
      cleanup();
      resolve();
    };
    const onClose = (event: CloseEvent) => {
      const rawReason: unknown = (event as any).reason;
      if (
        options.ignoreCleanClose
        && (event.code === 1000 || rawReason instanceof Event || typeof rawReason !== "string")
      ) {
        return;
      }
      const reason = typeof rawReason === "string" && rawReason
        ? rawReason
        : "WebSocket closed before RPGJS connection was accepted";
      rejectWith(new Error(reason));
    };
    const onError = (event: ErrorEvent) => {
      rejectWith(new Error(event.message || "WebSocket connection failed"));
    };

    conn.addEventListener("message", onMessage);
    conn.addEventListener("close", onClose);
    conn.addEventListener("error", onError);
    timeoutId = window.setTimeout(() => {
      rejectWith(new Error("RPGJS connection timeout"));
    }, timeoutMs);
  });
}
