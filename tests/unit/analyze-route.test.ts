import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const processOutfit = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getUser: () => getUser() }));
vi.mock("@/lib/process-outfit", async (orig) => ({
  ...(await orig<typeof import("@/lib/process-outfit")>()),
  processOutfit: (...a: unknown[]) => processOutfit(...a),
}));
const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
const makeOutfitLook = vi.fn();
vi.mock("@/lib/outfit-look", () => ({ makeOutfitLook: (...a: unknown[]) => makeOutfitLook(...a) }));
const signPhotos = vi.fn();
vi.mock("@/lib/photos", async (orig) => ({
  ...(await orig<typeof import("@/lib/photos")>()),
  signPhotos: (...a: unknown[]) => signPhotos(...a),
}));

import { POST as analyze } from "@/app/api/outfits/[id]/analyze/route";
import { POST as look } from "@/app/api/outfits/[id]/look/route";
import { OutfitError } from "@/lib/process-outfit";

const ctx = { params: Promise.resolve({ id: "o1" }) } as never;
const callAnalyze = () => analyze(new Request("http://x/api/outfits/o1/analyze", { method: "POST" }), ctx);
const callLook = () => look(new Request("http://x/api/outfits/o1/look", { method: "POST" }), ctx);

describe("POST /api/outfits/[id]/analyze", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ supabase: "client", user: { id: "u1" } });
    processOutfit.mockReset();
    makeOutfitLook.mockReset();
  });

  it("rejects signed-out requests", async () => {
    getUser.mockResolvedValue({ supabase: "client", user: null });
    const res = await callAnalyze();
    expect(res.status).toBe(401);
    expect(processOutfit).not.toHaveBeenCalled();
  });

  it("returns the processing summary and refreshes every page", async () => {
    processOutfit.mockResolvedValue({ items: 3, created: 1, matched: 2 });
    const res = await callAnalyze();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: 3, created: 1, matched: 2 });
    expect(processOutfit).toHaveBeenCalledWith("client", "o1");
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    // The clean look is its own step, requested by the client right after.
    expect(makeOutfitLook).not.toHaveBeenCalled();
  });

  it("maps OutfitError to its status code", async () => {
    processOutfit.mockRejectedValue(new OutfitError("No outfit found", 422));
    const res = await callAnalyze();
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "No outfit found" });
  });

  it("returns 500 for unexpected errors", async () => {
    processOutfit.mockRejectedValue(new Error("boom"));
    const res = await callAnalyze();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "boom" });
  });
});

describe("POST /api/outfits/[id]/look", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ supabase: "client", user: { id: "u1" } });
    makeOutfitLook.mockReset();
    signPhotos.mockReset();
  });

  it("draws the look before responding and returns its URL", async () => {
    makeOutfitLook.mockResolvedValue("u1/looks/o1-ab.webp");
    signPhotos.mockResolvedValue({ "u1/looks/o1-ab.webp": "https://signed/look" });

    const res = await callLook();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ lookUrl: "https://signed/look" });
    expect(makeOutfitLook).toHaveBeenCalledWith("client", "o1");
  });

  it("reports when the look couldn't be drawn", async () => {
    makeOutfitLook.mockResolvedValue(null);
    const res = await callLook();
    expect(res.status).toBe(502);
  });

  it("rejects signed-out requests", async () => {
    getUser.mockResolvedValue({ supabase: "client", user: null });
    expect((await callLook()).status).toBe(401);
    expect(makeOutfitLook).not.toHaveBeenCalled();
  });
});
