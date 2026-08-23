import type { Theme } from "@owlbear-rodeo/sdk";

export function applyOwlbearTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme.mode.toLowerCase();
  document.documentElement.style.setProperty("--obr-bg", theme.background.default);
  document.documentElement.style.setProperty("--obr-paper", theme.background.paper);
  document.documentElement.style.setProperty("--obr-text", theme.text.primary);
  document.documentElement.style.setProperty("--obr-muted", theme.text.secondary);
  document.documentElement.style.setProperty("--obr-primary", theme.primary.main);
}
