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
        isDark: calculateIsDark("system"),

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
        onRehydrateStorage: () => (state) => {
          if (state) {
            // Recalculate isDark based on current system preference when hydrating
            const isDark = calculateIsDark(state.theme);
            applyTheme(isDark);
            state.isDark = isDark;
          }
        },
      }
    ),
    {
      name: "theme-store",
    }
  )
);

// Listen for system theme changes
if (typeof window !== "undefined") {
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

  mediaQuery.addEventListener("change", () => {
    const { theme, setTheme } = useThemeStore.getState();
    if (theme === "system") {
      // If using system theme, update when system preference changes
      setTheme("system");
    }
  });
}

// Initialize theme on load
if (typeof document !== "undefined") {
  // Apply initial theme
  const initialState = useThemeStore.getState();
  applyTheme(initialState.isDark);
}
