import { File, Paths } from 'expo-file-system';

import { firstDayOfWeek } from './i18n';

/**
 * История сессий и всё, что из неё считается.
 *
 * Отдельный файл, а не поле в настройках: настройки читаются целиком при
 * каждом запуске и переписываются на любое изменение, а история только
 * растёт и нужна одному экрану. Смешивать их значило бы переписывать
 * год работы ради переключения темы.
 *
 * Пишутся все фокус-сессии, включая прерванные, — но показываются
 * по-разному. Правило «не поздравлять человека с тем, что он бросил» —
 * это правило про ПОКАЗ, а не про запись, и разводить их надо явно:
 * прерванные не идут ни в один итог и ни в один столбик, но без них
 * невозможна доля доведённых до конца — единственная метрика
 * приложения, которая умеет ухудшаться.
 */

export type Session = {
  /** Момент окончания, миллисекунды эпохи */
  at: number;
  /** Сколько засчитано, секунды */
  sec: number;
  /** Была ли включена блокировка */
  deep: boolean;
  /**
   * Досчитана ли до конца.
   *
   * Необязательное, и умышленно: до появления этого поля писались только
   * досчитанные, поэтому `done ?? true` для старых записей — правда, а не
   * подстановка. Единственное новое поле, у которого честен умолчательный
   * ответ.
   */
  done?: boolean;
  /**
   * Настоящее начало по настенным часам.
   *
   * Без него начало приходится вычислять как `at - sec*1000`, а `sec` не
   * знает про паузы внутри сессии — значит вычисленное начало смещено
   * вправо ровно на суммарную паузу. Карту суток это смещение портит
   * сильнее всего, поэтому поле есть.
   */
  startedAt?: number;
  /** Сколько было заказано на регуляторе — чтобы отличить «поставил 25 и досчитал» от «поставил 50 и сорвался на 20» */
  planned?: number;
};

const FILE_NAME = 'prizma-history.json';

/** Дольше года назад никакой экран не смотрит, а файл растёт вечно */
const KEEP_DAYS = 400;

/**
 * Короче минуты не пишем вовсе.
 *
 * Иначе случайный тычок «старт — сброс» насыплет мусора в знаменатель
 * доли доведённых, и она поедет вниз без всякой связи с человеком.
 */
const MIN_RECORDED_SEC = 60;

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

export function record(s: Omit<Session, 'at'>) {
  if (s.sec < MIN_RECORDED_SEC) return;
  try {
    const now = Date.now();
    const cutoff = now - KEEP_DAYS * 86400_000;
    const next = [...all().filter((x) => x.at > cutoff), { ...s, at: now }];
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(next));
  } catch {
    // Не записалось — потеря одной сессии не повод ронять окончание фазы.
  }
}

/* ─────────────────────────── чтение записей ─────────────────────────── */

/** Досчитана ли. Старые записи — все досчитанные, других тогда не писали. */
export const isDone = (s: Session) => s.done ?? true;

/** Момент начала. Точный, если он записан; иначе — восстановленный. */
export const startOf = (s: Session) => s.startedAt ?? s.at - s.sec * 1000;

/* ──────────────────────────── шаг по суткам ─────────────────────────── */

/** Полночь по местному времени для дня, в который попадает момент */
export function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Полночь через `n` суток.
 *
 * Именно через `setDate`, а не прибавлением 86 400 000: в дни перевода
 * часов сутки длятся 23 или 25 часов, и арифметика по миллисекундам
 * промахивается мимо полуночи на час. Сессии тогда перетекают между
 * столбиками, а серия рвётся на ровном месте. В СНГ перевода нет, а в
 * Европе, США и ЛатАм — дважды в год гарантированно.
 */
export function addDays(ms: number, n: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ms: number): number {
  const d = new Date(dayStart(ms));
  return addDays(d.getTime(), -((d.getDay() - firstDayOfWeek() + 7) % 7));
}

/* ───────────────────────────── периоды ──────────────────────────────── */

export type Period = 'week' | 'month' | 'year';

export type Range = { from: number; to: number };

/**
 * Границы периода со сдвигом: 0 — текущий, −1 — предыдущий.
 *
 * Границы календарные, а не скользящее окно последних семи дней. Скользящее
 * окно всегда заканчивается сегодня, и понедельник оказывается посреди
 * графика — глаз ищет календарную неделю и читает это как ошибку.
 */
export function periodRange(period: Period, offset: number): Range {
  const now = Date.now();
  if (period === 'week') {
    const from = addDays(startOfWeek(now), offset * 7);
    return { from, to: addDays(from, 7) };
  }
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (period === 'month') {
    d.setDate(1);
    d.setMonth(d.getMonth() + offset);
    const from = d.getTime();
    const e = new Date(from);
    e.setMonth(e.getMonth() + 1);
    return { from, to: e.getTime() };
  }
  d.setMonth(0, 1);
  d.setFullYear(d.getFullYear() + offset);
  const from = d.getTime();
  const e = new Date(from);
  e.setFullYear(e.getFullYear() + 1);
  return { from, to: e.getTime() };
}

/** Насколько далеко назад вообще есть что листать */
export function oldest(list: Session[]): number | null {
  if (list.length === 0) return null;
  return list.reduce((m, s) => Math.min(m, s.at), Infinity);
}

/* ──────────────────────────── сводки ────────────────────────────────── */

export type Summary = {
  /** Секунды досчитанных сессий */
  sec: number;
  /** Число досчитанных сессий */
  count: number;
  /** Из них с блокировкой */
  deepSec: number;
  deepCount: number;
  /** Дней, в которые была хоть одна досчитанная сессия */
  days: number;
  /** Самая длинная сессия периода, секунды */
  longest: number;
  /** Доля доведённых до конца, 0…1 — либо null, если данных для неё нет */
  doneRate: number | null;
};

export function summarize(list: Session[], r: Range): Summary {
  const inRange = list.filter((s) => s.at >= r.from && s.at < r.to);
  const fin = inRange.filter(isDone);
  const days = new Set(fin.map((s) => dayStart(s.at)));

  // Доля доведённых считается ТОЛЬКО по записям, знающим своё `done`:
  // дореформенные иначе войдут в знаменатель сплошным успехом.
  const known = inRange.filter((s) => s.done !== undefined);

  return {
    sec: fin.reduce((a, s) => a + s.sec, 0),
    count: fin.length,
    deepSec: fin.filter((s) => s.deep).reduce((a, s) => a + s.sec, 0),
    deepCount: fin.filter((s) => s.deep).length,
    days: days.size,
    longest: fin.reduce((m, s) => Math.max(m, s.sec), 0),
    doneRate:
      known.length >= 10 ? known.filter(isDone).length / known.length : null,
  };
}

/** Столбик графика: отрезок времени и что в него попало */
export type Bucket = { at: number; sec: number; deepSec: number };

/**
 * Разбиение периода на столбики: неделя и месяц — по дням, год — по месяцам.
 *
 * Пустые сегменты возвращаются тоже: провал посреди недели — такое же
 * сведение, как и пик, и рисовать его надо, а не пропускать.
 */
export function bucketize(list: Session[], period: Period, r: Range): Bucket[] {
  const edges: number[] = [];
  if (period === 'year') {
    const d = new Date(r.from);
    for (let i = 0; i < 12; i += 1) {
      edges.push(new Date(d.getFullYear(), i, 1).getTime());
    }
  } else {
    for (let t = r.from; t < r.to; t = addDays(t, 1)) edges.push(t);
  }

  const fin = list.filter((s) => s.at >= r.from && s.at < r.to).filter(isDone);
  return edges.map((at, i) => {
    const end = i + 1 < edges.length ? edges[i + 1] : r.to;
    const mine = fin.filter((s) => s.at >= at && s.at < end);
    return {
      at,
      sec: mine.reduce((a, s) => a + s.sec, 0),
      deepSec: mine.filter((s) => s.deep).reduce((a, s) => a + s.sec, 0),
    };
  });
}

/**
 * Сколько сессий с щитом было сегодня.
 *
 * Считается по истории, а не отдельным счётчиком: она уже есть, уже
 * переживает переустановку и уже привязана к местной полуночи. Заводить
 * рядом второе состояние с той же ответственностью — значит завести
 * второе место, где оно разойдётся с правдой.
 *
 * Прерванные считаются тоже. Короче минуты не записывается ничего
 * (см. `record`), так что случайный тычок «щит — сброс» бесплатную
 * сессию не съедает, а минуту под щитом человек прожил.
 */
export function deepToday(list: Session[], at = Date.now()): number {
  const from = dayStart(at);
  return list.filter((s) => s.deep && s.at >= from && s.at < from + 86400_000).length;
}

/* ──────────────────────────── постоянство ───────────────────────────── */

const activeDays = (list: Session[]) =>
  new Set(list.filter(isDone).map((s) => dayStart(s.at)));

/**
 * Сколько дней подряд была хотя бы одна досчитанная сессия.
 *
 * Сегодняшний день без сессий серию не обрывает: она считается от
 * вчерашнего. Иначе до первой сессии человек каждое утро видел бы ноль
 * вместо накопленного за месяц.
 */
export function streak(list: Session[]): number {
  const days = activeDays(list);
  if (days.size === 0) return 0;

  const today0 = dayStart(Date.now());
  let n = 0;
  let cursor = days.has(today0) ? today0 : addDays(today0, -1);
  while (days.has(cursor)) {
    n += 1;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/** Самая длинная серия за всю историю — та планка, к которой возвращаются */
export function bestStreak(list: Session[]): number {
  const days = [...activeDays(list)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i += 1) {
    run = i > 0 && days[i] === addDays(days[i - 1], 1) ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export type Records = {
  /** Лучший день: сколько секунд и когда */
  day: { sec: number; at: number } | null;
  /** Самая длинная одна сессия */
  session: { sec: number; at: number } | null;
  /** Лучшая календарная неделя */
  week: { sec: number; at: number } | null;
};

export function records(list: Session[]): Records {
  const fin = list.filter(isDone);
  if (fin.length === 0) return { day: null, session: null, week: null };

  const sum = (key: (s: Session) => number) => {
    const m = new Map<number, number>();
    for (const s of fin) m.set(key(s), (m.get(key(s)) ?? 0) + s.sec);
    let bestAt = 0;
    let bestSec = 0;
    for (const [at, sec] of m) if (sec > bestSec) [bestAt, bestSec] = [at, sec];
    return { at: bestAt, sec: bestSec };
  };

  const longest = fin.reduce((b, s) => (s.sec > b.sec ? s : b), fin[0]);
  return {
    day: sum((s) => dayStart(s.at)),
    session: { sec: longest.sec, at: longest.at },
    week: sum((s) => startOfWeek(s.at)),
  };
}

/* ───────────────────────────── ритм дня ─────────────────────────────── */

/**
 * Сколько секунд наработано в каждый час суток за период.
 *
 * Сессия размазывается по часам, которые она заняла, а не засчитывается
 * одной точкой старта. Разница принципиальная: точка старта отвечает на
 * вопрос «когда ты нажимаешь кнопку», а площадь под отрезком — «когда ты
 * работаешь». Второе и есть ритм дня.
 */
export function hourProfile(list: Session[], r: Range): number[] {
  const bins = new Array(24).fill(0);
  for (const s of list) {
    if (s.at < r.from || s.at >= r.to || !isDone(s)) continue;
    let t = startOf(s);
    while (t < s.at) {
      const edge = new Date(t);
      edge.setMinutes(60, 0, 0);
      const chunk = Math.min(s.at, edge.getTime()) - t;
      if (chunk <= 0) break;
      bins[new Date(t).getHours()] += chunk / 1000;
      t += chunk;
    }
  }
  return bins;
}

/**
 * Самое короткое непрерывное окно, вмещающее половину всей работы.
 *
 * Это замена прежней плашке «Ты садишься за работу около 10:00». Прежняя
 * называла один час по моде распределения и молчала о том, насколько он
 * устойчив, — потому и отдавала выдуманностью. Окно ничего не утверждает
 * сверх того, что видно на графике под ним.
 *
 * Окно шире восьми часов не возвращается: «ты работаешь днём» — не
 * наблюдение, а погода.
 */
export function peakWindow(bins: number[]): [number, number] | null {
  const total = bins.reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  let best: [number, number] | null = null;
  for (let start = 0; start < 24; start += 1) {
    let acc = 0;
    for (let len = 1; len <= 24; len += 1) {
      acc += bins[(start + len - 1) % 24];
      if (acc >= total / 2) {
        if (!best || len < best[1] - best[0]) best = [start, start + len];
        break;
      }
    }
  }
  return best && best[1] - best[0] <= 8 ? best : null;
}
