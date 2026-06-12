"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "../lib/theme";

export function ThemeToggle() {
  const [dark, setDark] = useState<boolean | null>(null);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  if (dark === null) return <div className="h-7 w-full" />;

  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem(THEME_STORAGE_KEY, next ? "dark" : "light");
    setDark(next);
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
