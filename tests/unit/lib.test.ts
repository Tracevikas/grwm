import { describe, expect, it } from "vitest";
import { formatDate, signPhotos } from "@/lib/photos";
import { withCoverPhotos } from "@/lib/queries";
import type { WardrobeItem } from "@/lib/types";
import { fakeSupabase } from "./fake-supabase";

describe("signPhotos", () => {
  it("signs each unique path once, in one request", async () => {
    const { client, storage } = fakeSupabase();
    const urls = await signPhotos(client as never, ["a.jpg", "b.jpg", "a.jpg", ""]);
    expect(storage.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(storage.createSignedUrls).toHaveBeenCalledWith(["a.jpg", "b.jpg"], 3600);
    expect(urls).toEqual({ "a.jpg": "https://signed/a.jpg", "b.jpg": "https://signed/b.jpg" });
  });

  it("skips the request when there is nothing to sign", async () => {
    const { client, storage } = fakeSupabase();
    expect(await signPhotos(client as never, [])).toEqual({});
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe("formatDate", () => {
  it("formats a date-only string without shifting the day across timezones", () => {
    expect(formatDate("2026-10-17")).toMatch(/17/);
    expect(formatDate("2026-01-01")).toMatch(/1/);
    expect(formatDate("2026-01-01")).not.toMatch(/31/);
  });
});

describe("withCoverPhotos", () => {
  const item = (id: string, cover: string | null) => ({ id, cover_outfit_id: cover }) as WardrobeItem;

  it("attaches each item's signed cover photo and dimensions", async () => {
    const { client, calls } = fakeSupabase(() => ({
      data: [{ id: "o1", photo_path: "u/1.jpg", photo_w: 900, photo_h: 1600 }],
    }));
    const [a, b] = await withCoverPhotos(client as never, [item("a", "o1"), item("b", null)]);

    expect(a.photo).toEqual({ url: "https://signed/u/1.jpg", w: 900, h: 1600 });
    expect(b.photo).toBeNull();
    expect(calls[0].filters).toContainEqual(["in", "id", ["o1"]]);
  });

  it("does not query when no item has a cover", async () => {
    const { client, calls } = fakeSupabase();
    const out = await withCoverPhotos(client as never, [item("a", null)]);
    expect(out[0].photo).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
