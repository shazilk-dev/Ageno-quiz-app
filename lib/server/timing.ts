/**
 * Where a request's time went, as a `Server-Timing` header (`auth;dur=12.3, db;dur=40.1, total;dur=55.0`).
 * The browser shows it in the Network tab under "Timing", so slow steps can be found in production without
 * any logging service. Names are generic on purpose: the header is visible to anyone.
 */
export class ServerTiming {
  private readonly started = performance.now();
  private readonly spans: string[] = [];

  /** Awaits `work` and records how long it took under `name`, whether it succeeds or throws. */
  async time<T>(name: string, work: Promise<T> | (() => Promise<T>)): Promise<T> {
    const start = performance.now();
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      this.spans.push(`${name};dur=${(performance.now() - start).toFixed(1)}`);
    }
  }

  header(): string {
    return [...this.spans, `total;dur=${(performance.now() - this.started).toFixed(1)}`].join(", ");
  }

  /** Adds the header to a response and returns it. */
  apply<R extends Response>(response: R): R {
    response.headers.set("Server-Timing", this.header());
    return response;
  }
}
