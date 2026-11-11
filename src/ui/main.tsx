import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme } from "./theme";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("FLOR Connect could not find its root element.");

const preview = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("preview") : null;
if (preview) {
  void import("./add-patient-preview").then(({ renderAddPatientPreview }) => renderAddPatientPreview(root, preview));
} else {
  applyTheme();
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
