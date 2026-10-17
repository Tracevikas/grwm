import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const processOutfit = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/process-outfit", async (orig) => ({
  ...(await orig<typeof import("@/lib/process-outfit")>()),
  processOutfit: (...a: unknown[]) => processOutfit(...a),
}));

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

  it("returns the processing summary", async () => {
    processOutfit.mockResolvedValue({ items: 3, created: 1, matched: 2 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: 3, created: 1, matched: 2 });
    expect(processOutfit).toHaveBeenCalledWith("client", "o1");
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
