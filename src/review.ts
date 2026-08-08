import * as StoreReview from 'expo-store-review';

import { all, isDone } from './history';

/**
 * Просьба оценить приложение.
 *
 * Экран рисует Apple, и она же его дозирует: не больше трёх показов в
 * год на человека, а лишние проглатывает молча — приложение даже не
 * узнает, показали его или нет. Значит попыток у нас три на всю жизнь
 * пользователя, и тратить их надо там, где приложение только что
 * очевидно сработало.
 *
 * Отсюда всё остальное. Ни на запуске, ни после пейвола, ни после
 * сброса: в эти секунды человеку нечего оценивать, а иногда есть за что
 * сердиться. Единственный честный момент — сразу после досчитанной
 * фазы, когда кольцо вспыхнуло и он на него смотрит.
 */

/**
 * После скольких досчитанных сессий спрашиваем.
 *
 * Первая — когда привычка уже похожа на привычку, но человек ещё в том
 * возрасте отношений, когда впечатление свежее. Вторая — когда он давно
 * свой и знает, о чём говорит. Третью Apple прибережёт сама, если наши
 * два раза попали в её лимит.
 */
const MILESTONES = [5, 25];

/** Между просьбами не меньше трёх месяцев, даже если веха следующая */
const QUIET_MS = 90 * 86400_000;

export type ReviewState = { askedAt: number | null; askedAt2: number | null };

/**
 * Стоит ли просить прямо сейчас.
 *
 * Чистая функция: решение отделено от показа, чтобы его можно было
 * прочитать целиком, не заглядывая в StoreKit.
 */
export function shouldAsk(state: ReviewState, doneCount: number, now = Date.now()): boolean {
  const asks = [state.askedAt, state.askedAt2].filter((x): x is number => x !== null);
  if (asks.length >= MILESTONES.length) return false;

  const last = asks.length > 0 ? Math.max(...asks) : null;
  if (last !== null && now - last < QUIET_MS) return false;

  // Веха ровно та, которую ещё не проходили: спрашиваем на пятой сессии,
  // а не на всякой после пятой.
  return doneCount >= MILESTONES[asks.length];
}

/** Сколько фаз человек досчитал за всё время */
export function doneCount(): number {
  try {
    return all().filter(isDone).length;
  } catch {
    return 0;
  }
}

/**
 * Показывает системный запрос, если он вообще доступен.
 *
 * Возвращает, была ли попытка, — но не то, увидел ли её человек: этого
 * Apple не сообщает никому. Поэтому отметку о просьбе ставим по факту
 * попытки, а не по факту показа: иначе при заглушённом лимите мы бы
 * спрашивали на каждой сессии подряд.
 */
export async function ask(): Promise<boolean> {
  try {
    if (!(await StoreReview.hasAction())) return false;
    await StoreReview.requestReview();
    return true;
  } catch {
    return false;
  }
}
