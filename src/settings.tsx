import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import { File, Paths } from 'expo-file-system';

import {
  pluralForm,
  resolveLang,
  translate,
  uses12Hour,
  type Key,
  type Lang,
  type LangSetting,
} from './i18n';
import type { ListKey } from './blocking';
import { DEFAULT_SCHEDULE, type Schedule } from './schedule';
import {
  PHASES,
  formatEndTime,
  formatHour,
  formatTimeOfDay,
  type Phase,
  type Scheme,
} from './theme';

/**
 * Настройки приложения и их хранение.
 *
 * Один JSON-файл в документах, чтение синхронное при старте, запись
 * отложенная. Отдельная база тут была бы избыточной: настроек десяток,
 * читаются они один раз, а пишутся редко.
 */

export type ThemeMode = 'auto' | 'light' | 'dark';

/**
 * Уведомления.
 *
 * Сюда попадает только то, что человек завёл сам, или то, что чинит
 * сломанный таймер. Всё, что зовёт вернуться в приложение, — не попадает
 * никогда: приложение для фокуса, которое дёргает пушами, противоречит
 * себе, и планка здесь выше обычной.
 */
export type Notifications = {
  /** Сигнал в момент, когда фаза досчитала */
  phaseEnd: boolean;
  /** Напоминание сесть за работу */
  daily: boolean;
  /** Дни напоминания по Apple: 1 — воскресенье, 7 — суббота */
  dailyDays: number[];
  /** Час напоминания, 0…23 */
  dailyHour: number;
  /**
   * Когда спрашивали разрешение. `null` — ещё не спрашивали.
   *
   * Выстрел один: iOS показывает системный диалог ровно раз, и отказ
   * изнутри приложения не отменить. Поэтому спрашиваем в конце первой
   * досчитанной фазы — в единственную секунду, когда польза от
   * уведомления очевидна без объяснений.
   */
  askedAt: number | null;
};

const DEFAULT_NOTIFICATIONS: Notifications = {
  // Инициатор здесь человек: он сам запустил отсчёт минуту назад, и поток
  // уведомлений невозможен по устройству. Системный «Таймер» Apple вообще
  // не спрашивает.
  phaseEnd: true,
  // У напоминания нет времени, пока его не назвали, и единственное
  // честное умолчание — выключено.
  daily: false,
  dailyDays: [2, 3, 4, 5, 6],
  dailyHour: 9,
  askedAt: null,
};

export type Settings = {
  /** «auto» — следовать системе; остальное перекрывает её */
  themeMode: ThemeMode;
  /** «auto» — следовать языку телефона */
  language: LangSetting;
  /** Какой список приложений закрывает Deep Focus */
  appList: ListKey;
  /** Строгий режим: начатую сессию нельзя оборвать */
  strict: boolean;
  /**
   * Поднимать щит самому при старте фокуса.
   *
   * Без этого щит приходится включать вручную перед каждой сессией:
   * конец фазы гасит Deep Focus, и человек, включивший блокировку
   * ради того, чтобы не решать заново, решает заново по восемь раз в день.
   */
  autoDeep: boolean;
  /**
   * Сколько отмечено в списке. Держим у себя, а не спрашиваем Screen Time:
   * разбор метаданных уже дважды молчал, и один раз это сломало саму
   * блокировку. Точные числа приходят событием при выборе — их и пишем.
   */
  listCount: { apps: number; categories: number; sites?: number } | null;
  /** Когда Deep Focus включается сам */
  schedule: Schedule;
  /** Длительности фаз в секундах, выставленные регулятором */
  durations: Record<Phase, number>;
  /** Что и когда приложению позволено сообщать */
  notifications: Notifications;
};

const DEFAULTS: Settings = {
  themeMode: 'auto',
  language: 'auto',
  appList: 'social',
  strict: false,
  autoDeep: false,
  listCount: null,
  schedule: DEFAULT_SCHEDULE,
  durations: {
    focus: PHASES.dark.focus.duration,
    short: PHASES.dark.short.duration,
    long: PHASES.dark.long.duration,
  },
  notifications: DEFAULT_NOTIFICATIONS,
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
      autoDeep: raw.autoDeep ?? DEFAULTS.autoDeep,
      listCount: raw.listCount ?? DEFAULTS.listCount,
      schedule: { ...DEFAULTS.schedule, ...(raw.schedule ?? {}) },
      durations: { ...DEFAULTS.durations, ...(raw.durations ?? {}) },
      notifications: { ...DEFAULTS.notifications, ...(raw.notifications ?? {}) },
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

/**
 * Числительное с правильной формой: `tn('apps', 12)` → «12 приложений».
 *
 * Ключи собираются из основы и формы — `appsOne`, `appsFew`, `appsMany`.
 * Отдельный хук, а не флаг у `t`, чтобы в местах без чисел не приходилось
 * думать о формах вовсе.
 */
export function useTn() {
  const lang = useLang();
  const t = useT();
  return useCallback(
    (base: 'apps' | 'cats' | 'sites' | 'sessions' | 'streakD', n: number) =>
      t(`${base}${pluralForm(lang, n)}` as Key, { n }),
    [lang, t]
  );
}

/**
 * Часы в том виде, в каком их пишут на языке интерфейса.
 *
 * Отдельный хук, потому что формат зависит от языка, а язык — от
 * настроек: тянуть его в каждую точку вызова руками значило бы рано
 * или поздно забыть в одной из них.
 */
export function useClock() {
  const hour12 = uses12Hour(useLang());
  return useMemo(
    () => ({
      time: (d: Date) => formatTimeOfDay(d, hour12),
      hour: (h: number) => formatHour(h, hour12),
      endIn: (sec: number) => formatEndTime(sec, hour12),
    }),
    [hour12]
  );
}

export type T = ReturnType<typeof useT>;
