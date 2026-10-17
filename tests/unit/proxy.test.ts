import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let user: { id: string } | null = null;
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

import { config, proxy } from "@/proxy";

const run = (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));
const location = (res: Response) => res.headers.get("location");

describe("proxy (auth gate)", () => {
  beforeEach(() => {
    user = null;
  });

  it.each(["/", "/log", "/outfits", "/items/abc"])("redirects signed-out visitors from %s to /login", async (path) => {
    expect(location(await run(path))).toBe("http://localhost:3000/login");
  });

  it.each(["/login", "/auth/callback?code=x", "/api/outfits/o1/analyze"])("lets signed-out visitors reach %s", async (path) => {
    expect(location(await run(path))).toBeNull();
  });

  it("lets signed-in users through", async () => {
    user = { id: "u1" };
    expect(location(await run("/outfits"))).toBeNull();
  });

  it("bounces signed-in users away from /login", async () => {
    user = { id: "u1" };
    expect(location(await run("/login"))).toBe("http://localhost:3000/");
  });

  it("does not run on static assets", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/icon.svg")).toBe(false);
    expect(re.test("/manifest.webmanifest")).toBe(false);
    expect(re.test("/outfits")).toBe(true);
  });
});
