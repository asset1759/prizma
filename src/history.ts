import { File, Paths } from 'expo-file-system';

/**
 * История досчитанных сессий.
 *
 * Отдельный файл, а не поле в настройках: настройки читаются целиком при
 * каждом запуске и переписываются на любое изменение, а история только
 * растёт и нужна одному экрану. Смешивать их значило бы переписывать
 * год работы ради переключения темы.
 *
 * Пишутся только фокус-сессии и только досчитанные. Перерыв — не
 * достижение, а прерванная сессия не состоялась: показывать в прогрессе
 * то, что человек бросил, значит поздравлять его с этим.
 */

export type Session = {
  /** Момент окончания, миллисекунды эпохи */
  at: number;
  /** Сколько длилась, секунды */
  sec: number;
  /** Была ли включена блокировка */
  deep: boolean;
};

const FILE_NAME = 'prizma-history.json';

/** Дольше года назад никакой экран не смотрит, а файл растёт вечно */
const KEEP_DAYS = 400;

function file() {
  return new File(Paths.document, FILE_NAME);
}

export function all(): Session[] {
  try {
    const f = file();
    if (!f.exists) return [];
    const raw = JSON.parse(f.textSync());
    return Array.isArray(raw) ? (raw as Session[]) : [];
  } catch {
    // Битый файл не должен ломать экран — покажем пустую историю.
    return [];
  }
}

export function record(sec: number, deep: boolean) {
  try {
    const cutoff = Date.now() - KEEP_DAYS * 86400_000;
    const next = [...all().filter((s) => s.at > cutoff), { at: Date.now(), sec, deep }];
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Не записалось — потеря одной сессии не повод ронять окончание фазы.
  }
}

/** Полночь по местному времени для дня, в который попадает момент */
function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function today(list: Session[]): { sec: number; count: number } {
  const from = dayStart(Date.now());
  const mine = list.filter((s) => s.at >= from);
  return { sec: mine.reduce((a, s) => a + s.sec, 0), count: mine.length };
}

/**
 * Последние семь дней, от старого к новому. Возвращаются все семь,
 * включая пустые: провал в середине недели — тоже сведение, и рисовать
 * его надо, а не пропускать.
 */
export function week(list: Session[]): { at: number; sec: number }[] {
  const today0 = dayStart(Date.now());
  return Array.from({ length: 7 }, (_, i) => {
    const from = today0 - (6 - i) * 86400_000;
    const to = from + 86400_000;
    const sec = list
      .filter((s) => s.at >= from && s.at < to)
      .reduce((a, s) => a + s.sec, 0);
    return { at: from, sec };
  });
}

/**
 * Сколько дней подряд была хотя бы одна сессия, считая назад от сегодня.
 *
 * Сегодняшний день без сессий серию не обрывает: она считается от
 * вчерашнего. Иначе до первой сессии человек каждое утро видел бы ноль
 * вместо накопленного за месяц.
 */
export function streak(list: Session[]): number {
  if (list.length === 0) return 0;

  const days = new Set(list.map((s) => dayStart(s.at)));
  const today0 = dayStart(Date.now());

  let n = 0;
  let cursor = days.has(today0) ? today0 : today0 - 86400_000;
  while (days.has(cursor)) {
    n += 1;
    cursor -= 86400_000;
  }
  return n;
}

/**
 * Час, в который сессии начинаются чаще всего.
 *
 * Единственное, чего человек о себе не знает: сколько он работал, он
 * помнит, а когда именно у него получается — нет. Меньше трёх сессий
 * не считаем: по одной-двум это не наблюдение, а совпадение.
 */
export function bestHour(list: Session[]): number | null {
  if (list.length < 3) return null;

  const bins = new Array(24).fill(0);
  for (const s of list) {
    // Момент записан по окончании — начало интереснее, оно и есть привычка.
    bins[new Date(s.at - s.sec * 1000).getHours()] += 1;
  }

  let best = 0;
  for (let h = 1; h < 24; h += 1) if (bins[h] > bins[best]) best = h;
  return bins[best] > 0 ? best : null;
}
