// App name is sourced from the shared branding package — change it there to rename everywhere.
import { APP_NAME } from "@t3tools/shared/branding";

export const APP_BASE_NAME = APP_NAME;
export const APP_STAGE_LABEL = import.meta.env.DEV ? "Dev" : "Alpha";
export const APP_DISPLAY_NAME = `${APP_BASE_NAME} (${APP_STAGE_LABEL})`;
export const APP_VERSION = import.meta.env.APP_VERSION || "0.0.0";
