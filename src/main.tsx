import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import App from "./App";
import { IS_TAURI } from "@/lib/runtime";
import "./index.css";

/**
 * Web-only security baseline.
 *
 * The desktop build already receives an equivalent CSP from `tauri.conf.json`,
 * so this meta tag is injected only in the browser to keep the two policies
 * identical rather than intersecting them (which could block Tauri IPC).
 */
if (!IS_TAURI) {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = csp;
  document.head.appendChild(meta);
}

// HashRouter keeps deep links (e.g. #/skills/<id>) shareable on static hosts
// without server-side rewrites. Tauri keeps BrowserRouter as before.
const Router = IS_TAURI ? BrowserRouter : HashRouter;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>
);
