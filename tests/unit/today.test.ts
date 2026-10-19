import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "./fake-supabase";

const parse = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { parse } };
  },
}));
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ getUser: () => getUser() }));

import { POST } from "@/app/api/today/route";
import { conditionFromCode, feelOf } from "@/lib/weather";

const wardrobe = [
  { id: "t1", name: "White tee", category: "top", colors: ["white"], style: "casual", seasons: [], times_worn: 3, last_worn: "2026-10-01" },
  { id: "b1", name: "Blue jeans", category: "bottom", colors: ["blue"], style: "casual", seasons: [], times_worn: 1, last_worn: null },
];

const body = { weather: { tempC: 14, condition: "rainy" }, mood: "cozy", occasion: "work", today: "2026-10-19" };
const call = (b: unknown) => POST(new Request("http://x/api/today", { method: "POST", body: JSON.stringify(b) }));
const answer = (parsed: unknown) => parse.mockResolvedValue({ choices: [{ message: { parsed } }] });

describe("POST /api/today", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ supabase: fakeSupabase(() => ({ data: wardrobe })).client, user: { id: "u1" } });
  });

  it("needs a signed-in user", async () => {
    getUser.mockResolvedValue({ supabase: fakeSupabase().client, user: null });
    expect((await call(body)).status).toBe(401);
  });

  it("rejects a malformed request", async () => {
    expect((await call({ ...body, mood: "grumpy" })).status).toBe(400);
  });

  it("asks for more pieces when the wardrobe is too small", async () => {
    getUser.mockResolvedValue({ supabase: fakeSupabase(() => ({ data: [wardrobe[0]] })).client, user: { id: "u1" } });
    expect((await call(body)).status).toBe(422);
  });

  it("returns the pick with only real, distinct pieces", async () => {
    answer({ title: "Rainy desk day", item_ids: ["t1", "b1", "t1", "made-up"], reason: "Warm and dry." });
    const res = await call(body);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: "Rainy desk day", item_ids: ["t1", "b1"], reason: "Warm and dry." });

    const prompt = parse.mock.calls[0][0].messages[1].content as string;
    expect(prompt).toContain("14°C, rainy");
    expect(prompt).toContain("Mood: cozy. Occasion: work.");
  });

  it("names the pieces to move away from on a re-roll", async () => {
    answer({ title: "Another", item_ids: ["b1"], reason: "Fresh." });
    await call({ ...body, avoid: ["t1"] });
    expect(parse.mock.calls[0][0].messages[1].content).toContain("They just saw a look with White tee");
  });

  it("reports a stylist failure as 502", async () => {
    parse.mockRejectedValue(new Error("boom"));
    expect((await call(body)).status).toBe(502);
  });
});

describe("weather", () => {
  it("maps WMO codes to conditions", () => {
    expect(conditionFromCode(0)).toBe("sunny");
    expect(conditionFromCode(3)).toBe("cloudy");
    expect(conditionFromCode(61)).toBe("rainy");
    expect(conditionFromCode(95)).toBe("rainy");
    expect(conditionFromCode(73)).toBe("snowy");
    expect(conditionFromCode(2, 40)).toBe("windy");
  });

  it("describes how a temperature feels", () => {
    expect(feelOf(2)).toBe("Cold");
    expect(feelOf(18)).toBe("Mild");
    expect(feelOf(30)).toBe("Hot");
  });
});
