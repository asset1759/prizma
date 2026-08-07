import {
  UIBlurEffectStyle,
  activitySelectionMetadata,
  blockSelection,
  getFamilyActivitySelectionId,
  isShieldActive,
  requestAuthorization,
  resetBlocks,
  updateShield,
} from 'react-native-device-activity';

import type { Key } from './i18n';
import type { T } from './settings';

/**
 * Блокировка приложений через Screen Time.
 *
 * Работает только на живом устройстве: на симуляторе FamilyControls
 * не поднимается вообще, ошибок при этом не даёт — просто ничего не делает.
 */

/**
 * Списки приложений.
 *
 * Заполнить их за человека нельзя: Apple выдаёт токены приложений только
 * через свой экран выбора, и наружу они непрозрачны. Ни одно приложение
 * не может собрать «Соцсети» само — можно лишь дать списку имя, объяснить,
 * что в него класть, и запомнить выбранное.
 *
 * Поэтому здесь только имена и хранилище. Содержимое приносит Apple.
 */
export type ListKey = 'social' | 'games' | 'custom';

export const LIST_KEYS: ListKey[] = ['social', 'games', 'custom'];

/** Идентификатор хранения — по нему Screen Time помнит выбор */
export function listId(key: ListKey): string {
  return `deepFocus.${key}`;
}

/** Сколько всего отмечено в списке. `null` — список ещё не заполняли */
export function listSize(key: ListKey): { apps: number; categories: number } | null {
  const raw = getFamilyActivitySelectionId(listId(key));
  if (!raw) return null;
  // Метаданные принимают сам токен выбора, а не строку-идентификатор.
  const m = activitySelectionMetadata({ activitySelectionToken: raw });
  if (!m) return null;
  const total = m.applicationCount + m.categoryCount + m.webDomainCount;
  return total > 0 ? { apps: m.applicationCount, categories: m.categoryCount } : null;
}

/**
 * Фраза выбирается один раз на сессию, а не на каждый показ щита: внутри
 * одной сессии текст не должен прыгать, а вот повторять его изо дня в день
 * бессмысленно — на третий раз человек перестаёт его читать.
 */
const ENCOURAGEMENTS: Key[] = [
  'encouragement1',
  'encouragement2',
  'encouragement3',
  'encouragement4',
  'encouragement5',
  'encouragement6',
];

function pickEncouragement(t: T): string {
  return t(ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)]);
}

/**
 * Фраза текущей сессии. Щит переодевается не только при включении —
 * время окончания меняется от старта, паузы и регулятора, — и без этой
 * памяти каждая такая перерисовка тасовала бы текст заново.
 */
let phrase: string | null = null;

/**
 * Альфа в UIColor формально необязательна, но без неё нативная сторона
 * считает цвет полностью прозрачным — фон щита просто не появлялся.
 * Поэтому задаём всегда, по умолчанию непрозрачно.
 */
function rgb(hex: string, alpha = 1) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16),
    green: parseInt(h.slice(2, 4), 16),
    blue: parseInt(h.slice(4, 6), 16),
    alpha,
  };
}

/** Системный диалог Screen Time. Отказ пользователя — не ошибка, а выбор. */
export async function ensureAuthorized(): Promise<boolean> {
  try {
    await requestAuthorization('individual');
    return true;
  } catch {
    return false;
  }
}

export function hasSelection(key: ListKey): boolean {
  return listSize(key) !== null;
}

export function isBlocking(): boolean {
  try {
    return isShieldActive();
  } catch {
    return false;
  }
}

/**
 * Одеваем щит — тот самый экран, который человек увидит, машинально открыв
 * соцсеть. Раскладку Apple менять не даёт, но все слоты наши.
 */
export function dressShield(t: T, endsAt: string) {
  if (!phrase) phrase = pickEncouragement(t);

  updateShield(
    {
      // Тёмное размытие принудительно: щит рисуется в системной теме,
      // и на светлой наш белый текст оказывался на белом фоне.
      backgroundBlurStyle: UIBlurEffectStyle.systemThickMaterialDark,
      // Не до конца непрозрачно — сквозь фон угадывается размытое
      // приложение, которое человек пытался открыть.
      backgroundColor: rgb('#0B1024', 0.82),
      title: t('shieldTitle'),
      titleColor: rgb('#FFFFFF'),
      // Сначала фраза, потом факт: время разблокировки должно остаться
      // последним, что человек читает перед тем, как закрыть щит.
      subtitle: `${phrase}\n\n${t('shieldOpensAt', { time: endsAt })}`,
      subtitleColor: rgb('#B9C6E8'),
      iconSystemName: 'shield.lefthalf.filled',
      iconTint: rgb('#7FA3FF'),
      primaryButtonLabel: t('shieldButton'),
      primaryButtonLabelColor: rgb('#000000'),
      primaryButtonBackgroundColor: rgb('#FFFFFF'),
      // Второй кнопки нет намеренно: со щита сессию не оборвать.
      // Выход остаётся ровно один — открыть Prizma и завершить сессию там.
      // Лишний шаг и есть та самая цена решения.
    },
    {
      // Просто закрываем щит — человек возвращается на рабочий стол.
      //
      // Открыть отсюда Prizma нельзя: Apple не даёт расширению щита ни
      // NSExtensionContext, ни UIApplication, а ShieldActionResponse
      // умеет только .none, .close и .defer. Действие openApp из библиотеки
      // молча не срабатывает и добавляет секундную паузу — поэтому убрано.
      primary: { behavior: 'close' },
    }
  );
}

export function startBlocking(t: T, key: ListKey, endsAt: string) {
  // Новая сессия — новая фраза. Повторять её изо дня в день бессмысленно:
  // на третий раз человек перестаёт её читать.
  phrase = pickEncouragement(t);
  dressShield(t, endsAt);
  blockSelection({ activitySelectionId: listId(key) }, 'deep-focus-on');
}

export function stopBlocking() {
  phrase = null;
  resetBlocks('deep-focus-off');
}
