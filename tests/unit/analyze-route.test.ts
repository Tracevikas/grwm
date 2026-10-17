import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const processOutfit = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/process-outfit", async (orig) => ({
  ...(await orig<typeof import("@/lib/process-outfit")>()),
  processOutfit: (...a: unknown[]) => processOutfit(...a),
}));

const scheduled: (() => unknown)[] = [];
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => scheduled.push(fn),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
const makeOutfitLook = vi.fn();
vi.mock("@/lib/outfit-look", () => ({ makeOutfitLook: (...a: unknown[]) => makeOutfitLook(...a) }));

import { POST } from "@/app/api/outfits/[id]/analyze/route";
import { OutfitError } from "@/lib/process-outfit";

const ctx = { params: Promise.resolve({ id: "o1" }) } as never;
const call = () => POST(new Request("http://x/api/outfits/o1/analyze", { method: "POST" }), ctx);

describe("POST /api/outfits/[id]/analyze", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ supabase: "client", user: { id: "u1" } });
    processOutfit.mockReset();
  });

  it("rejects signed-out requests", async () => {
    getUser.mockResolvedValue({ supabase: "client", user: null });
    const res = await call();
    expect(res.status).toBe(401);
    expect(processOutfit).not.toHaveBeenCalled();
  });

  it("returns the processing summary, then draws the look after responding", async () => {
    scheduled.length = 0;
    processOutfit.mockResolvedValue({ items: 3, created: 1, matched: 2 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: 3, created: 1, matched: 2, look: "pending" });
    expect(processOutfit).toHaveBeenCalledWith("client", "o1");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    // Not started before the response…
    expect(makeOutfitLook).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    // …but scheduled to run once it has gone out.
    scheduled[0]();
    expect(makeOutfitLook).toHaveBeenCalledWith("client", "o1");
  });

  it("doesn't draw a look when the analysis failed", async () => {
    scheduled.length = 0;
    processOutfit.mockRejectedValue(new OutfitError("No outfit found", 422));
    await call();
    expect(scheduled).toHaveLength(0);
  });

  it("maps OutfitError to its status code", async () => {
    processOutfit.mockRejectedValue(new OutfitError("No outfit found", 422));
    const res = await call();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No outfit found" });
  });

  it("returns 500 for unexpected errors", async () => {
    processOutfit.mockRejectedValue(new Error("boom"));
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});
