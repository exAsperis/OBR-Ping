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
    expect(screen.queryByText(/selected$/)).toBeNull();
    expect(screen.getByText("Player").parentElement?.querySelector<HTMLElement>(".player-dot")?.style.backgroundColor).toBe("rgb(25, 169, 116)");
    const message = screen.getByLabelText("Message") as HTMLTextAreaElement;
    expect(message.maxLength).toBe(300);
    expect(message.rows).toBe(3);
    expect(screen.getByText(/Players cannot reply right now/)).toBeTruthy();
    expect(screen.getByLabelText("Allow reply").nextElementSibling?.classList.contains("toggle-track")).toBe(true);
    const sendMessage = screen.getByRole("button", { name: "Send Message" }) as HTMLButtonElement;
    expect(sendMessage.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Player" }));
    fireEvent.change(message, { target: { value: "Ready?" } });
    expect(sendMessage.disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Quiz" }));
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).maxLength).toBe(300);
    expect(screen.getByText("Options")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "From time of sending" }).every((button) => button.classList.contains("active"))).toBe(true);
    expect((screen.getByLabelText("Deadline minutes") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Automatic deletion days") as HTMLInputElement).value).toBe("1");
    expect((screen.getByRole("button", { name: "Send Quiz" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "Yes" } });
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "No" } });
    expect((screen.getByRole("button", { name: "Send Quiz" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getAllByRole("button", { name: "Specific date/time" })[0]);
    expect(screen.getByLabelText("Deadline date and time")).toBeTruthy();
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

  it("prefills a runoff Vote with tied options and recipients", () => {
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} prefill={{ kind: "vote", sourceId: "v", question: "Camp where?", options: [{ id: "a", label: "Cave" }, { id: "b", label: "Road" }], recipients: [player] }} onCreated={() => undefined} />);
    expect(screen.getByRole("button", { name: "Vote" }).classList.contains("active")).toBe(true);
    expect((screen.getByLabelText("Question") as HTMLTextAreaElement).value).toBe("Camp where?");
    expect((screen.getByLabelText("Option 1") as HTMLInputElement).value).toBe("Cave");
    expect((screen.getByLabelText("Option 2") as HTMLInputElement).value).toBe("Road");
    expect((screen.getByRole("checkbox", { name: "Player" }) as HTMLInputElement).checked).toBe(true);
  });

  it("requires an oversized Vote prefill to be trimmed to eight options", () => {
    const options = Array.from({ length: 9 }, (_, index) => ({ id: String(index), label: `Choice ${index + 1}` }));
    render(<ComposePing role="GM" currentPlayer={gm} players={[gm, player]} settings={DEFAULT_SETTINGS} metadata={{}} prefill={{ kind: "vote", sourceId: "n", question: "Choose", options, recipients: [player] }} onCreated={() => undefined} />);
    const send = screen.getByRole("button", { name: "Send Vote" }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove option 9" }));
    expect(send.disabled).toBe(false);
  });

  it("saves a Message locally without requiring recipients", () => {
    localStorage.clear();
    render(<ComposePing role="PLAYER" currentPlayer={player} players={[gm, player]} settings={{ ...DEFAULT_SETTINGS, allowPlayerCatalogs: true }} metadata={{}} onCreated={() => undefined} />);
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Saved clue" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Save to catalog" }));
    fireEvent.change(screen.getByLabelText("Catalog"), { target: { value: "Clues" } });
    const save = screen.getByRole("button", { name: "Save Message" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(JSON.parse(localStorage.getItem("com.ex-asperis.obr-ping/catalogs") ?? "[]")[0].name).toBe("Clues");
  });
});
