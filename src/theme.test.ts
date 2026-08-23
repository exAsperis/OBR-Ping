import { describe, expect, it } from "vitest";
import { applyOwlbearTheme } from "./theme";

describe("applyOwlbearTheme", () => {
  it("sets Owlbear colors on the document root", () => {
    applyOwlbearTheme({ mode: "DARK", primary: { light: "#1", main: "#2", dark: "#3", contrastText: "#fff" }, secondary: { light: "#1", main: "#2", dark: "#3", contrastText: "#fff" }, background: { default: "#111", paper: "#222" }, text: { primary: "#eee", secondary: "#aaa", disabled: "#777" } });
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.getPropertyValue("--obr-paper")).toBe("#222");
  });
});
