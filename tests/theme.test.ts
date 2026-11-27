import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { initializeTheme, getThemePreference, setThemePreference, subscribeTheme } from "../apps/web/src/theme.ts";

test("theme follows system changes, persists overrides and updates other tabs", () => {
  const savedGlobals = Object.getOwnPropertyDescriptors(globalThis);
  const values = new Map([["pulso-theme", "system"]]);
  const media = Object.assign(new EventTarget(), { matches: true });
  const windowEvents = new EventTarget();
  const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
  let chromeColor = "";
  let blocked = false;
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("Storage unavailable");
      values.set(key, value);
    },
  };
  Object.assign(globalThis, {
    localStorage: storage,
    matchMedia: () => media,
    window: windowEvents,
    document: { documentElement: root, querySelector: () => ({ setAttribute: (_: string, value: string) => { chromeColor = value; } }) },
  });
  let notified = 0;
  const unsubscribe = subscribeTheme(() => notified++);
  try {
    initializeTheme();
    assert.equal(root.dataset.theme, "dark");
    media.matches = false;
    media.dispatchEvent(new Event("change"));
    assert.equal(root.dataset.theme, "light");
    setThemePreference("dark");
    assert.equal(values.get("pulso-theme"), "dark");
    media.dispatchEvent(new Event("change"));
    assert.equal(root.dataset.theme, "dark", "explicit override survives system changes");
    assert.equal(chromeColor, "#19171f");
    values.set("pulso-theme", "light");
    windowEvents.dispatchEvent(Object.assign(new Event("storage"), { key: "pulso-theme" }));
    assert.equal(getThemePreference(), "light");
    assert.equal(root.style.colorScheme, "light");
    values.clear();
    media.matches = true;
    windowEvents.dispatchEvent(Object.assign(new Event("storage"), { key: null }));
    assert.equal(getThemePreference(), "system");
    assert.equal(root.dataset.theme, "dark");
    blocked = true;
    setThemePreference("light");
    assert.equal(root.dataset.theme, "light", "blocked persistence still applies in session");
    assert.equal(notified, 4);
  } finally {
    unsubscribe();
    for (const key of ["localStorage", "matchMedia", "window", "document"]) {
      if (savedGlobals[key]) Object.defineProperty(globalThis, key, savedGlobals[key]);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

test("pre-paint bootstrap restores the same theme even if storage is unavailable", () => {
  const script = readFileSync(new URL("../apps/web/public/theme-init.js", import.meta.url), "utf8");
  for (const [saved, systemDark, expected] of [
    ["dark", false, "dark"], ["light", true, "light"],
    ["system", true, "dark"], ["invalid", false, "light"],
    [null, true, "dark"], ["blocked", true, "dark"],
  ] as const) {
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> };
    runInNewContext(script, {
      localStorage: { getItem: () => { if (saved === "blocked") throw new Error("denied"); return saved; } },
      matchMedia: () => ({ matches: systemDark }),
      document: { documentElement: root, querySelector: () => null },
    });
    assert.equal(root.dataset.theme, expected);
    assert.equal(root.style.colorScheme, expected);
  }
});
