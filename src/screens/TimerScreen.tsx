import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import {
  SELECTION_ID,
  ensureAuthorized,
  hasSelection,
  startBlocking,
  stopBlocking,
} from '../blocking';

import { GlassPane } from '../components/GlassPane';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useResolvedScheme, useSettings } from '../settings';
import { TimerRing } from '../components/TimerRing';
import {
  DEEP_FOCUS,
  INK,
  PHASES,
  SERIF,
  SERIF_BOLD,
  SESSIONS_PER_ROUND,
  formatClock,
  formatEndTime,
  formatTimeOfDay,
  withAlpha,
  type Ambient,
  type Phase,
} from '../theme';

export function TimerScreen({
  /**
   * Холст рисует оболочка — он общий фон для всех вкладок. Экран таймера
   * только сообщает, каким ему быть: он один знает фазу и Deep Focus.
   */
  onAmbientChange,
}: {
  onAmbientChange?: (ambient: Ambient) => void;
}) {
  const [phase, setPhase] = useState<Phase>('focus');
  const [running, setRunning] = useState(false);
  const [deepFocus, setDeepFocus] = useState(false);
  const [done, setDone] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Момент старта сессии — нужен только для подписи «14:00 → 14:25» */
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  /**
   * Текущее время как состояние. Без него подпись диапазона считалась бы
   * один раз при рендере и застывала: пока сессия не идёт, перерисовывать
   * экран нечему, и время «оживало» только от перехода по вкладкам.
   */
  const [now, setNow] = useState(() => Date.now());

  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();
  const { settings, setDuration: persistDuration } = useSettings();
  const saved = settings.durations;

  const spec = PHASES[scheme][phase];
  /** Длительность текущей фазы — её можно менять регулятором на кольце */
  const [duration, setDuration] = useState(() => saved.focus);
  const [left, setLeft] = useState(() => saved.focus);

  const progress = useSharedValue(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Deep Focus не отдельная фаза и не тема, а наложение поверх текущей фазы.
  // В светлой теме он всё равно тёмный: смысл режима в том, что свет уходит
  // из комнаты, и зависеть от настроек телефона это не должно.
  const skin = useMemo(() => {
    const deep = deepFocus && phase === 'focus';
    if (deep) {
      return {
        label: DEEP_FOCUS.label,
        accent: DEEP_FOCUS.accent,
        accentHi: DEEP_FOCUS.accentHi,
        canvas: DEEP_FOCUS.canvas,
        canvasOpacity: DEEP_FOCUS.canvasOpacity,
        ink: INK.dark,
        glassScheme: 'dark' as const,
      };
    }
    return {
      label: spec.label,
      accent: spec.accent,
      accentHi: spec.accentHi,
      canvas: spec.canvas,
      // Холст приглушён: экран ведут антиква и кольцо, а насыщенный градиент
      // их глушил. Но совсем убирать нельзя — стеклу нужно что преломлять.
      // В светлой теме доля выше: пастель на белом даёт меньше контраста,
      // чем те же цвета на чёрном, и кнопки выглядели плоскими карточками.
      canvasOpacity: scheme === 'light' ? 0.5 : 0.22,
      ink: INK[scheme],
      glassScheme: scheme,
    };
  }, [deepFocus, phase, spec, scheme]);

  /**
   * Недосчитанные фазы. Ушёл на перерыв в середине сессии — вернёшься
   * на то же место, а не к полному кругу. Досчитанная фаза из отложенных
   * убирается: следующий раз она должна начаться заново.
   */
  const stash = useRef<Partial<Record<Phase, { left: number; duration: number }>>>({});

  const goToPhase = useCallback(
    (next: Phase, currentCompleted = false) => {
      if (currentCompleted) delete stash.current[phase];
      else stash.current[phase] = { left, duration };

      const held = stash.current[next];
      // Прерванная фаза важнее сохранённой длительности: она уже началась.
      const d = held?.duration ?? saved[next];
      const l = held?.left ?? d;

      setPhase(next);
      setDuration(d);
      setLeft(l);
      setRunning(false);
      setStartedAt(null);
      progress.value = withTiming(1 - l / d, { duration: 320 });
    },
    [phase, left, duration, progress, saved]
  );

  const advance = useCallback(
    (currentCompleted = false) => {
      // Сессия кончилась — приложения открываются сами. Ждать действия
      // от человека тут нельзя: он мог отложить телефон и уйти.
      if (deepFocus) {
        stopBlocking();
        setDeepFocus(false);
      }
      if (phase === 'focus') {
        // Круг засчитываем только за досчитанную сессию, не за пропущенную.
        const nextDone = currentCompleted ? done + 1 : done;
        if (currentCompleted) setDone(nextDone);
        goToPhase(nextDone % SESSIONS_PER_ROUND === 0 && currentCompleted ? 'long' : 'short', currentCompleted);
      } else {
        goToPhase('focus', currentCompleted);
      }
    },
    [phase, done, goToPhase, deepFocus]
  );

  useEffect(() => {
    if (!running) {
      if (tick.current) {
        clearInterval(tick.current);
        tick.current = null;
      }
      return;
    }

    tick.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (tick.current) {
        clearInterval(tick.current);
        tick.current = null;
      }
    };
  }, [running]);

  // Дуга догоняет отдельно от цифр: секундный скачок выглядел бы дёшево.
  useEffect(() => {
    progress.value = withTiming(1 - left / duration, { duration: 900 });
  }, [left, duration, progress]);

  /**
   * Часы идут независимо от таймера. Во время сессии обновляемся раз в
   * секунду вместе с отсчётом, вне её — раз в минуту, выровненно по её
   * границе: подпись показывает минуты, чаще незачем будить экран.
   */
  useEffect(() => {
    const update = () => setNow(Date.now());
    update();

    if (running) {
      const id = setInterval(update, 1000);
      return () => clearInterval(id);
    }

    let minute: ReturnType<typeof setInterval> | undefined;
    const toBoundary = 60000 - (Date.now() % 60000);
    const first = setTimeout(() => {
      update();
      minute = setInterval(update, 60000);
    }, toBoundary);

    return () => {
      clearTimeout(first);
      if (minute) clearInterval(minute);
    };
  }, [running]);

  // Из фона можно вернуться через час — время должно быть верным сразу,
  // не дожидаясь ближайшей границы минуты.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  /**
   * Регулятор доступен, пока не потрачено ни секунды. Привязка к startedAt
   * не годится: после возврата с перерыва он пуст, и случайное касание
   * стёрло бы восстановленный остаток.
   */
  const editable = !running && left === duration;

  const setMinutes = useCallback(
    (m: number) => {
      setDuration(m * 60);
      setLeft(m * 60);
      // Выбор запоминается для этой фазы: в следующий раз она начнётся
      // с той длительности, которую человек выставил, а не с заводской.
      persistDuration(phase, m * 60);
    },
    [phase, persistDuration]
  );

  useEffect(() => {
    if (left === 0 && running) {
      setRunning(false);
      advance(true);
    }
  }, [left, running, advance]);

  const toggleRun = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setRunning((r) => {
      // Момент старта фиксируем один раз за сессию: пауза не должна
      // сдвигать левую границу диапазона.
      if (!r) setStartedAt((prev) => prev ?? new Date());
      return !r;
    });
  }, []);

  const enableDeep = useCallback(() => {
    startBlocking(formatEndTime(left));
    setDeepFocus(true);
  }, [left]);

  const toggleDeep = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});

    if (deepFocus) {
      stopBlocking();
      setDeepFocus(false);
      return;
    }

    const authorized = await ensureAuthorized();
    if (!authorized) {
      Alert.alert(
        'Нужен доступ к Экранному времени',
        'Без него приложение не сможет закрывать другие приложения на время сессии. Разрешение можно выдать в Настройках.'
      );
      return;
    }

    // Первый раз — сначала выбор приложений, блокировать пока нечего.
    if (!hasSelection()) {
      setPickerOpen(true);
      return;
    }

    enableDeep();
  }, [deepFocus, enableDeep]);

  const skip = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    advance();
  }, [advance]);

  useEffect(() => {
    onAmbientChange?.({
      canvas: skin.canvas,
      opacity: skin.canvasOpacity,
      scheme: skin.glassScheme,
    });
  }, [skin, onAmbientChange]);

  // «Когда я освобожусь» — вопрос практичнее, чем «сколько осталось»:
  // остаток и так виден по отсчёту.
  const rangeText = `${formatTimeOfDay(startedAt ?? new Date(now))} → ${formatTimeOfDay(
    new Date(now + left * 1000)
  )}`;

  return (
    <View style={styles.root}>

      {/* Нижнюю безопасную зону забирает оболочка с панелью вкладок. Панель
          занимает свою высоту ПЛЮС эту зону — считаем обе, иначе док
          упирается в неё вплотную. */}
      <SafeAreaView
        style={[styles.safe, { paddingBottom: TAB_BAR_HEIGHT + insets.bottom + 18 }]}
        edges={['top']}
      >
        <View style={styles.chips}>
          <GlassPane style={styles.chip} radius={16} scheme={skin.glassScheme}>
            <View style={[styles.dot, { backgroundColor: skin.accentHi }]} />
            <Text style={[styles.chipText, { color: skin.ink.primary }]} numberOfLines={1}>
              Тихий дом
            </Text>
          </GlassPane>

          {/* Состояние блокировки словами, а не оттенком иконки: функция,
              закрывающая пол-телефона, не должна требовать разглядывания. */}
          <GlassPane
            style={styles.chip}
            radius={16}
            scheme={skin.glassScheme}
            tint={deepFocus ? withAlpha(DEEP_FOCUS.accent, 0.35) : undefined}
          >
            <SymbolView
              name={deepFocus ? 'shield.lefthalf.filled' : 'shield'}
              size={13}
              tintColor={deepFocus ? DEEP_FOCUS.accentHi : skin.ink.secondary}
              weight="medium"
            />
            <Text style={[styles.chipText, { color: skin.ink.primary }]} numberOfLines={1}>
              {deepFocus ? '12 закрыто' : 'Выключено'}
            </Text>
          </GlassPane>
        </View>

        <View style={styles.center}>
          <Text style={[styles.title, { color: skin.ink.primary }]}>{skin.label}</Text>
          <Text style={[styles.range, { color: skin.ink.secondary }]}>{rangeText}</Text>

          <View style={styles.ringSlot}>
            <TimerRing
              progress={progress}
              accent={skin.accent}
              accentHi={skin.accentHi}
              track={skin.ink.track}
              minutes={Math.round(duration / 60)}
              editable={editable}
              onChangeMinutes={setMinutes}
              labelColor={skin.ink.tertiary}
            >
              {editable ? (
                // До старта в центре — выставленная длительность, а не отсчёт:
                // «25:00» здесь выглядело бы как уже идущая сессия.
                <>
                  <Text style={[styles.bigMin, { color: skin.ink.primary }]}>
                    {Math.round(duration / 60)}
                  </Text>
                  <Text style={[styles.minLabel, { color: skin.ink.secondary }]}>МИН</Text>
                </>
              ) : (
                <Text style={[styles.clock, { color: skin.ink.primary }]}>
                  {formatClock(left)}
                </Text>
              )}
            </TimerRing>
          </View>

          <View style={styles.pips}>
            {Array.from({ length: SESSIONS_PER_ROUND }).map((_, i) => {
              const on =
                i < done % SESSIONS_PER_ROUND ||
                (done > 0 && done % SESSIONS_PER_ROUND === 0);
              return (
                <View
                  key={i}
                  style={[
                    styles.pip,
                    { backgroundColor: on ? skin.accent : skin.ink.tertiary },
                  ]}
                />
              );
            })}
          </View>
        </View>

        {/* Управление — единственный стеклянный слой на экране. Тень поднимает
            кнопки над фоном: без неё материал читается как вырез в подложке,
            а не как предмет, лежащий сверху. */}
        <View style={styles.dockRow}>
          <Pressable
            onPress={skip}
            disabled={deepFocus && running}
            style={({ pressed }) => [styles.lift, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Пропустить фазу"
          >
            <GlassPane
              style={[styles.btnSide, deepFocus && running && styles.btnOff]}
              radius={22}
              scheme={skin.glassScheme}
            >
              <SymbolView
                name="forward.end.fill"
                size={22}
                tintColor={skin.ink.primary}
                weight="medium"
              />
            </GlassPane>
          </Pressable>

          <Pressable
            onPress={toggleRun}
            style={({ pressed }) => [styles.liftMain, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel={running ? 'Пауза' : 'Начать'}
          >
            {/* Главное действие тоже стекло — выделяется плотностью материала
                и тинтом фазы, а не сплошной заливкой. */}
            <GlassPane
              style={styles.btnMain}
              radius={28}
              scheme={skin.glassScheme}
              // На светлом фоне тинт нужен плотнее: тот же процент даёт
              // пастель, и главное действие перестаёт быть главным.
              tint={withAlpha(skin.accent, skin.glassScheme === 'light' ? 0.62 : 0.42)}
              dense
            >
              <SymbolView
                name={running ? 'pause.fill' : 'play.fill'}
                size={26}
                tintColor={skin.ink.primary}
                weight="semibold"
              />
            </GlassPane>
          </Pressable>

          <Pressable
            onPress={toggleDeep}
            style={({ pressed }) => [styles.lift, pressed && styles.btnPressed]}
            accessibilityRole="switch"
            accessibilityState={{ checked: deepFocus }}
            accessibilityLabel="Deep Focus"
          >
            <GlassPane
              style={styles.btnSide}
              radius={22}
              tint={deepFocus ? withAlpha(DEEP_FOCUS.accent, 0.55) : undefined}
              dense={deepFocus}
              scheme={skin.glassScheme}
            >
              <SymbolView
                name={deepFocus ? 'shield.lefthalf.filled' : 'shield'}
                size={23}
                tintColor={deepFocus ? '#FFFFFF' : skin.ink.primary}
                weight="medium"
              />
            </GlassPane>
          </Pressable>
        </View>

        {/* Системный выбор приложений Apple. Оформить его нельзя —
            поэтому в макете он спрятан за пресетами, но для первой
            проверки блокировки открываем как есть. */}
        {pickerOpen ? (
          <DeviceActivitySelectionSheetViewPersisted
            familyActivitySelectionId={SELECTION_ID}
            headerText="Что закрываем на время сессии"
            footerText="Звонки, сообщения и карты остаются доступны всегда."
            onDismissRequest={() => {
              setPickerOpen(false);
              if (hasSelection()) {
                enableDeep();
              }
            }}
          />
        ) : null}
      </SafeAreaView>
    </View>
  );
}

// В таблице стилей только структура. Цвета приходят из skin.ink и ставятся
// на месте: они зависят от темы телефона и от того, включён ли Deep Focus.
const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 20 },

  chips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 9,
    overflow: 'hidden',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Антиква на заголовке и цифрах — единственное, что отличает наш экран
  // от любого другого таймера с кольцом.
  // fontWeight здесь не указан намеренно: у статичных начертаний насыщенность
  // задаётся выбором файла, а лишний fontWeight сбивает подбор шрифта.
  title: {
    fontSize: 44,
    letterSpacing: -0.8,
    ...Platform.select({ ios: { fontFamily: SERIF_BOLD } }),
  },
  range: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  ringSlot: { marginTop: 26 },

  clock: {
    fontSize: 58,
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
    ...Platform.select({ ios: { fontFamily: SERIF } }),
  },
  bigMin: {
    fontSize: 66,
    letterSpacing: -2,
    lineHeight: 72,
    fontVariant: ['tabular-nums'],
    ...Platform.select({ ios: { fontFamily: SERIF_BOLD } }),
  },
  minLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.2,
    marginTop: 2,
  },

  pips: { flexDirection: 'row', gap: 7, marginTop: 22 },
  pip: { width: 6, height: 6, borderRadius: 3 },

  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },

  // Тень на обёртке, а не на самом стекле: тень поверх GlassView гасит
  // преломление по краю, ради которого материал и берут.
  lift: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  liftMain: {
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 9 },
  },

  btnSide: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnMain: {
    width: 112,
    height: 74,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  btnOff: { opacity: 0.32 },
  btnPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
