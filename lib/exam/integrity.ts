import type { ClientIntegrityEvent, IntegrityEventType } from "./types";

export const INTEGRITY_EVENT_TYPES: IntegrityEventType[] = [
  "tab_hidden",
  "window_blur",
  "fullscreen_exit",
];

/** The most events one request may carry, and the most one attempt keeps (counts keep going past it). */
export const MAX_EVENTS_PER_REQUEST = 100;
export const MAX_STORED_EVENTS = 500;

/** An event as the server stores it. `at` is the server's clock when it arrived; `clientAt` is only context. */
export interface StoredIntegrityEvent {
  seq: number;
  type: IntegrityEventType;
  at: number;
  clientAt: number;
}

export interface IntegrityState {
  events: StoredIntegrityEvent[];
  /** The highest sequence number accepted so far, so a resent event is never counted twice. */
  eventSeq: number;
  tabSwitches: number;
  blurs: number;
  fullscreenExits: number;
}

const isType = (value: unknown): value is IntegrityEventType =>
  INTEGRITY_EVENT_TYPES.includes(value as IntegrityEventType);

/**
 * Adds the events a browser reports to an attempt's record. The counts come from the events themselves
 * (never from a number the browser sends), every event is stamped with the server's time, and one that
 * was already accepted (a retry after a dropped connection) is ignored. Anything malformed is skipped.
 */
export function applyEvents(
  state: IntegrityState,
  raw: unknown,
  now: number
): IntegrityState {
  if (!Array.isArray(raw)) return state;

  const incoming = raw
    .slice(0, MAX_EVENTS_PER_REQUEST)
    .filter(
      (event): event is ClientIntegrityEvent =>
        !!event &&
        typeof event === "object" &&
        Number.isInteger((event as ClientIntegrityEvent).seq) &&
        isType((event as ClientIntegrityEvent).type)
    )
    .sort((a, b) => a.seq - b.seq);

  const next: IntegrityState = { ...state, events: [...state.events] };
  for (const event of incoming) {
    if (event.seq <= next.eventSeq) continue;
    next.eventSeq = event.seq;
    if (event.type === "tab_hidden") next.tabSwitches++;
    else if (event.type === "window_blur") next.blurs++;
    else next.fullscreenExits++;

    if (next.events.length < MAX_STORED_EVENTS) {
      next.events.push({
        seq: event.seq,
        type: event.type,
        at: now,
        clientAt: Number.isFinite(event.at) ? event.at : 0,
      });
    }
  }
  return next;
}
