import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./fonts.css";
import "./index.css";
import { setupErrorReporting } from "./lib/error-reporter";

setupErrorReporting();

// Telegram Desktop appends #tgWebAppData=...&tgWebAppVersion=...&tgWebAppThemeParams=...
// to the URL. HashRouter interprets this as a route path → shows NotFoundPage.
// Strip it before React mounts so HashRouter always starts at #/.
const rawHash = window.location.hash;
if (rawHash && !rawHash.startsWith("#/")) {
  window.history.replaceState(null, "", `${window.location.pathname}#/`);
}

const container = document.getElementById("root");
if (!container) throw new Error("root container not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
