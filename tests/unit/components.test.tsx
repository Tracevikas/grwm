import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(search),
}));
const sendCode = vi.fn(async (_prev: unknown, fd: FormData) => ({ email: String(fd.get("email")) }));
const verifyCode = vi.fn(async (_prev: unknown, fd: FormData) => ({ error: "That code is wrong or has expired.", email: String(fd.get("email")) }));
vi.mock("@/app/login/actions", () => ({
  sendCode: (p: unknown, fd: FormData) => sendCode(p, fd),
  verifyCode: (p: unknown, fd: FormData) => verifyCode(p, fd),
  signInWithGoogle: vi.fn(),
}));

import { BottomNav } from "@/components/BottomNav";
import { CropImage, cropStyle } from "@/components/CropImage";
import { GarmentImage } from "@/components/GarmentImage";
import { ItemCard } from "@/components/ItemCard";
import { WornAgo, wornAgo } from "@/components/WornAgo";
import LoginPage from "@/app/login/page";
import type { ItemWithPhoto } from "@/lib/queries";

describe("cropStyle", () => {
  it("scales and positions the photo so only the box shows", () => {
    const s = cropStyle("p.jpg", { x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 1000, 1000);
    expect(s.backgroundSize).toBe("200% 400%");
    // x / (1 - w) = 0.25 / 0.5 → 50%, y / (1 - h) = 0.5 / 0.75 → 66.67%
    expect(s.backgroundPosition).toMatch(/^50% 66\.66/);
    expect(s.aspectRatio).toBe("2");
    expect(s.width).toBe("100%");
  });

  it("keeps tall crops tall using the photo's real pixel size", () => {
    const s = cropStyle("p.jpg", { x: 0, y: 0, w: 0.5, h: 0.5 }, 900, 1600);
    expect(Number(s.aspectRatio)).toBeCloseTo(0.5625);
    expect(s.height).toBe("100%");
    expect(s.width).toBe("auto");
  });

  it("shows the whole photo when there is no box", () => {
    const s = cropStyle("p.jpg", null, 800, 800);
    expect(s.backgroundSize).toBe("100% 100%");
    expect(s.backgroundPosition).toBe("0% 0%");
  });
});

describe("CropImage", () => {
  it("renders an accessible cropped image", () => {
    render(<CropImage src="https://x/p.jpg" box={null} photoW={1} photoH={1} alt="Blue jeans" />);
    expect(screen.getByRole("img", { name: "Blue jeans" })).toHaveStyle({ backgroundImage: 'url("https://x/p.jpg")' });
  });

  it("shows a placeholder without a photo", () => {
    render(<CropImage src={undefined} box={null} photoW={1} photoH={1} alt="x" />);
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });
});

describe("GarmentImage", () => {
  const props = { photoUrl: "https://x/photo.jpg", box: null, photoW: 900, photoH: 1600, alt: "Linen shirt" };

  it("shows the transparent cut-out when there is one", () => {
    render(<GarmentImage {...props} cutoutUrl="https://x/cut.png" />);
    expect(screen.getByRole("img", { name: "Linen shirt" })).toHaveAttribute("src", "https://x/cut.png");
  });

  it("falls back to the crop of the outfit photo", () => {
    render(<GarmentImage {...props} />);
    expect(screen.getByRole("img", { name: "Linen shirt" })).toHaveStyle({ backgroundImage: 'url("https://x/photo.jpg")' });
  });
});

describe("wornAgo", () => {
  const now = new Date(2026, 9, 17, 15, 30);
  it.each([
    [null, "never worn"],
    ["2026-10-17", "worn today"],
    ["2026-10-16", "worn yesterday"],
    ["2026-10-10", "worn 7 days ago"],
    ["2026-10-20", "worn today"],
  ])("%s → %s", (iso, label) => {
    expect(wornAgo(iso, now)).toBe(label);
  });

  it("renders in the component", () => {
    render(<WornAgo date={null} />);
    expect(screen.getByText("never worn")).toBeInTheDocument();
  });
});

describe("ItemCard", () => {
  const base = {
    id: "i1",
    name: "Olive bomber",
    colors: ["olive", "black"],
    cover_box: null,
    photo: { url: "https://x/p.jpg", w: 900, h: 1600 },
  };

  it("links to the item and shows name, wear count and colour dots", () => {
    render(<ItemCard item={{ ...base, times_worn: 4, last_worn: "2020-01-01" } as ItemWithPhoto} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/items/i1");
    expect(screen.getByText("Olive bomber")).toBeInTheDocument();
    expect(screen.getByText(/4 wears/)).toBeInTheDocument();
    expect(screen.getByTitle("olive")).toBeInTheDocument();
  });

  it("says 'Not worn yet' instead of zero counts", () => {
    render(<ItemCard item={{ ...base, times_worn: 0, last_worn: null } as ItemWithPhoto} />);
    expect(screen.getByText("Not worn yet")).toBeInTheDocument();
  });
});

describe("BottomNav", () => {
  beforeEach(() => {
    pathname = "/";
  });

  it("has wardrobe, log and diary links", () => {
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Wardrobe" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Log outfit" })).toHaveAttribute("href", "/log");
    expect(screen.getByRole("link", { name: "Diary" })).toHaveAttribute("href", "/outfits");
  });

  it("marks Wardrobe current on item pages and Diary on outfit pages", () => {
    pathname = "/items/abc";
    const { unmount } = render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Wardrobe" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Diary" })).not.toHaveAttribute("aria-current");
    unmount();

    pathname = "/outfits/o1";
    render(<BottomNav />);
    expect(screen.getByRole("link", { name: "Diary" })).toHaveAttribute("aria-current", "page");
  });
});

describe("LoginPage", () => {
  beforeEach(() => {
    search = "";
  });

  it("offers Google and an emailed code, with no password", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a sign-in code" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
  });

  it("moves to the code step after sending, and back with 'Use a different email'", async () => {
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "riya@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in code" }));

    expect(await screen.findByText("riya@example.com")).toBeInTheDocument();
    const code = screen.getByLabelText("Sign-in code");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByRole("button", { name: /Resend code in \d+s/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("shows why a code was rejected", async () => {
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "riya@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in code" }));
    await userEvent.type(await screen.findByLabelText("Sign-in code"), "123456");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("That code is wrong or has expired.")).toBeInTheDocument();
    expect(verifyCode.mock.calls.at(-1)![1].get("code")).toBe("123456");
  });

  it("explains an expired sign-in link", () => {
    search = "error=link";
    render(<LoginPage />);
    expect(screen.getByText(/link has expired/)).toBeInTheDocument();
  });
});
