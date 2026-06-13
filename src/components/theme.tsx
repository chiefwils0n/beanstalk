"use client";

import { useSyncExternalStore } from "react";
import { THEME_STORAGE_KEY } from "../lib/theme";

// Read the current theme straight from the <html> class via an external store,
// so there's no setState-in-effect and no flash: the inline init script in the
// layout sets the class before paint, and a MutationObserver re-renders the
// toggle whenever it changes.
function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const isDark = () => document.documentElement.classList.contains("dark");

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, isDark, () => false);

  const toggle = () => {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-sm w-full justify-center"
      title="Toggle theme"
    >
      {dark ? "☀️ Light mode" : "🌙 Dark mode"}
    </button>
  );
}
