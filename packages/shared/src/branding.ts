/**
 * Single source of truth for the app display name.
 *
 * To rename the app, change APP_NAME here. It is consumed by both the server
 * and web packages so every user-facing string updates automatically.
 *
 * Can also be overridden at runtime via the APP_NAME environment variable
 * (useful for white-labelling or custom deployments).
 */
export const APP_NAME: string =
  (typeof process !== "undefined" && process.env["APP_NAME"]?.trim()) || "Bird Code";
