import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { webInvoke } from "./webApi";

/** True when running inside the Tauri desktop runtime. */
export const IS_TAURI =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Unified command dispatcher.
 *
 * The desktop build routes every call to the Tauri IPC bridge (unchanged
 * behaviour). The Web build routes to a static-catalog implementation in
 * `webApi.ts`, so the same UI runs read-only on free static hosting without
 * any local filesystem access, API key, or process execution.
 */
export function invoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (IS_TAURI) {
    return tauriInvoke<T>(command, args);
  }
  return webInvoke<T>(command, args);
}
