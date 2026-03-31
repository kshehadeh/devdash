import { vi } from "vitest";

// Mock the electron module — this runs before every test file
vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "/tmp/devdash-test"),
    quit: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false),
    encryptString: vi.fn((s: string) => Buffer.from(s)),
    decryptString: vi.fn((buf: Buffer) => buf.toString()),
  },
  dialog: {
    showMessageBoxSync: vi.fn(() => 0),
  },
  shell: {
    openPath: vi.fn(),
    openExternal: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
  },
}));
