import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./i18n";
import "./index.css";
import { setupErrorReporting } from "./lib/error-reporter";

setupErrorReporting();

const container = document.getElementById("root");
if (!container) throw new Error("root container not found");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
