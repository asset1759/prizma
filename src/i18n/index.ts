import { de } from './de';
import { en, type Dict, type Key } from './en';
import { es } from './es';
import { fr } from './fr';
import { pt } from './pt';
import { ru } from './ru';

/**
 * Языки приложения.
 *
 * Определение языка устройства сделано без нативной зависимости: Hermes
 * отдаёт локаль через `Intl`, и `expo-localization` ради одной строки
 * тянуть незачем — он потребовал бы пересборки.
 *
 * ВАЖНО: `Intl.PluralRules` в Hermes НЕТ, проверено на устройстве.
 * Сейчас строк с числительными нет ни одной, но когда появятся итоги
 * («3 сессии», «5 сессий»), правила для русского придётся писать руками.
 */

export type Lang = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr';

/** `auto` — следовать языку телефона */
export type LangSetting = Lang | 'auto';

const DICTS: Record<Lang, Dict> = { en, ru, es, pt, de, fr };

/** Как язык называется на самом себе — в списке выбора иначе не разобраться */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  es: 'Español',
  pt: 'Português',
  de: 'Deutsch',
  fr: 'Français',
};

export const LANGS = Object.keys(DICTS) as Lang[];

/**
 * Язык телефона, если он у нас есть.
 *
 * Берём только основную часть тега: `pt-BR` и `pt-PT` для нас один
 * португальский, разводить их ради десятка строк смысла нет.
 */
export function deviceLang(): Lang {
  try {
    const tag = new Intl.DateTimeFormat().resolvedOptions().locale;
    const base = tag.split('-')[0].toLowerCase() as Lang;
    return base in DICTS ? base : 'en';
  } catch {
    // Локаль недоступна — не повод падать, английский поймут везде.
    return 'en';
  }
}

export function resolveLang(setting: LangSetting): Lang {
  return setting === 'auto' ? deviceLang() : setting;
}

/**
 * Перевод с подстановками вида `{time}`.
 *
 * Если в словаре языка ключа не оказалось, берём английский: пустая
 * строка в интерфейсе хуже строки не на том языке.
 */
export function translate(
  lang: Lang,
  key: Key,
  vars?: Record<string, string | number>
): string {
  const raw = DICTS[lang][key] ?? en[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m
  );
}

export type { Dict, Key };
