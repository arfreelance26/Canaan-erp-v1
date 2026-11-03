import { notify } from "@/lib/feedback";

/**
 * Standard upload size limit for all file types across the app.
 * Must stay in sync with the backend cap (MAX_FILE_SIZE in routers/files.py).
 */
export const MAX_FILE_SIZE_MB = 25;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Validate a file against the standard size limit. Shows an error toast and
 * returns false when it's too large; callers should abort and reset the input.
 */
export function validateFileSize(file: File): boolean {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    notify.error("File too large", { description: `The maximum size is ${MAX_FILE_SIZE_MB} MB` });
    return false;
  }
  return true;
}
