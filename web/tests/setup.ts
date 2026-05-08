import { vi } from "vitest";

// Bun jsdom passes --localstorage-file without valid path → localStorage methods missing.
// Provide a full in-memory implementation.
function makeLocalStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

vi.stubGlobal("localStorage", makeLocalStorage());
