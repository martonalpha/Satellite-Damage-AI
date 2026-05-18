export const APP_THEME_STORAGE_KEY = "app-theme";
export const APP_THEME_COOKIE_KEY = "app-theme";
export const APP_THEME_EXPLICIT_STORAGE_KEY = "app-theme-explicit";
export const APP_THEME_EXPLICIT_COOKIE_KEY = "app-theme-explicit";
export const APP_THEME_DEFAULT = "dark";

export const APP_THEMES = ["light", "dark"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark";
}

export function getAppThemeInitScript() {
  return `
;(function () {
  try {
    var defaultTheme = ${JSON.stringify(APP_THEME_DEFAULT)};
    document.documentElement.dataset.theme = defaultTheme;
    document.documentElement.style.colorScheme = defaultTheme;
  } catch (error) {
    document.documentElement.dataset.theme = ${JSON.stringify(APP_THEME_DEFAULT)};
    document.documentElement.style.colorScheme = ${JSON.stringify(APP_THEME_DEFAULT)};
  }
})();`;
}
