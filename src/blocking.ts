import {
  UIBlurEffectStyle,
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

/** Один сохранённый набор приложений на весь Deep Focus */
export const SELECTION_ID = 'deepFocus';

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

export function hasSelection(): boolean {
  return Boolean(getFamilyActivitySelectionId(SELECTION_ID));
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

export function startBlocking(t: T, endsAt: string) {
  // Новая сессия — новая фраза. Повторять её изо дня в день бессмысленно:
  // на третий раз человек перестаёт её читать.
  phrase = pickEncouragement(t);
  dressShield(t, endsAt);
  blockSelection({ activitySelectionId: SELECTION_ID }, 'deep-focus-on');
}

export function stopBlocking() {
  phrase = null;
  resetBlocks('deep-focus-off');
}
