/**
 * Английский — основа. Остальные словари типизируются по нему, поэтому
 * забытый ключ становится ошибкой сборки, а не пустым местом в интерфейсе.
 *
 * Он же запасной: если языка нет или в нём чего-то не хватает, берётся
 * отсюда. Английский выбран основой, а не русский, именно поэтому —
 * выпадать в него безопаснее всего в любой стране.
 *
 * Подстановки в фигурных скобках: `{time}`, `{count}`.
 */
export const en = {
  // Фазы сессии
  phaseFocus: 'Focus',
  phaseShort: 'Break',
  phaseLong: 'Long break',
  deepFocus: 'Deep Focus',

  // Вкладки
  tabTimer: 'Timer',
  tabApps: 'Apps',
  tabStats: 'Stats',
  tabMore: 'More',

  // Экран таймера
  minutesShort: 'MIN',
  holdToReset: 'Hold to reset',
  presetQuietHome: 'Quiet home',
  blockingOff: 'Off',
  blockedCount: '{count} blocked',

  a11yReset: 'Reset',
  a11yPause: 'Pause',
  a11yStart: 'Start',
  a11yHoldHint: 'Hold to confirm',
  a11yDeepFocus: 'Deep Focus',

  screenTimeTitle: 'Screen Time access needed',
  screenTimeBody:
    'Without it the app cannot close other apps during a session. You can grant permission in Settings.',

  pickerHeader: 'What to close during a session',
  pickerFooter: 'Calls, messages and maps stay available at all times.',

  // Заглушки вкладок
  listSocial: 'Social',
  listGames: 'Games',
  listCustom: 'My list',
  listEmpty: 'not set',
  listCount: '{apps} apps',
  listCountWithCategories: '{apps} apps · {categories} categories',
  listEdit: 'Choose apps',
  appsIntro: 'Deep Focus closes what is in the chosen list.',
  appsPickerNote: 'Apple never shows us which apps you have — you pick them yourself on its screen. We only remember the choice and give the list a name.',
  appsMultipleLocked: 'Several lists come with the subscription. One is free.',
  strictTitle: 'Strict mode',
  strictHint: 'A started session cannot be cut short: Deep Focus stays on and the timer cannot be reset until the phase runs out. That is the whole point — you agree with yourself in advance, while leaving is not yet tempting.',
  strictHonest: 'It is friction, not a lock: the app can always be deleted. Nothing on iOS holds tighter — the friction is enough for the urge to pass.',
  strictRunning: 'A strict session is running. Wait for the phase to finish.',
  appsTitle: 'Apps',
  statsTitle: 'Stats',
  statsHint: 'Hours in focus, your best time of day, streak of days in a row.',

  // Экран «Ещё»
  moreTitle: 'More',
  sectionAppearance: 'Appearance',
  sectionDurations: 'Durations',
  sectionLanguage: 'Language',
  themeAuto: 'Match system',
  themeLight: 'Light',
  themeDark: 'Dark',
  languageAuto: 'Match system',
  hintDeepFocusDark:
    'Deep Focus stays dark whatever you pick: in that mode the light leaves the room.',
  presetClassic: 'Classic',
  presetDeep: 'Deep work',
  presetBrief: 'Easy start',
  presetCustom: 'Custom',
  presetLocked: 'The ring dial is free — turn it any time, it changes the current phase. Keeping your own set of three is part of the subscription.',
  hintDurations: 'Set on the ring dial and remembered between launches.',

  // Щит Screen Time
  shieldTitle: "You're in Deep Focus",
  shieldOpensAt: 'This app opens at {time}.',
  shieldButton: 'Back to work',

  encouragement1: 'Keep going. Your dream is worth it.',
  encouragement2: 'You chose this yourself. See it through.',
  encouragement3: 'What matters most is not in here.',
  encouragement4: 'Big things are built from half-hours like this one.',
  encouragement5: "In an hour you'll be glad you didn't give in.",
  encouragement6: 'This is the work: staying when you want to leave.',
};

export type Dict = typeof en;
export type Key = keyof Dict;
