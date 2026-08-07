import {
  configureActions,
  getActivities,
  startMonitoring,
  stopMonitoring,
} from 'react-native-device-activity';

import { listId, type ListKey } from './blocking';

/**
 * Расписание Deep Focus.
 *
 * Главное требование: оно обязано срабатывать, когда приложение закрыто.
 * Поэтому ни одна строчка JavaScript в нужный момент не выполняется —
 * действия объявляются заранее через `configureActions`, а исполняет их
 * расширение DeviceActivityMonitor силами системы.
 *
 * Отсюда устройство: на каждый выбранный день недели заводится своя
 * активность. Одной общей не обойтись — Apple повторяет расписание либо
 * ежедневно, либо по конкретному дню, промежуточного нет.
 */

export type Schedule = {
  on: boolean;
  /** Дни недели по Apple: 1 — воскресенье, 7 — суббота */
  days: number[];
  /** Часы, 0…23. Минуты намеренно не спрашиваем — см. экран */
  from: number;
  to: number;
  /**
   * Сообщать о начале окна.
   *
   * Свойство расписания, а не строка в общем списке уведомлений: окно
   * начинается без участия человека, и без сообщения он узнаёт об этом,
   * только ткнувшись в закрытое приложение. Парного «окно закончилось»
   * нет намеренно — уведомление «соцсети снова открыты» приложение для
   * фокуса не отправляет.
   */
  announce: boolean;
};

export const DEFAULT_SCHEDULE: Schedule = {
  on: false,
  // Будни: понедельник — пятница
  days: [2, 3, 4, 5, 6],
  from: 9,
  to: 12,
  announce: true,
};

/**
 * Имена активностей дня.
 *
 * Обычное окно — одна активность. Окно через полночь («с 22 до 7») —
 * две: вечерняя на выбранном дне и утренняя на следующем. Apple не умеет
 * интервал, который перешагивает сутки: `intervalEnd` должен быть позже
 * `intervalStart` в тех же сутках, иначе система молча не заводит
 * наблюдение вовсе.
 */
function activityName(day: number, part?: 'a' | 'b'): string {
  return part ? `prizma.schedule.${day}.${part}` : `prizma.schedule.${day}`;
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Следующий день недели по нумерации Apple: 1 — воскресенье, 7 — суббота */
const nextDay = (d: number) => (d === 7 ? 1 : d + 1);

/** Идёт ли окно прямо сейчас — в том числе если оно перешагнуло полночь */
export function isWindowOpen(s: Schedule, at = new Date()): boolean {
  if (!s.on || s.days.length === 0 || s.from === s.to) return false;

  const day = at.getDay() + 1;
  const hour = at.getHours();

  if (s.from < s.to) return s.days.includes(day) && hour >= s.from && hour < s.to;

  // Через полночь: до полуночи считаем по сегодняшнему дню, после —
  // по вчерашнему, потому что окно завёл именно он.
  if (hour >= s.from) return s.days.includes(day);
  if (hour < s.to) return s.days.includes(day === 1 ? 7 : day - 1);
  return false;
}

/**
 * Приводит систему в соответствие с расписанием.
 *
 * Снимаем всё своё и заводим заново, а не пытаемся вычислить разницу:
 * состояние живёт в системе, а не у нас, и «починить на месте» здесь
 * означало бы гадать о том, чего мы не видим.
 */
export type Announce = { title: string; body: string };

export async function applySchedule(
  s: Schedule,
  list: ListKey,
  /**
   * Текст уведомления о начале окна, уже переведённый.
   *
   * Вшивается в действие заранее, потому что в момент срабатывания
   * JavaScript не выполняется и спросить перевод будет не у кого. Отсюда
   * важное следствие: смена языка обязана перезаводить расписание, иначе
   * человек будет получать уведомления на прежнем языке до следующей
   * правки часов.
   */
  announce?: Announce
) {
  // Снимаем прежние — все семь, даже если день сейчас не выбран:
  // он мог быть выбран вчера.
  for (const d of ALL_DAYS) {
    try {
      stopMonitoring([activityName(d), activityName(d, 'a'), activityName(d, 'b')]);
    } catch {
      // Активности могло не быть — это не ошибка, а обычное состояние.
    }
  }

  if (!s.on || s.days.length === 0 || s.from === s.to) return;

  const overnight = s.from > s.to;
  const say = s.announce ? announce : undefined;

  for (const d of s.days) {
    if (overnight) {
      // Вечерняя половина: конец суток закрывать не надо — щит снимет
      // утренняя половина. Иначе между 23:59 и 00:00 приложения на
      // минуту открывались бы посреди ночного окна.
      await arm(activityName(d, 'a'), list, d, s.from, 23, 59, false, say);
      // Утренняя половина о себе не сообщает: окно то же самое, а два
      // баннера за ночь — это уже назойливость.
      await arm(activityName(d, 'b'), list, nextDay(d), 0, s.to, 0, true);
    } else {
      await arm(activityName(d), list, d, s.from, s.to, 0, true, say);
    }
  }
}

/**
 * Заводит одну активность.
 *
 * Что делать на границах окна, объявляется заранее: в сам момент
 * приложение может быть выгружено, и спросить его будет не у кого.
 */
async function arm(
  name: string,
  list: ListKey,
  weekday: number,
  fromHour: number,
  toHour: number,
  toMinute: number,
  release: boolean,
  announce?: Announce
) {
  configureActions({
    activityName: name,
    callbackName: 'intervalDidStart',
    actions: [
      { type: 'blockSelection', familyActivitySelectionId: listId(list) },
      // Единственное уведомление, сообщающее о том, что произошло без
      // участия человека. Без него он узнаёт о закрытых приложениях,
      // только ткнувшись в закрытое и упершись в щит.
      ...(announce
        ? [
            {
              type: 'sendNotification' as const,
              payload: {
                title: announce.title,
                body: announce.body,
                // Без звука намеренно: сообщение «телефон стал тише»,
                // объявленное звуком, противоречит само себе.
                interruptionLevel: 'active' as const,
              },
            },
          ]
        : []),
    ],
  });

  configureActions({
    activityName: name,
    callbackName: 'intervalDidEnd',
    actions: release ? [{ type: 'resetBlocks' }] : [],
  });

  try {
    await startMonitoring(
      name,
      {
        intervalStart: { hour: fromHour, minute: 0, weekday },
        intervalEnd: { hour: toHour, minute: toMinute, weekday },
        repeats: true,
      },
      []
    );
  } catch {
    // Один упавший день не должен уносить остальные.
  }
}

/** Сколько наших активностей система знает сейчас — для проверки */
export function scheduledCount(): number {
  try {
    return getActivities().filter((a) => a.startsWith('prizma.schedule.')).length;
  } catch {
    return 0;
  }
}
