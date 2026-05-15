export const APP_THEME_STORAGE_KEY = "app-theme";
export const APP_THEME_COOKIE_KEY = "app-theme";
export const APP_THEME_EXPLICIT_STORAGE_KEY = "app-theme-explicit";
export const APP_THEME_EXPLICIT_COOKIE_KEY = "app-theme-explicit";
export const APP_THEME_DEFAULT = "light";

export const APP_THEMES = ["light", "dark"] as const;

export type AppTheme = (typeof APP_THEMES)[number];

export function isAppTheme(value: unknown): value is AppTheme {
  return value === "light" || value === "dark";
}

export function getAppThemeInitScript() {
  return `
;(function () {
  try {
    var themeKey = ${JSON.stringify(APP_THEME_STORAGE_KEY)};
    var explicitKey = ${JSON.stringify(APP_THEME_EXPLICIT_STORAGE_KEY)};
    var cookieThemeKey = ${JSON.stringify(APP_THEME_COOKIE_KEY)};
    var cookieExplicitKey = ${JSON.stringify(APP_THEME_EXPLICIT_COOKIE_KEY)};
    var defaultTheme = ${JSON.stringify(APP_THEME_DEFAULT)};
    var theme = defaultTheme;
    var explicit = false;
    var cookies = document.cookie ? document.cookie.split("; ") : [];
    var cookieMap = {};

    for (var i = 0; i < cookies.length; i += 1) {
      var parts = cookies[i].split("=");
      var key = decodeURIComponent(parts.shift() || "");
      cookieMap[key] = decodeURIComponent(parts.join("=") || "");
    }

    try {
      explicit = window.localStorage.getItem(explicitKey) === "1";
      if (explicit) {
        var storedTheme = window.localStorage.getItem(themeKey);
        if (storedTheme === "light" || storedTheme === "dark") {
          theme = storedTheme;
        }
      }
    } catch (storageError) {}

    if (!explicit && cookieMap[cookieExplicitKey] === "1") {
      var cookieTheme = cookieMap[cookieThemeKey];
      if (cookieTheme === "light" || cookieTheme === "dark") {
        theme = cookieTheme;
      }
    }

    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch (error) {
    document.documentElement.dataset.theme = ${JSON.stringify(APP_THEME_DEFAULT)};
    document.documentElement.style.colorScheme = ${JSON.stringify(APP_THEME_DEFAULT)};
  }
})();`;
}
