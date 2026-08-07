/**
 * Дизайн-токены Prizma.
 *
 * Главный принцип: цвет — это не тема, а состояние сессии. Liquid Glass
 * не работает на плоском фоне, поэтому каждая фаза несёт свой холст,
 * который стеклу есть что преломлять.
 *
 * Тем две — светлая и тёмная, — но Deep Focus в обеих одинаково тёмный.
 * Он не тема, а режим: свет уходит из комнаты независимо от настроек
 * телефона. Иначе в светлой теме пропала бы вся разница между обычной
 * сессией и глубоким фокусом.
 */

export type Phase = 'focus' | 'short' | 'long';
export type Scheme = 'light' | 'dark';

export type PhaseSpec = {
  /** Длительность фазы в секундах */
  duration: number;
  /** Акцент — дуга прогресса, точки, свечение */
  accent: string;
  /** Светлый край акцента, дальний стоп градиента дуги */
  accentHi: string;
  /** Цвета пятен живого холста */
  canvas: [string, string, string];
};

const DURATIONS: Record<Phase, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

// Третье пятно холста намеренно контрастное к фазе: тёплый уход снизу
// оживляет экран и даёт стеклу дока что преломлять.
export const PHASES: Record<Scheme, Record<Phase, PhaseSpec>> = {
  dark: {
    focus: {
      duration: DURATIONS.focus,
      accent: '#6E5BFF',
      accentHi: '#A897FF',
      canvas: ['#6E5BFF', '#3B2BE0', '#2FDCC0'],
    },
    short: {
      duration: DURATIONS.short,
      accent: '#2FDCC0',
      accentHi: '#8DF5E4',
      canvas: ['#2FDCC0', '#0E8F7C', '#6E5BFF'],
    },
    long: {
      duration: DURATIONS.long,
      accent: '#FF9B63',
      accentHi: '#FFC79E',
      canvas: ['#FF9B63', '#C25A2A', '#FFD166'],
    },
  },
  // В светлой теме холст остаётся цветным, но уходит в пастель: под тёмным
  // текстом нужна светлая подложка, а стеклу — всё ещё что преломлять.
  light: {
    focus: {
      duration: DURATIONS.focus,
      accent: '#5B4BE8',
      accentHi: '#8171F5',
      canvas: ['#C7BEFF', '#A99BFF', '#8FE4D6'],
    },
    short: {
      duration: DURATIONS.short,
      accent: '#12A48F',
      accentHi: '#2FDCC0',
      canvas: ['#9CEEDF', '#5FD9C4', '#B9AEFF'],
    },
    long: {
      duration: DURATIONS.long,
      accent: '#D2703A',
      accentHi: '#FF9B63',
      canvas: ['#FFD0AE', '#FFB183', '#FFE3A8'],
    },
  },
};

/**
 * Deep Focus — не фаза и не тема, а наложение поверх текущей фазы.
 * Тёмный в обеих темах: в этом весь смысл режима.
 */
export const DEEP_FOCUS = {
  accent: '#3D6BFF',
  accentHi: '#DCE6FF',
  canvas: ['#3D6BFF', '#1B2A9E', '#0C1330'] as [string, string, string],
  canvasOpacity: 0.45,
};

export const INK: Record<Scheme, {
  primary: string;
  secondary: string;
  tertiary: string;
  ground: string;
  /** Дорожка кольца под дугой прогресса */
  track: string;
  /** Заливка стеклянных кружков в фолбэке, когда Liquid Glass недоступен */
  fallback: string;
  fallbackEdge: string;
}> = {
  dark: {
    primary: '#FFFFFF',
    secondary: 'rgba(255,255,255,0.55)',
    tertiary: 'rgba(255,255,255,0.30)',
    ground: '#0A0B14',
    // Дорожка кольца заметная: в макете она читается как отдельная деталь,
    // а не как еле различимая тень.
    track: 'rgba(255,255,255,0.16)',
    fallback: 'rgba(255,255,255,0.10)',
    fallbackEdge: 'rgba(255,255,255,0.28)',
  },
  light: {
    primary: '#14121F',
    // Заметно контрастнее тёмной темы: на светлом фоне полупрозрачный
    // тёмный текст теряется быстрее, чем полупрозрачный светлый на тёмном.
    secondary: 'rgba(20,18,31,0.64)',
    tertiary: 'rgba(20,18,31,0.42)',
    ground: '#F7F5FC',
    // Заметно темнее фона: на светлой теме холст подмешивает лаванду,
    // и близкие оттенки дорожки просто исчезают под ним.
    track: '#CCC1EB',
    fallback: 'rgba(255,255,255,0.62)',
    fallbackEdge: 'rgba(255,255,255,0.9)',
  },
};

/**
 * Состояние живого холста. Живёт в оболочке, а не в экране таймера:
 * холст должен быть фоном всех вкладок, иначе стекло панели на остальных
 * экранах вырождается в плоскую плашку — преломлять там нечего.
 */
export type Ambient = {
  canvas: [string, string, string];
  opacity: number;
  /** Deep Focus темнит экран независимо от системной темы */
  scheme: Scheme;
};

export function defaultAmbient(scheme: Scheme): Ambient {
  return {
    canvas: PHASES[scheme].focus.canvas,
    opacity: scheme === 'light' ? 0.3 : 0.22,
    scheme,
  };
}

/**
 * Спектр для вспышки в конце сессии — та самая призма, от которой имя.
 *
 * Это не радуга из набора карандашей: спектр проложен через акценты
 * самих фаз — фиолетовый фокуса, бирюзовый перерыва, оранжевый длинного.
 * Поэтому вспышка читается как разложение уже знакомого цвета, а не как
 * чужая картинка поверх экрана. Последний цвет повторяет первый —
 * круговой градиент обязан сойтись в точке замыкания.
 */
export const SPECTRUM = [
  '#6E5BFF',
  '#3D6BFF',
  '#2FDCC0',
  '#A8E85C',
  '#FFD166',
  '#FF9B63',
  '#FF6B9D',
  '#6E5BFF',
];

/**
 * Готовые наборы длительностей.
 *
 * Три числа по отдельности — плохая настройка: их надо согласовывать между
 * собой, и человек не знает, с чего начать. Набор снимает этот выбор,
 * а вручную остаётся регулятор на кольце.
 */
export type PresetKey = 'classic' | 'deep' | 'brief';

export const PRESETS: Record<PresetKey, Record<Phase, number>> = {
  // Классика Помодоро — с неё всё началось
  classic: { focus: 25 * 60, short: 5 * 60, long: 15 * 60 },
  // Под длинную работу: полчаса мало, чтобы разогнаться
  deep: { focus: 50 * 60, short: 10 * 60, long: 30 * 60 },
  // Когда трудно начать. Пятнадцать минут не страшно пообещать себе
  brief: { focus: 15 * 60, short: 3 * 60, long: 10 * 60 },
};

/** Какому набору отвечают текущие длительности. `null` — своё */
export function matchPreset(d: Record<Phase, number>): PresetKey | null {
  const keys = Object.keys(PRESETS) as PresetKey[];
  return (
    keys.find(
      (k) =>
        PRESETS[k].focus === d.focus &&
        PRESETS[k].short === d.short &&
        PRESETS[k].long === d.long
    ) ?? null
  );
}

/** Сколько фокус-сессий до длинного перерыва */
export const SESSIONS_PER_ROUND = 4;

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}

/**
 * Часы и минуты вида «14:25» — или «2:25 PM», если попросили.
 *
 * Функции чистые, а `hour12` приходит снаружи: он зависит от языка
 * интерфейса, а язык живёт в настройках, до которых модулю с палитрой
 * дела нет. Кому нужен готовый ответ — берут `useClock` из settings.
 */
export function formatTimeOfDay(d: Date, hour12: boolean): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const mm = `${m < 10 ? '0' : ''}${m}`;
  if (!hour12) return `${h < 10 ? '0' : ''}${h}:${mm}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Ровный час вида «14:00» или «2 PM» — для подписей осей и окон */
export function formatHour(h: number, hour12: boolean): string {
  if (!hour12) return `${h < 10 ? '0' : ''}${h}:00`;
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
}

/** Время окончания в виде «14:25» — для чипа и щита */
export function formatEndTime(secondsFromNow: number, hour12: boolean): string {
  return formatTimeOfDay(new Date(Date.now() + secondsFromNow * 1000), hour12);
}

/**
 * Антиква для заголовков и цифр — Playfair Display, вшита файлом
 * в assets/fonts. Системные New York и SF Pro Rounded по имени из
 * React Native не достаются: iOS молча подставляет гротеск, ошибки нет.
 * Лицензия OFL — вшивать в коммерческое приложение можно.
 */
export const SERIF_MEDIUM = 'PlayfairDisplay-500';
export const SERIF = 'PlayfairDisplay-600';
export const SERIF_BOLD = 'PlayfairDisplay-700';

/**
 * Цвет с прозрачностью для тинта стекла. Насыщенный тинт «в лоб» гасит
 * преломление и превращает материал обратно в плоскую заливку.
 */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
