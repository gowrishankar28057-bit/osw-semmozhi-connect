type Action = "join" | "heartbeat" | "leave";
type Connection = {
  id: string;
  ready: boolean;
  pending: boolean;
  tail: Promise<void>;
};

/** One connection per confirmed Jitsi join; requests stay ordered per connection. */
export class BrowserPresence {
  private current: Connection | null = null;
  private pending = new Set<Promise<void>>();

  constructor(
    private send: (action: Action, connectionId: string) => Promise<unknown>,
    private report: (error: string) => void,
    private newId = () => crypto.randomUUID() as string,
  ) {}

  join() {
    if (this.current) return;
    const connection: Connection = {
      id: this.newId(),
      ready: false,
      pending: false,
      tail: Promise.resolve(),
    };
    this.current = connection;
    this.record(connection, "join");
  }

  heartbeat() {
    const connection = this.current;
    if (!connection || connection.pending) return;
    // Retry a failed initial join before sending any heartbeat.
    this.record(connection, connection.ready ? "heartbeat" : "join");
  }

  leave() {
    const connection = this.current;
    if (!connection) return;
    this.current = null;
    this.record(connection, "leave");
  }

  private record(connection: Connection, action: Action) {
    connection.pending = true;
    const request = connection.tail.then(async () => {
      try {
        await this.send(action, connection.id);
        if (action === "join") connection.ready = true;
        if (this.current === connection) this.report("");
      } catch (error) {
        if (this.current !== connection) return;
        const code = (error as { code?: string } | null)?.code;
        if (code === "PRESENCE_EXPIRED" || code === "PRESENCE_MISSING") {
          this.current = null;
          this.join();
        } else {
          this.report(
            error instanceof Error
              ? error.message
              : "Attendance connection failed.",
          );
        }
      } finally {
        connection.pending = false;
      }
    });
    connection.tail = request;
    this.pending.add(request);
    void request.finally(() => this.pending.delete(request));
  }

  async settled() {
    while (this.pending.size) await Promise.all(this.pending);
  }
}
