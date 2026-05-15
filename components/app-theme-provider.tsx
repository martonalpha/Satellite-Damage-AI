"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  APP_THEME_COOKIE_KEY,
  APP_THEME_DEFAULT,
  APP_THEME_EXPLICIT_COOKIE_KEY,
  APP_THEME_EXPLICIT_STORAGE_KEY,
  APP_THEME_STORAGE_KEY,
  type AppTheme,
  isAppTheme,
} from "@/lib/appTheme";

type AppThemeContextValue = {
  theme: AppTheme;
  resolvedTheme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
const TRANSITION_MS = 560;

export function AppThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  initialTheme: AppTheme;
}) {
  const [theme, setThemeState] = useState<AppTheme>(() =>
    getInitialClientTheme(initialTheme),
  );
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyTheme = useCallback((nextTheme: AppTheme, transition: boolean) => {
    const root = document.documentElement;

    if (transition) {
      root.classList.add("theme-transition");

      if (transitionTimer.current) {
        clearTimeout(transitionTimer.current);
      }

      transitionTimer.current = setTimeout(() => {
        root.classList.remove("theme-transition");
        transitionTimer.current = null;
      }, TRANSITION_MS);
    }

    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
  }, []);

  const setTheme = useCallback(
    (nextTheme: AppTheme) => {
      applyTheme(nextTheme, true);
      setThemeState(nextTheme);
      persistTheme(nextTheme);
    },
    [applyTheme],
  );

  useEffect(() => {
    let explicit = false;

    try {
      explicit = window.localStorage.getItem(APP_THEME_EXPLICIT_STORAGE_KEY) === "1";
    } catch {}

    if (!explicit) {
      clearStoredTheme();
    }

    applyTheme(theme, false);
  }, [applyTheme, theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme: theme,
      setTheme,
    }),
    [setTheme, theme],
  );

  return (
    <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
  );
}

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within an AppThemeProvider.");
  }

  return context;
}

function getInitialClientTheme(initialTheme: AppTheme): AppTheme {
  if (typeof window === "undefined") {
    return initialTheme;
  }

  try {
    const explicit = window.localStorage.getItem(APP_THEME_EXPLICIT_STORAGE_KEY) === "1";
    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY);

    if (explicit && isAppTheme(storedTheme)) {
      return storedTheme;
    }

    if (!explicit) {
      return APP_THEME_DEFAULT;
    }
  } catch {
    return initialTheme;
  }

  return initialTheme;
}

function persistTheme(theme: AppTheme) {
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
    window.localStorage.setItem(APP_THEME_EXPLICIT_STORAGE_KEY, "1");
  } catch {}

  document.cookie = `${APP_THEME_COOKIE_KEY}=${theme}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  document.cookie = `${APP_THEME_EXPLICIT_COOKIE_KEY}=1; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
}

function clearStoredTheme() {
  try {
    window.localStorage.removeItem(APP_THEME_STORAGE_KEY);
    window.localStorage.removeItem(APP_THEME_EXPLICIT_STORAGE_KEY);
  } catch {}

  document.cookie = `${APP_THEME_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
  document.cookie = `${APP_THEME_EXPLICIT_COOKIE_KEY}=; Max-Age=0; Path=/; SameSite=Lax`;
}
