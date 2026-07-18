import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "available" | "not_available" | "downloading" | "ready_to_install" | "installing" | "installed" | "cancelled" | "failed";
export type UpdateErrorKind = "network" | "signature" | "download_interrupted" | "cancelled" | "unknown";

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  update?: Update;
  downloadedBytes?: number;
  totalBytes?: number;
  errorKind?: UpdateErrorKind;
  error?: string;
}

function classifyUpdateError(error: unknown): UpdateErrorKind {
  const message = String(error).toLowerCase();
  if (message.includes("signature") || message.includes("ed25519") || message.includes("pubkey")) return "signature";
  if (message.includes("cancel")) return "cancelled";
  if (message.includes("download") || message.includes("connection") || message.includes("network") || message.includes("timeout")) return "download_interrupted";
  return "network";
}

export async function checkForUpdate(): Promise<UpdateState> {
  const currentVersion = await getCurrentVersion();
  try {
    const update = await check();
    return update
      ? { status: "available", currentVersion, availableVersion: update.version, update }
      : { status: "not_available", currentVersion };
  } catch (error) {
    return { status: "failed", currentVersion, errorKind: classifyUpdateError(error), error: String(error) };
  }
}

export async function downloadUpdate(
  state: UpdateState,
  onProgress: (downloadedBytes: number, totalBytes?: number) => void,
): Promise<UpdateState> {
  if (!state.update) return { ...state, status: "failed", error: "No update is available." };
  let downloadedBytes = 0;
  let totalBytes: number | undefined;
  try {
    await state.update.download((event) => {
      if (event.event === "Started") totalBytes = event.data.contentLength;
      if (event.event === "Progress") downloadedBytes += event.data.chunkLength;
      onProgress(downloadedBytes, totalBytes);
    });
    return { ...state, status: "ready_to_install", downloadedBytes, totalBytes };
  } catch (error) {
    const errorKind = classifyUpdateError(error);
    return { ...state, status: errorKind === "cancelled" ? "cancelled" : "failed", errorKind, error: String(error), downloadedBytes, totalBytes };
  }
}

export async function installUpdate(state: UpdateState): Promise<UpdateState> {
  if (!state.update) return { ...state, status: "failed", error: "No update is available." };
  try {
    await state.update.install();
    await relaunch();
    return { ...state, status: "installed" };
  } catch (error) {
    return { ...state, status: "failed", errorKind: classifyUpdateError(error), error: String(error) };
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
