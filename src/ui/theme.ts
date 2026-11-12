// Light / dark switch. "auto" follows the device setting.

type Theme = "auto" | "light" | "dark";
const ORDER: Theme[] = ["auto", "light", "dark"];
const LABELS: Record<Theme, string> = { auto: "Theme: Auto", light: "Theme: Light", dark: "Theme: Dark" };
const STORAGE_KEY = "stint-planner-theme";

function load(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage blocked: fall through to auto.
  }
  return "auto";
}

function apply(theme: Theme, button: HTMLElement): void {
  if (theme === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  button.textContent = LABELS[theme];
}

export function initTheme(button: HTMLElement): void {
  let theme = load();
  apply(theme, button);
  button.addEventListener("click", () => {
    theme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] ?? "auto";
    apply(theme, button);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Not saved; the choice still holds until the page reloads.
    }
  });
}
