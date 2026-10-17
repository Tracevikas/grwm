import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { OutfitViewer } from "@/components/OutfitViewer";
import { SubmitButton } from "@/components/SubmitButton";

describe("SubmitButton", () => {
  it("shows a spinner and its pending label while the action runs", async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    render(
      <form action={action}>
        <SubmitButton pendingLabel="Deleting…">Delete outfit</SubmitButton>
      </form>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Delete outfit" }));
    const busy = await screen.findByRole("button", { name: "Deleting…" });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy.querySelector("svg.spin")).not.toBeNull();

    finish();
    expect(await screen.findByRole("button", { name: "Delete outfit" })).toBeEnabled();
  });
});

describe("OutfitViewer", () => {
  it("shows the clean look first, with a switch to the photo", async () => {
    render(<OutfitViewer photoUrl="https://x/photo.jpg" lookUrl="https://x/look.webp" lookStatus="done" />);
    expect(screen.getByAltText("Your outfit, laid out on its own")).toHaveAttribute("src", "https://x/look.webp");

    await userEvent.click(screen.getByRole("tab", { name: "Photo" }));
    expect(screen.getByAltText("Outfit photo")).toHaveAttribute("src", "https://x/photo.jpg");
    expect(screen.getByRole("tab", { name: "Photo" })).toHaveAttribute("aria-selected", "true");
  });

  it("quietly shows the photo while a look is still being finished, checking until it arrives", () => {
    vi.useFakeTimers();
    render(<OutfitViewer photoUrl="https://x/photo.jpg" lookUrl={undefined} lookStatus="pending" />);
    expect(screen.getByAltText("Outfit photo")).toHaveAttribute("src", "https://x/photo.jpg");
    expect(screen.queryByText(/ChatGPT/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    vi.advanceTimersByTime(4000 * 3);
    expect(refresh).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("explains a failed look", () => {
    render(<OutfitViewer photoUrl="https://x/photo.jpg" lookUrl={undefined} lookStatus="failed" />);
    expect(screen.getByText(/clean picture couldn.t be drawn/)).toBeInTheDocument();
  });
});
