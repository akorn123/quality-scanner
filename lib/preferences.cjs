const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { dirname, resolve } = require('node:path');

const THEMES = new Set(['dark', 'light']);

const getDefaultTheme = (config) => {
  const configured = config.dashboard?.defaultTheme;
  return THEMES.has(configured) ? configured : 'dark';
};

const getPreferenceFile = (
  config,
  root = process.cwd(),
) =>
  resolve(
    root,
    config.dashboard?.preferenceFile ??
      '.quality-scanner/quality-scanner-preferences.json',
  );

const loadDashboardPreferences = (
  config,
  root = process.cwd(),
) => {
  const fallback = {
    theme: getDefaultTheme(config),
  };

  const file = getPreferenceFile(config, root);
  if (!existsSync(file)) return fallback;

  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return THEMES.has(parsed?.theme)
      ? { theme: parsed.theme }
      : fallback;
  } catch {
    return fallback;
  }
};

const saveDashboardPreferences = (
  config,
  preferences,
  root = process.cwd(),
) => {
  if (!THEMES.has(preferences?.theme)) {
    throw new Error('Dashboard theme must be "dark" or "light".');
  }

  const file = getPreferenceFile(config, root);
  mkdirSync(dirname(file), { recursive: true });

  const saved = {
    theme: preferences.theme,
  };

  writeFileSync(
    file,
    `${JSON.stringify(saved, null, 2)}\n`,
    'utf8',
  );

  return {
    file,
    preferences: saved,
  };
};

const ensureDashboardPreferences = (
  config,
  root = process.cwd(),
) => {
  const preferences = loadDashboardPreferences(config, root);
  const file = getPreferenceFile(config, root);

  if (!existsSync(file)) {
    return saveDashboardPreferences(config, preferences, root);
  }

  return {
    file,
    preferences,
  };
};

module.exports = {
  ensureDashboardPreferences,
  getPreferenceFile,
  loadDashboardPreferences,
  saveDashboardPreferences,
};
