import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import {
  all,
  bestStreak,
  bucketize,
  hourProfile,
  oldest,
  peakWindow,
  periodRange,
  records,
  streak,
  summarize,
  type Bucket,
  type Period,
  type Session,
} from '../history';
import { useClock, useSettings, useT, useTn } from '../settings';
import {
  INK,
  PHASES,
  SERIF_BOLD,
  SPECTRUM,
  withAlpha,
  type Scheme,
} from '../theme';
import type { Key } from '../i18n';

const PERIODS: { key: Period; label: Key }[] = [
  { key: 'week', label: 'segWeek' },
  { key: 'month', label: 'segMonth' },
  { key: 'year', label: 'segYear' },
];

/** Высота самого высокого столбика главного графика */
const BAR_H = 104;
/** Высота рисок ритма суток */
const TICK_H = 46;
/**
 * Сколько занято под подписью дня: нижний отступ графика, сама подпись
 * и зазор до столбика. Линия среднего отсчитывается от основания
 * столбиков, а не от низа карточки, и без этой величины промахивается.
 */
const LABEL_BLOCK = 10 + 13 + 8;

/**
 * Пороги, ниже которых показатель молчит.
 *
 * Их два на каждое утверждение, и это главное правило экрана. Порог
 * данных отвечает за честность («мы правда это видели»), порог величины —
 * за то, что число вообще о чём-то говорит. Без второго экран скажет
 * «+50%» о переходе с двух сессий на три: формально верно и полностью
 * пусто. Человек, поймавший такое дважды, перестаёт верить всей панели —
 * ровно на этом сыпется Clearspace, где в отзывах пишут «данные выглядят
 * неточными».
 */
const MIN_BASE_SESSIONS = 3;
const MIN_BASE_SEC = 3600;
/** Меньше пяти процентов — это не изменение, а колебание */
const STEADY = 0.05;
/** Среднее по двум точкам — не среднее */
const MIN_BARS_FOR_AVG = 3;
/** Доля погружения на двух сессиях — случайность, а не привычка */
const MIN_DEEP_SESSIONS = 3;
/** Окно суток проступает не раньше, чем накопится форма */
const MIN_SESSIONS_FOR_WINDOW = 8;
const MIN_SESSIONS_FOR_RHYTHM = 3;
/** «Лучший день — вчера» на второй день звучит издевательски */
const MIN_DAYS_FOR_RECORDS = 7;

export function StatsScreen({ scheme, active }: { scheme: Scheme; active: boolean }) {
  const t = useT();
  const tn = useTn();
  const clock = useClock();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const ink = INK[scheme];
  const accent = PHASES[scheme].focus.accent;

  const [period, setPeriod] = useState<Period>('week');
  const [offset, setOffset] = useState(0);
  /** Столбик, по которому ткнули: под графиком появляется его расшифровка */
  const [picked, setPicked] = useState<number | null>(null);
  /**
   * История перечитывается при каждом заходе на вкладку. Вкладки не
   * размонтируются, поэтому без этого экран показывал бы то, что было
   * при запуске приложения, а сессия, досчитанная минуту назад, не
   * появилась бы до перезапуска.
   */
  const [reads, setReads] = useState(0);
  useEffect(() => {
    if (active) setReads((n) => n + 1);
  }, [active]);

  const list = useMemo<Session[]>(() => all(), [reads]);

  // Смена периода начинает с текущего: остаться на «третьей неделе назад»,
  // переключившись на год, значит попасть в позапрошлый год без объяснения.
  const choosePeriod = (p: Period) => {
    Haptics.selectionAsync().catch(() => {});
    setPeriod(p);
    setOffset(0);
    setPicked(null);
  };

  const page = (d: number) => {
    Haptics.selectionAsync().catch(() => {});
    setOffset((o) => o + d);
    setPicked(null);
  };

  const data = useMemo(() => {
    const range = periodRange(period, offset);

    /**
     * Прошлый период обрезается по тому же месту, до которого дошёл
     * текущий.
     *
     * Восемь прожитых дней августа против целого июля дают «−59%» — это
     * правда про календарь, а не про человека, и читается как обвинение
     * в том, что месяц ещё не кончился. Сравнивать надо начало с началом.
     */
    const whole = periodRange(period, offset - 1);
    const elapsed = offset === 0 ? Date.now() - range.from : range.to - range.from;
    const prev = { from: whole.from, to: Math.min(whole.to, whole.from + elapsed) };

    const first = oldest(list);
    return {
      range,
      now: summarize(list, range),
      prev: summarize(list, prev),
      bars: bucketize(list, period, range),
      hours: hourProfile(list, range),
      streak: streak(list),
      best: bestStreak(list),
      records: records(list),
      historyDays: first === null ? 0 : Math.ceil((Date.now() - first) / 86400_000),
      canBack: first !== null && prev.to > first,
    };
    // Язык меняет подписи дней и месяцев — пересчёт при его смене намеренный.
  }, [list, period, offset, settings.language]);

  const { now, prev, bars, hours } = data;

  /* ─── форматирование ─── */

  const dur = (sec: number) => {
    const m = Math.round(sec / 60);
    const h = Math.floor(m / 60);
    // «2 ч 0 мин» — это ноль на экране, а нулей здесь не бывает.
    if (h > 0) return m % 60 === 0 ? `${h} ${t('unitH')}` : `${h} ${t('unitH')} ${m % 60} ${t('unitMin')}`;
    return `${m} ${t('unitMin')}`;
  };

  const mon = (i: number) => t(`mon${i + 1}` as Key);

  const rangeLabel = () => {
    const from = new Date(data.range.from);
    const to = new Date(data.range.to - 1);
    if (period === 'week') {
      return from.getMonth() === to.getMonth()
        ? `${from.getDate()} — ${to.getDate()} ${mon(from.getMonth())}`
        : `${from.getDate()} ${mon(from.getMonth())} — ${to.getDate()} ${mon(to.getMonth())}`;
    }
    if (period === 'month') {
      const name = t(`monF${from.getMonth() + 1}` as Key);
      return from.getFullYear() === new Date().getFullYear()
        ? name
        : `${name} ${from.getFullYear()}`;
    }
    return String(from.getFullYear());
  };

  const barLabel = (b: Bucket) => {
    const d = new Date(b.at);
    // Отдельно стоящая подпись — именительный падеж: «май», а не «мая».
    if (period === 'year') return t(`monS${d.getMonth() + 1}` as Key);
    if (period === 'month') return String(d.getDate());
    return t(`day${d.getDay() + 1}` as Key);
  };

  /**
   * Подписи месяца прореживаются: тридцать одно число подряд в восемь
   * пунктов — это уже не ось, а серая полоса. Оставляем опоры каждые
   * пять дней и сегодняшний день, по которому и ищут своё место.
   */
  const showLabel = (b: Bucket) => {
    if (period !== 'month') return true;
    const day = new Date(b.at).getDate();
    return day === 1 || day % 5 === 0 || isToday(b.at, period);
  };

  /* ─── что показывать, а о чём молчать ─── */

  /**
   * Изменение к прошлому периоду. Возвращает null, когда сравнивать не с
   * чем: прошлый период должен быть не только непустым, но и достаточно
   * весомым, иначе процент считается от шума.
   */
  const delta = (a: number, b: number): number | null => {
    if (prev.count < MIN_BASE_SESSIONS || prev.sec < MIN_BASE_SEC) return null;
    if (b === 0) return null;
    return (a - b) / b;
  };

  const peak = Math.max(...bars.map((b) => b.sec), 1);
  const activeBars = bars.filter((b) => b.sec > 0).length;
  const avg = activeBars > 0 ? bars.reduce((a, b) => a + b.sec, 0) / activeBars : 0;
  const showAvg = activeBars >= MIN_BARS_FOR_AVG;

  const window = now.count >= MIN_SESSIONS_FOR_WINDOW ? peakWindow(hours) : null;
  const hoursPeak = Math.max(...hours, 1);

  const empty = list.length === 0;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={[styles.title, { color: ink.primary }]}>{t('statsTitle')}</Text>

          {/* Сегмент односимвольный: на шести языках это единственная
              форма, которая заведомо влезает и не требует проверки
              вёрстки на немецком. Так же сделано в Apple Health. */}
          {!empty ? (
            <View style={[styles.seg, { backgroundColor: withAlpha(ink.primary, 0.06) }]}>
              {PERIODS.map((p) => {
                const on = p.key === period;
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => choosePeriod(p.key)}
                    style={[
                      styles.segItem,
                      on && { backgroundColor: withAlpha(accent, 0.22) },
                    ]}
                    hitSlop={4}
                  >
                    <Text
                      style={[
                        styles.segText,
                        { color: on ? ink.primary : ink.tertiary },
                      ]}
                    >
                      {t(p.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {empty ? (
          <GlassPane style={styles.card} radius={22} scheme={scheme}>
            <Text style={[styles.empty, { color: ink.secondary }]}>{t('statsEmpty')}</Text>
          </GlassPane>
        ) : (
          <>
            {/* Пейджер: листать назад можно до первой записи, вперёд —
                не дальше текущего периода. Стрелка в будущее не гаснет,
                а отсутствует: серая кнопка обещает нажатие. */}
            <View style={styles.pager}>
              <Pressable
                onPress={() => page(-1)}
                disabled={!data.canBack}
                hitSlop={12}
                style={styles.arrow}
              >
                <SymbolView
                  name="chevron.left"
                  size={15}
                  tintColor={data.canBack ? ink.secondary : ink.tertiary}
                  weight="semibold"
                />
              </Pressable>
              <Text style={[styles.pagerText, { color: ink.secondary }]}>
                {rangeLabel()}
              </Text>
              <Pressable
                onPress={() => page(1)}
                disabled={offset >= 0}
                hitSlop={12}
                style={styles.arrow}
              >
                {offset < 0 ? (
                  <SymbolView
                    name="chevron.right"
                    size={15}
                    tintColor={ink.secondary}
                    weight="semibold"
                  />
                ) : null}
              </Pressable>
            </View>

            {/* ─────────── герой и главный график ─────────── */}
            <GlassPane style={styles.card} radius={26} scheme={scheme}>
              <View style={styles.heroPad}>
                <Text style={[styles.kicker, { color: ink.tertiary }]}>
                  {t('statsTotal')}
                </Text>

                {now.count > 0 ? (
                  <Text style={[styles.hero, { color: ink.primary }]}>{dur(now.sec)}</Text>
                ) : (
                  <Text style={[styles.heroDash, { color: ink.tertiary }]}>—</Text>
                )}

                <Compare
                  value={now.count > 0 ? delta(now.sec, prev.sec) : null}
                  prevText={dur(prev.sec)}
                  ink={ink}
                  accent={accent}
                  t={t}
                />

                {now.count === 0 ? (
                  <Text style={[styles.nothing, { color: ink.tertiary }]}>
                    {t('statsNothingYet')}
                  </Text>
                ) : null}
              </View>

              <View style={styles.chart}>
                {showAvg ? (
                  <View
                    style={[
                      styles.avgLine,
                      {
                        bottom: LABEL_BLOCK + (avg / peak) * BAR_H,
                        backgroundColor: withAlpha(accent, 0.5),
                      },
                    ]}
                  >
                    <Text style={[styles.avgPill, { color: withAlpha(accent, 0.9) }]}>
                      {t('statsAvg')}
                    </Text>
                  </View>
                ) : null}

                {bars.map((b, i) => (
                  <Bar
                    key={b.at}
                    bucket={b}
                    label={showLabel(b) ? barLabel(b) : ''}
                    dense={bars.length > 12}
                    height={(b.sec / peak) * BAR_H}
                    today={isToday(b.at, period)}
                    picked={picked === i}
                    onPress={() => {
                      if (b.sec === 0) return;
                      Haptics.selectionAsync().catch(() => {});
                      setPicked((p) => (p === i ? null : i));
                    }}
                    ink={ink}
                    accent={accent}
                  />
                ))}
              </View>

              {picked !== null && bars[picked] ? (
                <Text style={[styles.pickRow, { color: ink.secondary }]}>
                  {`${barLabel(bars[picked])} · ${dur(bars[picked].sec)}`}
                </Text>
              ) : null}
            </GlassPane>

            {/* ─────────── сетка показателей ─────────── */}
            {now.count > 0 ? (
              <GlassPane style={styles.card} radius={22} scheme={scheme}>
                <Grid
                  cells={[
                    {
                      label: t('mSessions'),
                      value: String(now.count),
                      note: fmtDelta(delta(now.count, prev.count), (d) =>
                        `${d > 0 ? '+' : '−'}${Math.abs(now.count - prev.count)}`
                      ),
                      up: now.count > prev.count,
                    },
                    {
                      label: t('mAvg'),
                      value: dur(now.sec / now.count),
                      note: null,
                    },
                    {
                      label: t('mPerDay'),
                      value: dur(now.sec / Math.max(1, now.days)),
                      note: null,
                    },
                    {
                      label: t('mDays'),
                      // «из скольких» имеет смысл, пока знаменатель — дни.
                      // В году столбики месячные, и «56 из 12» — бессмыслица.
                      value:
                        period === 'year'
                          ? String(now.days)
                          : t('statsOfN', { n: now.days, m: bars.length }),
                      note: null,
                    },
                    now.deepCount >= MIN_DEEP_SESSIONS
                      ? {
                          label: t('mDeep'),
                          value: `${Math.round((now.deepSec / now.sec) * 100)}%`,
                          note: null,
                        }
                      : null,
                    now.doneRate !== null
                      ? {
                          label: t('mDone'),
                          value: `${Math.round(now.doneRate * 100)}%`,
                          note: null,
                        }
                      : {
                          label: t('mLongest'),
                          value: dur(now.longest),
                          note: null,
                        },
                  ]}
                  ink={ink}
                  accent={accent}
                />
              </GlassPane>
            ) : null}

            {/* ─────────── ритм суток ─────────── */}
            {now.count >= MIN_SESSIONS_FOR_RHYTHM ? (
              <GlassPane style={styles.card} radius={22} scheme={scheme}>
                <View style={styles.pad}>
                  <Text style={[styles.kicker, { color: ink.tertiary }]}>
                    {t('statsRhythm')}
                  </Text>
                </View>
                <View style={styles.ticks}>
                  {hours.map((v, h) => (
                    <View key={h} style={styles.tickSlot}>
                      {v > 0 ? (
                        <View
                          style={[
                            styles.tick,
                            {
                              height: Math.max(3, (v / hoursPeak) * TICK_H),
                              // Спектр по оси суток — единственное место,
                              // где призма кодирует настоящую величину,
                              // а не украшает: цвет здесь и есть час.
                              backgroundColor: SPECTRUM[Math.floor((h / 24) * 7)],
                            },
                          ]}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
                {/* Четыре равные колонки: подпись каждой садится ровно на
                    границу своего часа. При space-between «18:00» уезжало
                    к правому краю, где стоит двадцать третий час. */}
                <View style={styles.axis}>
                  {[0, 6, 12, 18].map((h) => (
                    <View key={h} style={styles.axisCol}>
                      <Text style={[styles.axisText, { color: ink.tertiary }]}>
                        {clock.hour(h)}
                      </Text>
                    </View>
                  ))}
                </View>
                {window ? (
                  <Text style={[styles.caption, { color: ink.secondary }]}>
                    {t('statsRhythmWindow', {
                      a: clock.hour(window[0]),
                      b: clock.hour(window[1] % 24),
                    })}
                  </Text>
                ) : null}
              </GlassPane>
            ) : null}

            {/* ─────────── постоянство и рекорды ─────────── */}
            <View style={styles.row}>
              {data.streak >= 2 || data.best >= 3 ? (
                <GlassPane style={[styles.card, styles.half]} radius={22} scheme={scheme}>
                  <View style={styles.pad}>
                    <Text style={[styles.kicker, { color: ink.tertiary }]}>
                      {t('statsStreak')}
                    </Text>
                    <Text style={[styles.big, { color: ink.primary }]}>
                      {tn('streakD', Math.max(data.streak, 0))}
                    </Text>
                    <Text style={[styles.note, { color: ink.tertiary }]}>
                      {data.streak >= data.best
                        ? t('statsStreakOwn')
                        : t('statsStreakBest', { n: data.best })}
                    </Text>
                  </View>
                </GlassPane>
              ) : null}

              {data.historyDays >= MIN_DAYS_FOR_RECORDS && data.records.day ? (
                <GlassPane style={[styles.card, styles.half]} radius={22} scheme={scheme}>
                  <View style={styles.pad}>
                    <Text style={[styles.kicker, { color: ink.tertiary }]}>
                      {t('statsRecords')}
                    </Text>
                    {(
                      [
                        ['statsRecDay', data.records.day?.sec],
                        ['statsRecSession', data.records.session?.sec],
                        ['statsRecWeek', data.records.week?.sec],
                      ] as const
                    ).map(([key, sec]) =>
                      sec ? (
                        <View key={key} style={styles.recRow}>
                          <Text style={[styles.recKey, { color: ink.secondary }]}>
                            {t(key)}
                          </Text>
                          <Text style={[styles.recVal, { color: ink.primary }]}>
                            {dur(sec)}
                          </Text>
                        </View>
                      ) : null
                    )}
                  </View>
                </GlassPane>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Сегодняшний ли это столбик — по дате, а не по позиции в массиве */
function isToday(at: number, period: Period) {
  const d = new Date();
  const b = new Date(at);
  if (period === 'year') {
    return d.getFullYear() === b.getFullYear() && d.getMonth() === b.getMonth();
  }
  return (
    d.getFullYear() === b.getFullYear() &&
    d.getMonth() === b.getMonth() &&
    d.getDate() === b.getDate()
  );
}

function fmtDelta(d: number | null, f: (d: number) => string) {
  return d === null || Math.abs(d) < STEADY ? null : f(d);
}

/**
 * Строка сравнения с прошлым периодом.
 *
 * Падение не красное. Красный цвет на трекере превращает наблюдение в
 * упрёк, а неделя бывает тяжёлой по причинам, которых приложение не
 * знает. Так же поступает Brick — падение у него нейтрального тона.
 */
function Compare({
  value,
  prevText,
  ink,
  accent,
  t,
}: {
  value: number | null;
  prevText: string;
  ink: (typeof INK)['light'];
  accent: string;
  t: (k: Key, v?: Record<string, string | number>) => string;
}) {
  if (value === null) return <View style={styles.compareGap} />;

  if (Math.abs(value) < STEADY) {
    return (
      <Text style={[styles.compare, { color: ink.secondary }]}>{t('statsSteady')}</Text>
    );
  }

  const up = value > 0;
  return (
    <View style={styles.compareRow}>
      <SymbolView
        name={up ? 'arrow.up.right' : 'arrow.down.right'}
        size={12}
        tintColor={up ? accent : ink.secondary}
        weight="semibold"
      />
      <Text
        style={[styles.compare, { color: up ? accent : ink.secondary }]}
      >{`${Math.round(Math.abs(value) * 100)}%`}</Text>
      <Text style={[styles.compare, { color: ink.tertiary }]}>
        {`· ${t('statsWasPrev', { v: prevText })}`}
      </Text>
    </View>
  );
}

function Bar({
  bucket,
  label,
  height,
  today,
  picked,
  dense,
  onPress,
  ink,
  accent,
}: {
  bucket: Bucket;
  label: string;
  height: number;
  today: boolean;
  picked: boolean;
  dense: boolean;
  onPress: () => void;
  ink: (typeof INK)['light'];
  accent: string;
}) {
  const deepPart = bucket.sec > 0 ? (bucket.deepSec / bucket.sec) * height : 0;
  return (
    <Pressable style={styles.col} onPress={onPress}>
      <View style={styles.barSlot}>
        {/* Пустой день не рисует ничего — ни огрызка в пиксель, ни нуля.
            День без работы это пустота, и выглядеть он должен пустотой. */}
        {bucket.sec > 0 ? (
          <View
            style={[
              styles.bar,
              {
                height: Math.max(5, height),
                width: dense ? 5 : 11,
                borderRadius: dense ? 2.5 : 5.5,
                backgroundColor: withAlpha(accent, today || picked ? 0.5 : 0.32),
              },
            ]}
          >
            {/* Нижняя доля столбика — время под блокировкой. Так поле
                `deep` впервые становится видимым, и видимым именно как
                «сколько этой недели было защищено». */}
            {deepPart > 0 ? (
              <View
                style={[
                  styles.deep,
                  {
                    height: Math.max(4, deepPart),
                    borderRadius: dense ? 2.5 : 5.5,
                    backgroundColor: accent,
                  },
                ]}
              />
            ) : null}
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.dayLabel,
          dense && styles.dayLabelDense,
          { color: today ? ink.primary : ink.tertiary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type Cell = { label: string; value: string; note?: string | null; up?: boolean } | null;

/**
 * Сетка показателей.
 *
 * Ячейка, которую нечем заполнить, исчезает целиком — прочерков здесь
 * не бывает. Место под третью строку резервируется всегда: без резерва
 * сетка едет при появлении первой же дельты и перестаёт читаться сеткой.
 */
function Grid({
  cells,
  ink,
  accent,
}: {
  cells: Cell[];
  ink: (typeof INK)['light'];
  accent: string;
}) {
  const live = cells.filter(Boolean) as NonNullable<Cell>[];
  return (
    <View style={styles.grid}>
      {live.map((c, i) => (
        <View
          key={c.label}
          style={[
            styles.cell,
            // Разделитель только между соседями: линия справа от
            // последней ячейки обещает ещё одну, которой нет.
            i % 3 !== 2 &&
              i + 1 < live.length && { borderRightWidth: StyleSheet.hairlineWidth },
            i < 3 && live.length > 3 && { borderBottomWidth: StyleSheet.hairlineWidth },
            { borderColor: withAlpha(ink.tertiary, 0.35) },
          ]}
        >
          {/* Две строки под подпись: «ПОГРУЖЕНИЕ» на треть ширины не влезает
              в одну ни по-русски, ни по-немецки, ни по-португальски. */}
          <Text numberOfLines={2} style={[styles.cellLabel, { color: ink.tertiary }]}>
            {c.label}
          </Text>
          {/* Ужимаем, но не переносим: перенос двигает третью строку и
              сетка перестаёт читаться сеткой. «1 ч 14 мин» по-русски и
              «DURCHSCHNITT» по-немецки — оба длиннее трети ширины. */}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.cellValue, { color: ink.primary }]}
          >
            {c.value}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.cellNote, { color: c.up ? accent : ink.tertiary }]}
          >
            {c.note ?? ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },

  head: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 2 },
  title: {
    flex: 1,
    fontSize: 36,
    fontFamily: SERIF_BOLD,
    letterSpacing: -0.8,
  },
  seg: { flexDirection: 'row', borderRadius: 11, padding: 2 },
  segItem: {
    minWidth: 32,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 9,
  },
  segText: { fontSize: 13, fontWeight: '700' },

  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 12,
  },
  arrow: { width: 40, alignItems: 'center' },
  pagerText: { fontSize: 15, fontWeight: '600', minWidth: 150, textAlign: 'center' },

  card: { overflow: 'hidden', marginBottom: 12 },
  pad: { paddingHorizontal: 16, paddingTop: 14 },
  heroPad: { paddingHorizontal: 18, paddingTop: 16 },

  kicker: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: 6,
    // Регистр — свойство места, а не словаря: иначе «Серия» из старого
    // ключа стоит строчной рядом с «ВСЕГО» и «РЕКОРДЫ».
    textTransform: 'uppercase',
  },
  hero: {
    fontSize: 44,
    lineHeight: 50,
    fontFamily: SERIF_BOLD,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  heroDash: { fontSize: 44, lineHeight: 50, fontFamily: SERIF_BOLD },
  compareRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3, height: 18 },
  compare: { fontSize: 13, fontWeight: '600' },
  compareGap: { height: 18, marginTop: 3 },
  nothing: { fontSize: 13, marginTop: 2 },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 10,
  },
  col: { flex: 1, alignItems: 'center', gap: 8 },
  barSlot: { height: BAR_H, justifyContent: 'flex-end' },
  bar: { justifyContent: 'flex-end', overflow: 'hidden' },
  deep: { width: '100%' },
  dayLabel: { fontSize: 11, lineHeight: 13, fontWeight: '600' },
  dayLabelDense: { fontSize: 8 },
  // Полоса заливкой, а не рамкой: граница на блоке нулевой высоты не
  // рисуется вовсе. И высота блока обязана быть волосяной — любая другая
  // подняла бы линию над рассчитанным уровнем ровно на себя.
  avgLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
    alignItems: 'flex-end',
  },
  avgPill: {
    position: 'absolute',
    bottom: 3,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pickRow: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 18,
    paddingBottom: 14,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', paddingHorizontal: 12, paddingVertical: 13 },
  cellLabel: { fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5, minHeight: 24 },
  cellValue: { fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cellNote: { fontSize: 11.5, fontWeight: '600', height: 15 },

  ticks: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: TICK_H,
    paddingHorizontal: 16,
    marginTop: 10,
  },
  tickSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: TICK_H },
  tick: { width: 4, borderRadius: 2 },
  axis: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 6 },
  axisCol: { flex: 1 },
  axisText: { fontSize: 10, fontWeight: '600' },
  caption: { fontSize: 13.5, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },

  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  big: { fontSize: 22, fontWeight: '700', marginBottom: 1 },
  note: { fontSize: 12, fontWeight: '600', paddingBottom: 14 },
  recRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  recKey: { fontSize: 12.5, fontWeight: '500' },
  recVal: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { fontSize: 15, lineHeight: 21, padding: 18 },
});
