import { useEffect, useState } from 'react';

export function usePrefersDarkTheme() {
  const [prefersDarkTheme, setPrefersDarkTheme] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    setPrefersDarkTheme(mediaQuery.matches);

    function handleThemeChange(event: MediaQueryListEvent): void {
      setPrefersDarkTheme(event.matches);
    }

    mediaQuery.addEventListener('change', handleThemeChange);

    return () => mediaQuery.removeEventListener('change', handleThemeChange);
  }, []);

  return prefersDarkTheme;
}
