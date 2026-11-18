function applyRememberedThemeToBody() {
  let theme = 'dark';
  try {
    if (localStorage.getItem('gnc_last_theme_v1') === 'light') theme = 'light';
  } catch (error) {
    if (error.name !== 'SecurityError') throw error;
  }
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.dataset.theme = theme;
  root.dataset.opsPrepaintTheme = theme;
  document.body.dataset.opsTheme = theme;
  document.body.dataset.opsThemeMode = theme;
  document.body.style.colorScheme = theme;
}

applyRememberedThemeToBody();
