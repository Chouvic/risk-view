import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import App from "./App";
import "./styles.css";

// Glossary tooltips appear on every screen, including the first-run upload panel.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Tooltip.Provider delayDuration={120} skipDelayDuration={300}>
        <App />
      </Tooltip.Provider>
    </BrowserRouter>
  </StrictMode>,
);
