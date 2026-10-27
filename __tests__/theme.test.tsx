// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThemeSync from "@/components/layout/ThemeSync";
import ThemeToggle from "@/components/layout/ThemeToggle";
import {
  readPreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
  writePreference,
} from "@/lib/theme";

/** A matchMedia whose "dark" answer can be changed, with the change event. */
function mockSystem(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query.includes("dark") ? dark : false;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  })) as unknown as typeof window.matchMedia;
  return (next: boolean) => {
    dark = next;
    listeners.forEach((cb) => cb());
  };
}

function runInitScript() {
  new Function(themeInitScript)();
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.dataset.theme = "light";
  document.documentElement.style.colorScheme = "";
  mockSystem(false);
});
afterEach(cleanup);

describe("lib/theme", () => {
  it("resolves System from the OS and takes Light and Dark as they are", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("defaults to light for a first visit and for junk in storage", () => {
    expect(readPreference()).toBe("light");
    localStorage.setItem(THEME_STORAGE_KEY, "purple");
    expect(readPreference()).toBe("light");
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPreference(broken)).toBe("light");
    expect(writePreference("dark", broken)).toBe(false);
    expect(writePreference("dark", { setItem: () => {} })).toBe(true);
  });
});

describe("the inline script that runs before first paint", () => {
  it("leaves the server's light theme alone on a first visit", () => {
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("applies a stored dark choice, and System according to the OS", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "system");
    mockSystem(true);
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
    mockSystem(false);
    runInitScript();
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("does not throw when storage is blocked", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(runInitScript).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
    spy.mockRestore();
  });
});

describe("ThemeToggle", () => {
  it("steps Light, Dark, System, keeps the choice and sets <html>", () => {
    render(<ThemeToggle />);
    const button = () => screen.getByRole("button", { name: /^Theme:/ });
    expect(button().getAttribute("aria-label")).toBe("Theme: Light. Switch to Dark.");

    fireEvent.click(button());
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(button().getAttribute("aria-label")).toBe("Theme: Dark. Switch to System.");

    fireEvent.click(button());
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(document.documentElement.dataset.theme).toBe("light"); // the mocked OS is light

    fireEvent.click(button());
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("shows all three choices as a radio group and applies the picked one", () => {
    render(<ThemeToggle variant="segmented" />);
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    expect((screen.getByLabelText("Light") as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByLabelText("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect((screen.getByLabelText("Dark") as HTMLInputElement).checked).toBe(true);
  });

  it("turns transitions off for the switch and back on two frames later", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame"] });
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /^Theme:/ }));
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(true);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(document.documentElement.hasAttribute("data-theme-switching")).toBe(false);
    vi.useRealTimers();
  });
});

describe("ThemeSync", () => {
  it("follows the OS live while the choice is System, and not otherwise", () => {
    const setSystemDark = mockSystem(false);
    localStorage.setItem(THEME_STORAGE_KEY, "system");
    render(<ThemeSync />);
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => setSystemDark(true));
    expect(document.documentElement.dataset.theme).toBe("dark");

    localStorage.setItem(THEME_STORAGE_KEY, "light");
    act(() => setSystemDark(false));
    act(() => setSystemDark(true));
    expect(document.documentElement.dataset.theme).toBe("dark"); // unchanged: the choice is Light, not System
  });

  it("follows another tab that changed the choice", () => {
    render(<ThemeSync />);
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: THEME_STORAGE_KEY }));
    });
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
