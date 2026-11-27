// Run before the application and stylesheet load to avoid a light flash.
(() => {
  let preference = "system";
  try {
    const saved = localStorage.getItem("pulso-theme");
    if (saved === "light" || saved === "dark") preference = saved;
  } catch { /* Storage may be unavailable; follow the system. */ }
  const theme = preference === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content", theme === "dark" ? "#19171f" : "#fafafc",
  );
})();
