import { parseState } from "./storage";
import type { AppState } from "../types";

export async function importBackupFile(file: File): Promise<AppState> {
  const text = await file.text();
  return parseState(JSON.parse(text));
}

export function downloadText(filename: string, content: string, mime = "application/json") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
