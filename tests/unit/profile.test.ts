import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { callsTo, fakeSupabase } from "./fake-supabase";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("REDIRECT"), { url });
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

let fake = fakeSupabase();
let user: { id: string } | null = { id: "u1" };
vi.mock("@/lib/supabase/server", () => ({ getUser: async () => ({ supabase: fake.client, user }) }));

import { deleteMyAccount, deleteMyData, updateName } from "@/app/(app)/profile/actions";
import { currentStreak, deleteAllUserData, initials, listUserFiles, profileOf } from "@/lib/profile";

const form = (name: string) => {
  const fd = new FormData();
  fd.set("name", name);
  return fd;
};

describe("profileOf", () => {
  it("uses Google's name and picture when present", () => {
    const p = profileOf({
      email: "riya@example.com",
      created_at: "2026-10-01T00:00:00Z",
      user_metadata: { full_name: "Riya Sharma", avatar_url: "https://lh3/x.jpg" },
      app_metadata: { provider: "google" },
    } as unknown as User);
    expect(p).toMatchObject({ name: "Riya Sharma", avatarUrl: "https://lh3/x.jpg", provider: "google" });
  });

  it("falls back to the email name for email-link accounts", () => {
    const p = profileOf({ email: "vikas.k@example.com", created_at: "", user_metadata: {}, app_metadata: {} } as unknown as User);
    expect(p).toMatchObject({ name: "vikas.k", avatarUrl: null, provider: "email" });
  });
});

describe("initials", () => {
  it.each([
    ["Riya Sharma", "RS"],
    ["vikas.kushwaha", "VK"],
    ["Madonna", "M"],
    ["", "?"],
  ])("%s → %s", (name, out) => expect(initials(name)).toBe(out));
});

describe("currentStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(currentStreak(["2026-10-17", "2026-10-16", "2026-10-15", "2026-10-12"], "2026-10-17")).toBe(3);
  });

  it("still counts yesterday's streak until today is logged", () => {
    expect(currentStreak(["2026-10-16", "2026-10-15"], "2026-10-17")).toBe(2);
  });

  it("is zero after a missed day", () => {
    expect(currentStreak(["2026-10-14"], "2026-10-17")).toBe(0);
  });

  it("crosses month boundaries", () => {
    expect(currentStreak(["2026-11-01", "2026-10-31", "2026-10-30"], "2026-11-01")).toBe(3);
  });
});

describe("deleting your data", () => {
  beforeEach(() => {
    fake = fakeSupabase();
    user = { id: "u1" };
    fake.storage.list.mockImplementation(async (folder: unknown) => ({
      data:
        folder === "u1"
          ? [{ id: "1", name: "a.jpg" }, { id: null, name: "cutouts" }, { id: null, name: "looks" }]
          : folder === "u1/cutouts"
            ? [{ id: "2", name: "shirt.webp" }]
            : [{ id: "3", name: "o1.webp" }],
      error: null,
    }));
  });

  it("lists photos, cut-outs and looks, skipping folder entries", async () => {
    expect(await listUserFiles(fake.client as never, "u1")).toEqual(["u1/a.jpg", "u1/cutouts/shirt.webp", "u1/looks/o1.webp"]);
  });

  it("deletes only the user's rows and files", async () => {
    await deleteAllUserData(fake.client as never, "u1");
    expect(callsTo(fake.calls, "outfits", "delete")[0].filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(callsTo(fake.calls, "wardrobe_items", "delete")[0].filters).toContainEqual(["eq", "user_id", "u1"]);
    expect(fake.storage.remove).toHaveBeenCalledWith(["u1/a.jpg", "u1/cutouts/shirt.webp", "u1/looks/o1.webp"]);
  });

  it("deleteMyData wipes everything and returns to an empty wardrobe", async () => {
    await expect(deleteMyData()).rejects.toMatchObject({ url: "/" });
    expect(fake.client.rpc).not.toHaveBeenCalled();
  });

  it("deleteMyAccount wipes the data, deletes the account and signs out", async () => {
    await expect(deleteMyAccount()).rejects.toMatchObject({ url: "/login" });
    expect(fake.client.rpc).toHaveBeenCalledWith("delete_my_account");
    expect(fake.client.auth.signOut).toHaveBeenCalled();
  });

  it("explains the migration when the delete function is missing", async () => {
    fake.client.rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.delete_my_account" } });
    await expect(deleteMyAccount()).resolves.toMatchObject({ error: expect.stringContaining("004_delete_account.sql") });
    expect(fake.client.auth.signOut).not.toHaveBeenCalled();
  });

  it("sends signed-out users to login", async () => {
    user = null;
    await expect(deleteMyData()).rejects.toMatchObject({ url: "/login" });
  });
});

describe("updateName", () => {
  beforeEach(() => {
    fake = fakeSupabase();
    user = { id: "u1" };
  });

  it("saves a trimmed display name to the account", async () => {
    await expect(updateName({}, form("  Riya  "))).resolves.toEqual({ saved: true });
    expect(fake.client.auth.updateUser).toHaveBeenCalledWith({ data: { full_name: "Riya" } });
  });

  it("rejects an empty name", async () => {
    await expect(updateName({}, form("   "))).resolves.toEqual({ error: "Enter a name." });
    expect(fake.client.auth.updateUser).not.toHaveBeenCalled();
  });
});
