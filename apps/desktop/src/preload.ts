import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge, DesktopMobileDevicesResult } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const SET_THEME_CHANNEL = "desktop:set-theme";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const OPEN_IN_FINDER_CHANNEL = "desktop:open-in-finder";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_CHECK_CHANNEL = "desktop:update-check";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const GET_WS_URL_CHANNEL = "desktop:get-ws-url";
const GET_PAIRING_URL_CHANNEL = "desktop:get-pairing-url";
const GET_PAIRING_CODE_CHANNEL = "desktop:get-pairing-code";
const GET_DESKTOP_AUTH_TOKEN_CHANNEL = "desktop:get-desktop-auth-token";
const GET_MOBILE_DEVICES_CHANNEL = "desktop:get-mobile-devices";
const REVOKE_MOBILE_DEVICE_CHANNEL = "desktop:revoke-mobile-device";
const REMOTE_SETTINGS_GET_CHANNEL = "desktop:remote-settings-get";
const TUNNEL_GET_STATUS_CHANNEL = "desktop:tunnel-get-status";
const TUNNEL_ENABLE_CHANNEL = "desktop:tunnel-enable";
const TUNNEL_DISABLE_CHANNEL = "desktop:tunnel-disable";
const KEEP_AWAKE_SET_CHANNEL = "desktop:keep-awake-set";
const TUNNEL_STATUS_CHANNEL = "tunnel:status";
const DOWNLOAD_URL_CHANNEL = "desktop:download-url";
const WRITE_IMAGE_TO_CLIPBOARD_CHANNEL = "desktop:write-image-to-clipboard";

contextBridge.exposeInMainWorld("desktopBridge", {
  getWsUrl: () => {
    const result = ipcRenderer.sendSync(GET_WS_URL_CHANNEL);
    return typeof result === "string" ? result : null;
  },
  getPairingUrl: () => {
    const result = ipcRenderer.sendSync(GET_PAIRING_URL_CHANNEL);
    return typeof result === "string" ? result : null;
  },
  getPairingCode: () => {
    const result = ipcRenderer.sendSync(GET_PAIRING_CODE_CHANNEL);
    return typeof result === "string" ? result : null;
  },
  getDesktopAuthToken: () => {
    const result = ipcRenderer.sendSync(GET_DESKTOP_AUTH_TOKEN_CHANNEL);
    return typeof result === "string" ? result : null;
  },
  getMobileDevices: () => {
    const result = ipcRenderer.sendSync(GET_MOBILE_DEVICES_CHANNEL);
    if (typeof result !== "object" || result === null) return null;
    return result as DesktopMobileDevicesResult;
  },
  revokeMobileDevice: (input) => ipcRenderer.invoke(REVOKE_MOBILE_DEVICE_CHANNEL, input),
  getRemoteSettings: () => {
    const result = ipcRenderer.sendSync(REMOTE_SETTINGS_GET_CHANNEL);
    return typeof result === "object" && result !== null ? result : null;
  },
  getTunnelStatus: () => {
    const result = ipcRenderer.sendSync(TUNNEL_GET_STATUS_CHANNEL);
    if (
      typeof result === "object" &&
      result !== null &&
      typeof (result as Record<string, unknown>).status === "string"
    ) {
      return result as import("@t3tools/contracts").TunnelStatus;
    }
    return { status: "idle" } as import("@t3tools/contracts").TunnelStatus;
  },
  enableRemoteAccess: () => ipcRenderer.invoke(TUNNEL_ENABLE_CHANNEL),
  disableRemoteAccess: () => ipcRenderer.invoke(TUNNEL_DISABLE_CHANNEL),
  setKeepAwake: (enabled: boolean) => ipcRenderer.invoke(KEEP_AWAKE_SET_CHANNEL, enabled),
  onTunnelStatus: (listener: (status: import("@t3tools/contracts").TunnelStatus) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, status: unknown) => {
      if (typeof status === "object" && status !== null) {
        listener(status as import("@t3tools/contracts").TunnelStatus);
      }
    };
    ipcRenderer.on(TUNNEL_STATUS_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(TUNNEL_STATUS_CHANNEL, wrapped);
  },
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  setTheme: (theme) => ipcRenderer.invoke(SET_THEME_CHANNEL, theme),
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  openInFinder: (path: string) => ipcRenderer.invoke(OPEN_IN_FINDER_CHANNEL, path),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  checkForUpdate: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  // Triggers the OS save-file dialog; main process calls webContents.downloadURL to bypass renderer CORS.
  downloadUrl: (url: string) => ipcRenderer.invoke(DOWNLOAD_URL_CHANNEL, url),
  // Fetches image via main-process net.fetch (no CORS) and writes it to the system clipboard.
  writeImageToClipboard: (url: string) => ipcRenderer.invoke(WRITE_IMAGE_TO_CLIPBOARD_CHANNEL, url),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);
