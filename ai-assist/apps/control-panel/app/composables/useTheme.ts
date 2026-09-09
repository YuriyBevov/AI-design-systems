export type AppTheme = "dark" | "light";

const storageKey = "ai-assist-theme";

export const useTheme = () => {
  const theme = useState<AppTheme>("app-theme", () => "dark");

  const applyTheme = (value: AppTheme): void => {
    theme.value = value;
    if (import.meta.client) {
      document.documentElement.dataset.theme = value;
      localStorage.setItem(storageKey, value);
    }
  };

  onMounted(() => {
    const storedTheme = localStorage.getItem(storageKey);
    applyTheme(storedTheme === "light" ? "light" : "dark");
  });

  const toggleTheme = (): void => {
    applyTheme(theme.value === "dark" ? "light" : "dark");
  };

  return { theme, toggleTheme };
};
