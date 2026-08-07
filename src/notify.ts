import * as Notifications from 'expo-notifications';
import { userDefaultsSet } from 'react-native-device-activity';

/**
 * Уведомления.
 *
 * Их три, и каждое пришлось защищать по одному. Приложение для фокуса,
 * которое само дёргает человека пушами, противоречит себе, поэтому планка
 * здесь выше обычной: сюда попадает только то, что человек завёл сам, и
 * то, без чего таймер не работает. Всё, что зовёт вернуться в приложение —
 * серия под угрозой, итоги недели, «давно не заходил», — не попадает
 * никогда, и это решение, а не недоделка.
 *
 * Третье уведомление, о начале окна расписания, отправляет не отсюда, а
 * системное расширение: в тот момент JavaScript не выполняется вовсе.
 * См. `configureActions` в `schedule.ts`.
 */

/** Один запрос на фазу в любой момент — поэтому идентификатор постоянный */
const PHASE_ID = 'prizma.phase.end';
const DAILY_PREFIX = 'prizma.daily.';

/**
 * На переднем плане баннер не показываем.
 *
 * Там сигнал даёт вспышка кольца, а человек и так смотрит на экран.
 * Обработчик ставим явно: без него поведение зависело бы от умолчаний
 * пакета, а это решение, а не случайность.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export async function permissionState(): Promise<PermissionState> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'undetermined';
  }
}

/**
 * Спрашивает разрешение, если его ещё не спрашивали.
 *
 * Выстрел один: iOS показывает системный диалог ровно раз, и отказ
 * изнутри приложения не отменить — только через Настройки, куда почти
 * никто не ходит. Поэтому зовётся не при запуске, а в ответ на
 * осознанное действие: конец первой досчитанной фазы или включение
 * переключателя.
 */
export async function ensurePermission(): Promise<boolean> {
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return true;
    if (!p.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowSound: true,
        // Уровень «важно» пробивает режимы фокусирования. Без него вся
        // затея рассыпается: наша аудитория включает «Не беспокоить»
        // именно на время работы, и обычный баннер там будет приглушён.
        allowCriticalAlerts: false,
        provideAppNotificationSettings: false,
        allowProvisional: false,
      },
    });
    return asked.granted;
  } catch {
    return false;
  }
}

/* ───────────────────────── конец фазы ───────────────────────── */

/**
 * Ставит сигнал ровно на момент окончания фазы.
 *
 * Триггер абсолютный, а не «через N секунд»: дедлайн у нас и так хранится
 * абсолютным, а такой запрос переживает и выгрузку приложения, и
 * перезагрузку телефона.
 *
 * Тексты приходят снаружи уже переведёнными — этот файл про язык ничего
 * не знает и знать не должен.
 */
export async function schedulePhaseEnd(
  at: number,
  title: string,
  body: string
): Promise<void> {
  if (at <= Date.now() + 1000) return;

  // Зеркало для Swift пишем сразу и синхронно. Паузу с экрана блокировки
  // обрабатывает App Intent, где React Native не поднят: пересобрать
  // запрос он сможет только по готовым строкам.
  mirror({ on: true, title, body });

  try {
    // Отдельной отмены перед этим нет намеренно. Уборка эффекта уже
    // вызвала свою, и вторая асинхронная отмена могла бы прийти позже
    // постановки и снять её. Запрос с тем же идентификатором система
    // и так заменяет.
    await Notifications.scheduleNotificationAsync({
      identifier: PHASE_ID,
      content: {
        title,
        body,
        sound: 'default',
        interruptionLevel: 'timeSensitive',
        // Значка на иконке нет и не будет: счётчик непрочитанного у
        // таймера ничего не считает.
        badge: undefined,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(at),
      },
    });
  } catch {
    // Не поставилось — фаза от этого не сломается.
  }
}

export async function cancelPhaseEnd(): Promise<void> {
  mirror({ on: false });
  try {
    await Notifications.cancelScheduledNotificationAsync(PHASE_ID);
  } catch {
    // Нечего было отменять — обычное состояние.
  }
}

/**
 * Снимает уже показанный баннер о конце фазы.
 *
 * Зовётся при выходе приложения на передний план: человек в этот момент
 * увидел конец фазы глазами, и баннер о нём — мусор в шторке.
 */
export async function dismissPhaseEnd(): Promise<void> {
  try {
    await Notifications.dismissNotificationAsync(PHASE_ID);
  } catch {
    // Нечего было убирать.
  }
}

/* ───────────────────────── время фокуса ───────────────────────── */

/**
 * Напоминание в выбранные дни и час.
 *
 * По одному запросу на день недели — Apple умеет либо ежедневно, либо по
 * конкретному дню, промежуточного нет. Максимум семь при потолке в 64
 * ожидающих на приложение, так что запас огромный.
 */
export async function scheduleDaily(
  days: number[],
  hour: number,
  title: string,
  body: string
): Promise<void> {
  await cancelDaily();
  try {
    for (const d of days) {
      await Notifications.scheduleNotificationAsync({
        identifier: DAILY_PREFIX + d,
        content: {
          title,
          body,
          sound: 'default',
          interruptionLevel: 'active',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: d,
          hour,
          minute: 0,
        },
      });
    }
  } catch {
    // Один непоставленный день не должен уносить остальные.
  }
}

export async function cancelDaily(): Promise<void> {
  try {
    await Promise.all(
      [1, 2, 3, 4, 5, 6, 7].map((d) =>
        Notifications.cancelScheduledNotificationAsync(DAILY_PREFIX + d)
      )
    );
  } catch {
    // Нечего было отменять.
  }
}

/**
 * Снимает сегодняшнее напоминание.
 *
 * Зовётся на старте таймера: звать работать того, кто уже работает, —
 * худший вид уведомления. Закрывает только случай «сел через Prizma»;
 * поработавшего в тетради приложение не видит и увидеть не может.
 */
export async function cancelDailyToday(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(
      DAILY_PREFIX + (new Date().getDay() + 1)
    );
  } catch {
    // Сегодня его и не было.
  }
}

/* ───────────────────────── зеркало для Swift ───────────────────────── */

function mirror(v: { on: boolean; title?: string; body?: string }) {
  try {
    userDefaultsSet('notifPhaseOn', v.on);
    if (v.title !== undefined) userDefaultsSet('notifPhaseTitle', v.title);
    if (v.body !== undefined) userDefaultsSet('notifPhaseBody', v.body);
  } catch {
    // Зеркало не завелось — пауза с локскрина просто не перепланирует
    // сигнал. Ронять из-за этого текущую сессию незачем.
  }
}
