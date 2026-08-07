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
};

export const DEFAULT_SCHEDULE: Schedule = {
  on: false,
  // Будни: понедельник — пятница
  days: [2, 3, 4, 5, 6],
  from: 9,
  to: 12,
};

/** Имя активности для дня недели. По нему же её потом и снимаем */
function activityName(day: number): string {
  return `prizma.schedule.${day}`;
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Приводит систему в соответствие с расписанием.
 *
 * Снимаем всё своё и заводим заново, а не пытаемся вычислить разницу:
 * состояние живёт в системе, а не у нас, и «починить на месте» здесь
 * означало бы гадать о том, чего мы не видим.
 */
export async function applySchedule(s: Schedule, list: ListKey) {
  // Снимаем прежние — все семь, даже если день сейчас не выбран:
  // он мог быть выбран вчера.
  for (const d of ALL_DAYS) {
    try {
      stopMonitoring([activityName(d)]);
    } catch {
      // Активности могло не быть — это не ошибка, а обычное состояние.
    }
  }

  if (!s.on || s.days.length === 0 || s.from === s.to) return;

  for (const d of s.days) {
    const name = activityName(d);

    /**
     * Что делать на границах окна. Объявляется до того, как окно
     * наступит: в сам момент приложение может быть выгружено, и спросить
     * его будет не у кого.
     */
    configureActions({
      activityName: name,
      callbackName: 'intervalDidStart',
      actions: [{ type: 'blockSelection', familyActivitySelectionId: listId(list) }],
    });

    configureActions({
      activityName: name,
      callbackName: 'intervalDidEnd',
      actions: [{ type: 'resetBlocks' }],
    });

    try {
      await startMonitoring(
        name,
        {
          intervalStart: { hour: s.from, minute: 0, weekday: d },
          intervalEnd: { hour: s.to, minute: 0, weekday: d },
          repeats: true,
        },
        []
      );
    } catch {
      // Один упавший день не должен уносить остальные.
    }
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
