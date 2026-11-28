import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initializeTheme } from "./theme";
import { ConfirmationProvider } from "./Confirmation";
initializeTheme();
createRoot(document.getElementById("root")!).render(
  <ConfirmationProvider>
    <App />
  </ConfirmationProvider>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  const registration = navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
  const update = () =>
    void registration.then((r) => r.update()).catch(() => {});
  update();
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") update();
  });
}
