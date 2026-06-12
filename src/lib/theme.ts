export const THEME_STORAGE_KEY = "beanstalk-theme";

/**
 * Inlined into <head> by the root layout so the correct theme class is set
 * before first paint — no flash of the wrong theme, and no <script> rendered
 * inside a React client component.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY
)});var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})()`;
