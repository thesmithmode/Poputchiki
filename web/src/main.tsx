import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./fonts.css";
import "./index.css";
import { setupErrorReporting } from "./lib/error-reporter";

setupErrorReporting();

// Просим браузер не вычищать кэш тайлов при нехватке места
navigator.storage?.persist?.().catch(() => {});

// Telegram Desktop appends #tgWebAppData=...&tgWebAppVersion=...&tgWebAppThemeParams=...
// to the URL. HashRouter interprets this as a route path → shows NotFoundPage.
// Strip it before React mounts so HashRouter always starts at #/.
const rawHash = window.location.hash;
if (rawHash && !rawHash.startsWith("#/")) {
  window.history.replaceState(null, "", `${window.location.pathname}#/`);
}

const container = document.getElementById("root");
if (!container) throw new Error("root container not found");

// Удаляем inline splash как только React готов к монтированию
document.getElementById("inline-splash")?.remove();

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
