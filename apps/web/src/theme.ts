export type ThemePreference = "light" | "dark" | "system";
const key = "pulso-theme";
const listeners = new Set<() => void>();
let preference: ThemePreference = "system";
let media: MediaQueryList;

function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(key);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function applyTheme() {
  const theme = preference === "system"
    ? (media.matches ? "dark" : "light") : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content", theme === "dark" ? "#19171f" : "#fafafc",
  );
}

export function initializeTheme() {
  preference = readPreference();
  media = matchMedia("(prefers-color-scheme: dark)");
  applyTheme();
  media.addEventListener("change", applyTheme);
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = readPreference();
    applyTheme();
    listeners.forEach((listener) => listener());
  });
}

export const getThemePreference = () => preference;
export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setThemePreference(next: ThemePreference) {
  preference = next;
  try { localStorage.setItem(key, next); } catch { /* Apply for this session. */ }
  applyTheme();
  listeners.forEach((listener) => listener());
}
