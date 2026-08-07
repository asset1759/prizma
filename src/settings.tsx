import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { File, Paths } from 'expo-file-system';

import {
  resolveLang,
  translate,
  type Key,
  type Lang,
  type LangSetting,
} from './i18n';
import type { ListKey } from './blocking';
import { PHASES, type Phase, type Scheme } from './theme';

/**
 * Настройки приложения и их хранение.
 *
 * Один JSON-файл в документах, чтение синхронное при старте, запись
 * отложенная. Отдельная база тут была бы избыточной: настроек десяток,
 * читаются они один раз, а пишутся редко.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

export type Settings = {
  /** «auto» — следовать системе; остальное перекрывает её */
  themeMode: ThemeMode;
  /** «auto» — следовать языку телефона */
  language: LangSetting;
  /** Какой список приложений закрывает Deep Focus */
  appList: ListKey;
  /** Строгий режим: начатую сессию нельзя оборвать */
  strict: boolean;
  /** Длительности фаз в секундах, выставленные регулятором */
  durations: Record<Phase, number>;
};

const DEFAULTS: Settings = {
  themeMode: 'auto',
  language: 'auto',
  appList: 'social',
  strict: false,
  durations: {
    focus: PHASES.dark.focus.duration,
    short: PHASES.dark.short.duration,
    long: PHASES.dark.long.duration,
  },
};

const FILE_NAME = 'prizma-settings.json';

function settingsFile() {
  return new File(Paths.document, FILE_NAME);
}

/**
 * Читаем поверх значений по умолчанию, а не заменяем их целиком: файл мог
 * быть записан старой версией, где половины ключей ещё не существовало.
 */
function loadSync(): Settings {
  try {
    const f = settingsFile();
    if (!f.exists) return DEFAULTS;
    const raw = JSON.parse(f.textSync()) as Partial<Settings>;
    return {
      themeMode: raw.themeMode ?? DEFAULTS.themeMode,
      language: raw.language ?? DEFAULTS.language,
      appList: raw.appList ?? DEFAULTS.appList,
      strict: raw.strict ?? DEFAULTS.strict,
      durations: { ...DEFAULTS.durations, ...(raw.durations ?? {}) },
    };
  } catch {
    // Битый файл не должен мешать запуску — просто начинаем с чистого листа.
    return DEFAULTS;
  }
}

function saveSync(s: Settings) {
  try {
    const f = settingsFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify(s));
  } catch {
    // Настройки не критичны: не записались — переживём до следующего раза.
  }
}

type Ctx = {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  setDuration: (phase: Phase, seconds: number) => void;
};

const SettingsContext = createContext<Ctx | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSync);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Запись отложена: пока крутишь регулятор, значение меняется каждую
   * минуту шкалы, и писать файл на каждое движение пальца незачем.
   */
  const saveSoon = useCallback((next: Settings) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => saveSync(next), 400);
  }, []);

  const update = useCallback(
    (patch: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        saveSoon(next);
        return next;
      });
    },
    [saveSoon]
  );

  const setDuration = useCallback(
    (phase: Phase, seconds: number) => {
      setSettings((prev) => {
        const next = { ...prev, durations: { ...prev.durations, [phase]: seconds } };
        saveSoon(next);
        return next;
      });
    },
    [saveSoon]
  );

  const value = useMemo(() => ({ settings, update, setDuration }), [settings, update, setDuration]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings вызван вне SettingsProvider');
  return ctx;
}

/**
 * Действующая тема — единственный источник правды.
 *
 * Экраны не должны спрашивать систему напрямую: настройка может её
 * перекрывать, и тогда фон рисуется по одной теме, а текст по другой.
 */
export function useResolvedScheme(): Scheme {
  const { settings } = useSettings();
  const system: Scheme = useColorScheme() === 'light' ? 'light' : 'dark';
  return settings.themeMode === 'auto' ? system : settings.themeMode;
}

/** Действующий язык — так же, как тема: настройка перекрывает телефон */
export function useLang(): Lang {
  const { settings } = useSettings();
  return resolveLang(settings.language);
}

/**
 * Переводчик, привязанный к текущему языку.
 *
 * Функция, а не готовые строки: так экран берёт только то, что ему нужно,
 * и смена языка перерисовывает всё сама — `useSettings` уже подписан.
 */
export function useT() {
  const lang = useLang();
  return useCallback(
    (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang]
  );
}

export type T = ReturnType<typeof useT>;
