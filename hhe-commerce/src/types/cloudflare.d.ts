interface D1Result<T = unknown> { results?: T[]; success: boolean; meta?: unknown; error?: string; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(column?: string): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface Message<T = unknown> { body: T; ack(): void; retry(options?: { delaySeconds?: number }): void; attempts: number; }
interface MessageBatch<T = unknown> { messages: Message<T>[]; queue: string; }
interface Queue<T = unknown> { send(message: T, options?: { delaySeconds?: number }): Promise<void>; }
interface ScheduledController { scheduledTime: number; cron: string; }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; }
