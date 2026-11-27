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
if ("serviceWorker" in navigator && import.meta.env.PROD)
  void navigator.serviceWorker.register("/sw.js");
