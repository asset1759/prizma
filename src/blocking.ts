import {
  UIBlurEffectStyle,
  activitySelectionMetadata,
  blockSelection,
  getFamilyActivitySelectionId,
  setFamilyActivitySelectionId,
  isShieldActive,
  requestAuthorization,
  resetBlocks,
  updateShield,
  updateShieldWithId,
  useShieldWithId,
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

/**
 * Перенос выбора из версии, где список был один.
 *
 * До появления именованных списков набор хранился под именем `deepFocus`.
 * После переименования он остался бы лежать невидимым, а человек увидел
 * бы пустой список и заново отмечал то, что уже отмечал руками.
 *
 * Выполняется один раз при запуске и молчит, если переносить нечего.
 */
export function migrateLegacySelection() {
  const legacy = getFamilyActivitySelectionId('deepFocus');
  if (!legacy) return;
  // Уже перенесено или человек успел набрать свой — не затираем.
  if (getFamilyActivitySelectionId(listId('social'))) return;
  setFamilyActivitySelectionId({
    id: listId('social'),
    familyActivitySelection: legacy,
  });
}

/**
 * Заполнен ли список.
 *
 * Намеренно самая простая проверка — есть ли сохранённый выбор. Разбор
 * метаданных сюда тянуть нельзя: он нужен только чтобы показать цифру,
 * а если вдруг не ответит, Deep Focus просто перестанет включаться.
 * Так и вышло однажды, и молча.
 */
export function hasSelection(key: ListKey): boolean {
  return Boolean(getFamilyActivitySelectionId(listId(key)));
}

/**
 * Сколько отмечено — только для показа. `null` значит «нечего показать»,
 * а не «списка нет»: об этом спрашивают у `hasSelection`.
 */
export function listSize(
  key: ListKey
): { apps: number; categories: number; sites: number } | null {
  const raw = getFamilyActivitySelectionId(listId(key));
  if (!raw) return null;
  const m = activitySelectionMetadata({ activitySelectionId: listId(key) });
  if (!m) return null;
  const total = m.applicationCount + m.categoryCount + m.webDomainCount;
  // Домены считались в сумме и терялись при возврате: выбор из одних
  // сайтов давал непустой `total` и пустую сводку.
  return total > 0
    ? {
        apps: m.applicationCount,
        categories: m.categoryCount,
        sites: m.webDomainCount,
      }
    : null;
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

export function isBlocking(): boolean {
  try {
    return isShieldActive();
  } catch {
    return false;
  }
}

/**
 * Щитов два, и они рассказывают о разном.
 *
 * `session` — идёт помидор, приложения закрыты до конца фазы.
 * `schedule` — идёт окно расписания, приложения закрыты до конца окна.
 *
 * Пока конфигурация была одна на всё приложение, в окне расписания
 * человек читал время вчерашней сессии, а на свежей установке — пустой
 * системный щит без единого нашего слова: одевал его только таймер.
 */
export type ShieldKind = 'session' | 'schedule';

/** Общая раскладка. Различаются только подписью — всё остальное одно и то же */
function shieldLook(t: T, subtitle: string) {
  return {
    // Тёмное размытие принудительно: щит рисуется в системной теме,
    // и на светлой наш белый текст оказывался на белом фоне.
    backgroundBlurStyle: UIBlurEffectStyle.systemThickMaterialDark,
    // Не до конца непрозрачно — сквозь фон угадывается размытое
    // приложение, которое человек пытался открыть.
    backgroundColor: rgb('#0B1024', 0.82),
    title: t('shieldTitle'),
    titleColor: rgb('#FFFFFF'),
    subtitle,
    subtitleColor: rgb('#B9C6E8'),
    iconSystemName: 'shield.lefthalf.filled',
    iconTint: rgb('#7FA3FF'),
    primaryButtonLabel: t('shieldButton'),
    primaryButtonLabelColor: rgb('#000000'),
    primaryButtonBackgroundColor: rgb('#FFFFFF'),
  };
}

/**
 * Что делает единственная кнопка.
 *
 * Просто закрывает щит — человек возвращается на рабочий стол. Открыть
 * отсюда Prizma нельзя: Apple не даёт расширению щита ни NSExtensionContext,
 * ни UIApplication, а ShieldActionResponse умеет только .none, .close и
 * .defer. Действие openApp из библиотеки молча не срабатывает и добавляет
 * секундную паузу — поэтому убрано.
 *
 * Второй кнопки нет намеренно: со щита сессию не оборвать. Выход остаётся
 * ровно один — открыть Prizma и завершить сессию там. Лишний шаг и есть
 * та самая цена решения.
 */
const SHIELD_ACTIONS = { primary: { behavior: 'close' as const } };

/**
 * Готовит щит окна расписания и кладёт его под своим именем.
 *
 * Применит его не приложение, а расширение — в момент начала окна, когда
 * JavaScript не выполняется. Поэтому конфигурация обязана лежать в общей
 * группе заранее, а действие `blockSelection` только назовёт её по имени.
 */
export function prepareScheduleShield(t: T, opensAt: string) {
  updateShieldWithId(
    shieldLook(
      t,
      `${pickEncouragement(t)}\n\n${t('shieldOpensAt', { time: opensAt })}`
    ),
    SHIELD_ACTIONS,
    'schedule'
  );
}

/** Вернуть щиту вид окна расписания — например, когда кончился помидор внутри окна */
export function wearScheduleShield() {
  try {
    useShieldWithId('schedule');
  } catch {
    // Конфигурации может не быть, если расписание ни разу не заводили.
  }
}

/**
 * Одеваем щит — тот самый экран, который человек увидит, машинально открыв
 * соцсеть. Раскладку Apple менять не даёт, но все слоты наши.
 */
export function dressShield(t: T, endsAt: string) {
  if (!phrase) phrase = pickEncouragement(t);

  const look = shieldLook(
    t,
    // Сначала фраза, потом факт: время разблокировки должно остаться
    // последним, что человек читает перед тем, как закрыть щит.
    `${phrase}\n\n${t('shieldOpensAt', { time: endsAt })}`
  );
  // Под своим именем — чтобы расписание могло вернуть свой, не затирая наш.
  updateShieldWithId(look, SHIELD_ACTIONS, 'session');
  updateShield(look, SHIELD_ACTIONS);
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
