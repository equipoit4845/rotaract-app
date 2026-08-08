import "@equipoit4845/design-tokens/tokens.css";
import "@equipoit4845/design-tokens/reset.css";
import "@equipoit4845/ui/styles.css";
import "@equipoit4845/admin-shell/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
