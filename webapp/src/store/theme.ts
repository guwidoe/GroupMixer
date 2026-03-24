import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Detect system preference
const getSystemTheme = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

// Apply theme to document
const applyTheme = (isDark: boolean) => {
  if (typeof document === "undefined") return;

  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
};

// Calculate if dark mode should be active
const calculateIsDark = (theme: Theme): boolean => {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme === "dark";
};

export const useThemeStore = create<ThemeState>()(
  devtools(
    persist(
      (set, get) => ({
        theme: "system", // Default to system preference
        isDark: false,

        setTheme: (theme: Theme) => {
          const isDark = calculateIsDark(theme);
          applyTheme(isDark);
          set({ theme, isDark });
        },

        toggleTheme: () => {
          const { theme } = get();
          let newTheme: Theme;

          if (theme === "system") {
            // If currently system, toggle to opposite of current system preference
            newTheme = getSystemTheme() ? "light" : "dark";
          } else if (theme === "light") {
            newTheme = "dark";
          } else {
            newTheme = "light";
          }

          get().setTheme(newTheme);
        },
      }),
      {
        name: "theme-storage",
        skipHydration: true,
      }
    ),
    {
      name: "theme-store",
    }
  )
);

function syncThemeFromState(): void {
  const { theme } = useThemeStore.getState();
  const isDark = calculateIsDark(theme);
  applyTheme(isDark);
  useThemeStore.setState({ isDark });
}

function readPersistedTheme(): Theme | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = window.localStorage.getItem("theme-storage");
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored) as { state?: { theme?: unknown } };
    const theme = parsed.state?.theme;
    return theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : null;
  } catch {
    return null;
  }
}

function attachSystemThemeListener(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }

  mediaQuery.addListener(onChange);
  return () => mediaQuery.removeListener(onChange);
}

export function initializeThemeStore(): () => void {
  const persistedTheme = readPersistedTheme();
  if (persistedTheme) {
    useThemeStore.setState({ theme: persistedTheme });
  }
  syncThemeFromState();

  return attachSystemThemeListener(() => {
    const { theme, setTheme } = useThemeStore.getState();
    if (theme === "system") {
      setTheme("system");
    }
  });
}
