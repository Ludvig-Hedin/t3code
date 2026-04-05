import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { createHashHistory, createBrowserHistory } from "@tanstack/react-router";

import "@xterm/xterm/css/xterm.css";
import "./index.css";

import { isElectron, isMobileWebView } from "./env";
import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";

// Electron loads the app from a file-backed shell, so hash history avoids path resolution issues.
const history = isElectron ? createHashHistory() : createBrowserHistory();

// Mark body so CSS can apply iOS safe-area insets and hide Electron-only chrome.
// Runs once at module load time, before any React render.
if (isMobileWebView) {
  document.body.setAttribute("data-mobile-webview", "");
}

const router = getRouter(history);

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
