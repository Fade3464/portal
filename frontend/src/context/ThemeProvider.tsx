// src/context/ThemeProvider.tsx
import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

export const COLOR_SCHEME_OPTIONS = [
  {
    id: "purple",
    name: "Purple",
    description: "Polished violet tones",
    swatches: ["#7047c8", "#9b7de0", "#e5dcf7"],
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral and focused",
    swatches: ["#17191c", "#64748b", "#e2e8f0"],
  },
  {
    id: "coast",
    name: "Coast",
    description: "Calm blue and teal",
    swatches: ["#087f8c", "#2563a6", "#ccecf0"],
  },
  {
    id: "evergreen",
    name: "Evergreen",
    description: "Balanced forest tones",
    swatches: ["#27745a", "#5d8f6c", "#dceadf"],
  },
  {
    id: "copper",
    name: "Copper",
    description: "Warm and understated",
    swatches: ["#a85225", "#c78342", "#f1dfca"],
  },
] as const;

export type ColorScheme = (typeof COLOR_SCHEME_OPTIONS)[number]["id"];

type ThemeContextType = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: "light" | "dark";
  colorScheme: ColorScheme;
  setColorScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
  colorScheme: "purple",
  setColorScheme: () => {},
});

const COLOR_SCHEME_STORAGE_KEY = "color-scheme-v2";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

function isColorScheme(value: string | null): value is ColorScheme {
  return COLOR_SCHEME_OPTIONS.some((option) => option.id === value);
}

function applyColorScheme(colorScheme: ColorScheme) {
  document.documentElement.dataset.colorScheme = colorScheme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved ?? "system";
  });

  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    return applyTheme(theme);
  });

  const [colorScheme, setColorSchemeState] = useState<ColorScheme>(() => {
    const saved = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    const legacyScheme = localStorage.getItem("color-scheme");
    const initialScheme = isColorScheme(saved)
      ? saved
      : isColorScheme(legacyScheme) && legacyScheme !== "graphite"
        ? legacyScheme
        : "purple";
    applyColorScheme(initialScheme);
    return initialScheme;
  });

  // ✅ Apply theme whenever theme changes
  useEffect(() => {
    localStorage.setItem("theme", theme);
    const resolved = applyTheme(theme);
    setResolvedTheme(resolved);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, colorScheme);
    localStorage.setItem("color-scheme", colorScheme);
    applyColorScheme(colorScheme);
  }, [colorScheme]);

  // ✅ If theme is system, react to OS theme changes
  useEffect(() => {
    if (theme !== "system") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const handler = () => {
      const resolved = applyTheme("system");
      setResolvedTheme(resolved);
    };

    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (t: Theme) => {
    setThemeState(t);
  };

  const setColorScheme = (nextColorScheme: ColorScheme) => {
    setColorSchemeState(nextColorScheme);
  };

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, resolvedTheme, colorScheme, setColorScheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
