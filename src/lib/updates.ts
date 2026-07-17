import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";

export type UpdateStatus = "idle" | "checking" | "available" | "not_available" | "downloading" | "ready_to_install" | "failed";

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  error?: string;
}

export async function checkForUpdate(): Promise<UpdateState> {
  const currentVersion = await getCurrentVersion();
  try {
    const update = await check();
    return update
      ? { status: "available", currentVersion, availableVersion: update.version }
      : { status: "not_available", currentVersion };
  } catch (error) {
    return { status: "failed", currentVersion, error: String(error) };
  }
}

/** Keeps update checks explicit until a signed, trusted endpoint is configured. */
export async function getCurrentVersion(): Promise<string> {
  try {
    return await getVersion();
  } catch {
    return "0.1.0";
  }
}
