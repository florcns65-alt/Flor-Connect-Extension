import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme } from "./theme";
import "./styles.css";

applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("FLOR Connect could not find its root element.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
