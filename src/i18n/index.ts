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
 * Регионы, где часы читают по двенадцать, а не по двадцать четыре.
 *
 * Из наших рынков это прежде всего США — американец, увидев «14:25»,
 * читает его с задержкой, а «около 09:00» звучит как расписание поездов.
 * Список намеренно короткий: только те страны, где двенадцатичасовая
 * запись — норма письма, а не разговора. Латинская Америка говорит
 * «las nueve», но пишет 21:00, и Аргентина с Чили сюда не входят.
 */
const HOUR12 = new Set([
  'US', 'CA', 'AU', 'NZ', 'PH', 'IN', 'PK', 'BD', 'MY', 'MX', 'CO', 'EG', 'SA',
]);

function region(): string | undefined {
  try {
    return new Intl.DateTimeFormat()
      .resolvedOptions()
      .locale.split('-')
      .find((part) => part.length === 2 && part === part.toUpperCase());
  } catch {
    return undefined;
  }
}

export function uses12Hour(): boolean {
  const r = region();
  return r !== undefined && HOUR12.has(r);
}

/**
 * Регионы, где неделя начинается с воскресенья (по данным CLDR).
 *
 * Список нужен целиком, а не «США и всё»: из наших рынков с воскресенья
 * неделю начинают Бразилия, Мексика, Колумбия, Перу и Венесуэла — вся
 * латиноамериканская половина плана. Аргентина, Чили и Уругвай, наоборот,
 * начинают с понедельника, так что «вся ЛатАм» тоже было бы неправдой.
 *
 * Страны с субботним началом недели (арабский мир) сюда не входят: в
 * планах их нет, а неверное упрощение хуже честного пробела — когда
 * дойдёт дело, это место надо будет открыть заново.
 */
const SUNDAY_FIRST = new Set([
  'AG', 'AS', 'BD', 'BR', 'BS', 'BT', 'BW', 'BZ', 'CA', 'CO', 'DM', 'DO',
  'ET', 'GT', 'GU', 'HK', 'HN', 'ID', 'IL', 'IN', 'JM', 'JP', 'KE', 'KH',
  'KR', 'LA', 'MH', 'MM', 'MO', 'MT', 'MX', 'MZ', 'NI', 'NP', 'PA', 'PE',
  'PH', 'PK', 'PR', 'PY', 'SA', 'SG', 'SV', 'TH', 'TT', 'TW', 'UM', 'US',
  'VE', 'VI', 'WS', 'YE', 'ZA', 'ZW',
]);

/**
 * С какого дня рисовать неделю: 0 — воскресенье, 1 — понедельник.
 *
 * Определяется регионом телефона, а НЕ выбранным в приложении языком:
 * человек в Нью-Йорке, переключивший интерфейс на испанский, живёт по
 * американской неделе, а не по испанской. Регион — это где ты, язык —
 * на чём ты читаешь, и путать их нельзя.
 *
 * `Intl.Locale.getWeekInfo()` решил бы это сам, но в Hermes его нет —
 * там нет даже `PluralRules`, см. `pluralForm` ниже.
 */
export function firstDayOfWeek(): 0 | 1 {
  const r = region();
  return r !== undefined && SUNDAY_FIRST.has(r) ? 0 : 1;
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

/**
 * Форма числительного.
 *
 * `Intl.PluralRules` в Hermes нет — проверено на устройстве, поэтому
 * правила приходится держать здесь. Русскому нужны три формы, остальным
 * нашим языкам хватает двух: у них `few` просто совпадает с `many`.
 *
 * Правило для русского: 1, 21, 31 — но не 11; 2–4, 22–24 — но не 12–14;
 * всё прочее — третья форма.
 */
export type PluralForm = 'One' | 'Few' | 'Many';

export function pluralForm(lang: Lang, n: number): PluralForm {
  if (lang !== 'ru') return n === 1 ? 'One' : 'Many';

  const ones = n % 10;
  const tens = n % 100;
  if (ones === 1 && tens !== 11) return 'One';
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 'Few';
  return 'Many';
}

export type { Dict, Key };
