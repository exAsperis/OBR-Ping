import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComposePing } from "./ComposePing";
import { DEFAULT_SETTINGS } from "../domain";

afterEach(cleanup);
const gm = { id: "gm", name: "GM" }, player = { id: "p", name: "Player", color: "#19a974" };

describe("ComposePing", () => {
  it("renders practical limits and connected recipient controls", () => {
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} onCreated={() => undefined} />);
    expect(screen.getByText("Player")).toBeTruthy();
    expect(screen.getByText("Player").parentElement?.querySelector<HTMLElement>(".player-dot")?.style.backgroundColor).toBe("rgb(25, 169, 116)");
    const message = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(message.maxLength).toBe(1000);
    expect(screen.getByText(/Players cannot reply right now/)).toBeTruthy();
    expect(screen.getByLabelText("Allow reply").nextElementSibling?.classList.contains("toggle-track")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).maxLength).toBe(300);
    expect(screen.getByText("Options")).toBeTruthy();
  });

  it("disables all creation types for a player under default settings", () => {
    render(<ComposePing role="PLAYER" currentPlayer={player} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} onCreated={() => undefined} />);
    expect((screen.getByRole("button", { name: "Message" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Vote" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("includes future joiners when Everyone is selected", () => {
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} onCreated={() => undefined} />);
    const futureJoiners = screen.getByRole("checkbox", { name: /Players who join later/ }) as HTMLInputElement;
    expect(futureJoiners.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Everyone" }));
    expect(futureJoiners.checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Player" }) as HTMLInputElement).checked).toBe(true);
  });

  it("focuses a newly added option", async () => {
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} onCreated={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add option" }));
    await waitFor(() => expect(screen.getByLabelText("Option 3")).toBe(document.activeElement));
  });

  it("reorders options from their drag handles with the keyboard", () => {
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} onCreated={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "First" } });
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "Second" } });
    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder option 1" }), { key: "ArrowDown" });
    expect((screen.getByLabelText("Option 1") as HTMLInputElement).value).toBe("Second");
    expect((screen.getByLabelText("Option 2") as HTMLInputElement).value).toBe("First");
  });
});
