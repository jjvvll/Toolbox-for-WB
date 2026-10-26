// File System Access API bits not yet in TypeScript's DOM lib (Chromium-only APIs).
// https://developer.mozilla.org/docs/Web/API/Window/showDirectoryPicker

type FileSystemPermissionMode = "read" | "readwrite";

interface FileSystemHandle {
  queryPermission?(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: FileSystemPermissionMode }): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
}

interface Window {
  showDirectoryPicker?(options?: {
    id?: string;
    mode?: FileSystemPermissionMode;
    startIn?: string;
  }): Promise<FileSystemDirectoryHandle>;
}
