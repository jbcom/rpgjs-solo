export function normalizeStandaloneMessage(event: unknown): any {
  const raw = event && typeof event === "object" && "data" in event
    ? (event as MessageEvent).data
    : event;

  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
