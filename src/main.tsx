import "@fontsource/lato/400.css";
import "@fontsource/lato/700.css";
import "@fontsource/lato/400-italic.css";
import { MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/global.css";
import "./styles/prose.css";
import "./styles/menu.css";
import "./styles/agent.css";
import "./styles/note.css";
import "./styles/app-meta.css";
import "./styles/onboarding.css";
import "./styles/comments.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("No se encontró #root en index.html");
}

createRoot(container).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
