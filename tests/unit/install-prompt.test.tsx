import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "@/components/InstallPrompt";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36";

function setDevice(ua: string, { standalone = false } = {}) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: standalone && q.includes("standalone"), media: q }));
}

/** Fires Chrome's beforeinstallprompt with a controllable prompt(). */
function fireInstallPrompt(outcome: "accepted" | "dismissed" = "accepted") {
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("InstallPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells iPhone users how to add it to the home screen", () => {
    setDevice(IPHONE);
    render(<InstallPrompt />);
    expect(screen.getByText("Put GRWM on your home screen")).toBeInTheDocument();
    expect(screen.getByText("Add to Home Screen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
  });

  it("waits for the browser to allow installing on Android, then uses its dialog", async () => {
    setDevice(ANDROID);
    render(<InstallPrompt />);
    expect(screen.queryByText("Put GRWM on your home screen")).not.toBeInTheDocument();

    const event = fireInstallPrompt("accepted");
    expect(event.defaultPrevented).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Install app" }));

    expect(event.prompt).toHaveBeenCalled();
    expect(screen.queryByText("Put GRWM on your home screen")).not.toBeInTheDocument();
  });

  it("stays hidden once the app is installed", () => {
    setDevice(IPHONE, { standalone: true });
    render(<InstallPrompt />);
    expect(screen.queryByText("Put GRWM on your home screen")).not.toBeInTheDocument();
  });

  it("'Not now' hides it and remembers for two weeks", async () => {
    setDevice(IPHONE);
    const { unmount } = render(<InstallPrompt />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByText("Put GRWM on your home screen")).not.toBeInTheDocument();
    expect(Number(localStorage.getItem("grwm-install-dismissed"))).toBeGreaterThan(0);

    unmount();
    render(<InstallPrompt />);
    expect(screen.queryByText("Put GRWM on your home screen")).not.toBeInTheDocument();
  });

  it("comes back after the two weeks are up", () => {
    setDevice(IPHONE);
    localStorage.setItem("grwm-install-dismissed", String(Date.now() - 15 * 24 * 60 * 60 * 1000));
    render(<InstallPrompt />);
    expect(screen.getByText("Put GRWM on your home screen")).toBeInTheDocument();
  });
});
