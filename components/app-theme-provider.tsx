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
  APP_THEME_DEFAULT,
  type AppTheme,
} from "@/lib/appTheme";

type AppThemeContextValue = {
  theme: AppTheme;
  resolvedTheme: AppTheme;
  setTheme: (theme: AppTheme) => void;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);
const TRANSITION_MS = 560;

export function AppThemeProvider({
  children,
  initialTheme: _initialTheme,
}: {
  children: ReactNode;
  initialTheme: AppTheme;
}) {
  const [theme, setThemeState] = useState<AppTheme>(APP_THEME_DEFAULT);
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
    },
    [applyTheme],
  );

  useEffect(() => {
    clearStoredTheme();
    applyTheme(APP_THEME_DEFAULT, false);
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

function clearStoredTheme() {
  try {
    window.localStorage.removeItem("app-theme");
    window.localStorage.removeItem("app-theme-explicit");
  } catch {}

  document.cookie = "app-theme=; Max-Age=0; Path=/; SameSite=Lax";
  document.cookie = "app-theme-explicit=; Max-Age=0; Path=/; SameSite=Lax";
}
