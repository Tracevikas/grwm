import { vi } from "vitest";

/** One recorded call made through the fake client's query builder. */
export type Call = {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  payload?: unknown;
  filters: [string, string, unknown][];
  single: boolean;
};

export type Result = { data?: unknown; error?: { message: string } | null; count?: number };
type Handler = (call: Call) => Result | undefined;

/**
 * Minimal chainable stand-in for a Supabase client. Every query is recorded in
 * `calls`, and `handler` decides what each one returns.
 */
export function fakeSupabase(handler: Handler = () => undefined) {
  const calls: Call[] = [];

  const from = (table: string) => {
    const call: Call = { table, action: "select", filters: [], single: false };
    const builder: Record<string, unknown> = {};
    const chain = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
      fn(...args);
      return builder;
    };

    Object.assign(builder, {
      select: chain(() => {}),
      insert: chain((p) => Object.assign(call, { action: "insert", payload: p })),
      update: chain((p) => Object.assign(call, { action: "update", payload: p })),
      upsert: chain((p) => Object.assign(call, { action: "upsert", payload: p })),
      delete: chain(() => Object.assign(call, { action: "delete" })),
      eq: chain((col, val) => call.filters.push(["eq", col as string, val])),
      neq: chain((col, val) => call.filters.push(["neq", col as string, val])),
      in: chain((col, val) => call.filters.push(["in", col as string, val])),
      is: chain((col, val) => call.filters.push(["is", col as string, val])),
      or: chain((expr) => call.filters.push(["or", "", expr])),
      order: chain(() => {}),
      limit: chain(() => {}),
      single: chain(() => (call.single = true)),
      then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) => {
        calls.push(call);
        try {
          return Promise.resolve(resolve({ data: null, error: null, ...handler(call) }));
        } catch (e) {
          return Promise.resolve(reject(e));
        }
      },
    });
    return builder;
  };

  const storageBucket = {
    download: vi.fn(async () => ({
      data: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }),
      error: null,
    })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    upload: vi.fn(async () => ({ data: {}, error: null })),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}` })),
      error: null,
    })),
  };

  const client = {
    from: vi.fn(from),
    storage: { from: vi.fn(() => storageBucket) },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null as { message: string; status?: number } | null })),
      verifyOtp: vi.fn(async () => ({ data: {}, error: null as { message: string } | null })),
      signInWithOAuth: vi.fn(async () => ({
        data: { url: "https://test.supabase.co/auth/v1/authorize?provider=google" as string | null },
        error: null as { message: string } | null,
      })),
      signOut: vi.fn(async () => ({ error: null })),
      exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    },
  };

  return { client, calls, storage: storageBucket };
}

export const callsTo = (calls: Call[], table: string, action?: Call["action"]) =>
  calls.filter((c) => c.table === table && (!action || c.action === action));
