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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import {
  SELECTION_ID,
  dressShield,
  ensureAuthorized,
  hasSelection,
  startBlocking,
  stopBlocking,
} from '../blocking';

import * as LiveActivity from '../../modules/live-activity';

import { GlassPane } from '../components/GlassPane';
import { HoldButton } from '../components/HoldButton';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useResolvedScheme, useSettings } from '../settings';
import { MAX_MIN, TimerRing } from '../components/TimerRing';
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
   *
   * Отсюда же считается и сам отсчёт — см. `left` ниже.
   */
  const [now, setNow] = useState(() => Date.now());

  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();
  const { settings, setDuration: persistDuration } = useSettings();
  const saved = settings.durations;

  const spec = PHASES[scheme][phase];
  /** Длительность текущей фазы — её можно менять регулятором на кольце */
  const [duration, setDuration] = useState(() => saved.focus);

  /**
   * Сессия хранится как момент окончания, а не как убывающий счётчик.
   *
   * Счётчик, который каждую секунду вычитает единицу, живёт ровно столько,
   * сколько работает JavaScript. Стоит свернуть приложение — iOS усыпляет
   * поток, интервал перестаёт срабатывать, и это время просто пропадает:
   * таймер продолжает с того места, где заснул. Для Помодоро это бьёт
   * в самый смысл, потому что телефон откладывают именно тогда.
   *
   * С дедлайном сон приложения ничего не значит: остаток каждый раз
   * вычисляется от настенных часов. Заодно уходит накопленная погрешность
   * интервала — за двадцать пять минут набегало несколько секунд.
   */
  const [endsAt, setEndsAt] = useState<number | null>(null);
  /** Остаток на паузе и до старта: с этого места сессия продолжится */
  const [held, setHeld] = useState(() => saved.focus);

  /**
   * Округляем вверх: «25:00» должно висеть всю первую секунду, а ноль
   * наступать ровно в момент дедлайна, а не за полсекунды до него.
   */
  const left =
    running && endsAt !== null ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : held;

  const progress = useSharedValue(0);

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
   *
   * ВНИМАНИЕ: заполнять этот тайник сейчас некому. Единственным входом
   * был «Пропустить», а его заменил сброс, который отложенное как раз
   * стирает. Механизм оставлен под будущий досрочный выход из фазы —
   * пока он просто ни разу не срабатывает.
   */
  const stash = useRef<Partial<Record<Phase, { left: number; duration: number }>>>({});

  const goToPhase = useCallback(
    (next: Phase, currentCompleted = false) => {
      if (currentCompleted) delete stash.current[phase];
      else stash.current[phase] = { left, duration };

      const kept = stash.current[next];
      // Прерванная фаза важнее сохранённой длительности: она уже началась.
      const d = kept?.duration ?? saved[next];
      const l = kept?.left ?? d;

      setPhase(next);
      setDuration(d);
      setHeld(l);
      setEndsAt(null);
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

  // Дуга догоняет отдельно от цифр: секундный скачок выглядел бы дёшево.
  useEffect(() => {
    progress.value = withTiming(1 - left / duration, { duration: 900 });
  }, [left, duration, progress]);

  /**
   * Единственные часы экрана. От них считается и отсчёт, и подпись
   * диапазона — отдельному счётчику отсчитывать больше нечего.
   *
   * Во время сессии перерисовка привязана к дедлайну, а не к ровному
   * интервалу: setInterval срабатывает с небольшим опозданием, за двадцать
   * пять минут его набирается на секунду-другую, и цифры изредка
   * перепрыгивали бы через значение. Каждый шаг вычисляется заново от
   * остатка, поэтому опоздание не копится.
   *
   * Вне сессии хватает минуты, выровненной по её границе: подпись
   * показывает минуты, чаще незачем будить экран.
   */
  useEffect(() => {
    const update = () => setNow(Date.now());

    if (running && endsAt !== null) {
      let id: ReturnType<typeof setTimeout>;
      const step = () => {
        const t = Date.now();
        setNow(t);
        const rest = endsAt - t;
        if (rest <= 0) return;
        // Восемь миллисекунд запаса, чтобы не проснуться за миг ДО границы
        // и не показать одну и ту же секунду дважды подряд.
        id = setTimeout(step, (rest % 1000 || 1000) + 8);
      };
      step();
      return () => clearTimeout(id);
    }

    update();

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
  }, [running, endsAt]);

  /**
   * Щит носит время окончания прямо в тексте, и это обещание обязано
   * оставаться правдой: Deep Focus можно включить до старта, сессию —
   * поставить на паузу, длительность — перекрутить регулятором.
   *
   * Зависимости намеренно от дедлайна и остатка, а не от `left`: тот
   * меняется раз в секунду, и щит переодевался бы столько же раз.
   */
  useEffect(() => {
    if (!deepFocus) return;
    dressShield(
      endsAt !== null ? formatTimeOfDay(new Date(endsAt)) : formatEndTime(held)
    );
  }, [deepFocus, endsAt, held]);

  /**
   * Живая активность: таймер на экране блокировки и в Dynamic Island.
   *
   * Зовём только на смену состояния, а не каждую секунду. Отсчёт там
   * рисует сама iOS по паре дат — пока сессия идёт ровно, приложение
   * может спать сколько угодно, цифры останутся верными.
   *
   * Начало отрезка передаём виртуальное: `endsAt` минус полная
   * длительность фазы. Тогда дуга показывает пройденную часть всей
   * фазы, а не отрезка после последней паузы — иначе после каждой
   * паузы она откатывалась бы к нулю.
   */
  const liveOn = useRef(false);

  useEffect(() => {
    const engaged = running || left < duration;

    if (!engaged) {
      if (liveOn.current) {
        LiveActivity.end();
        liveOn.current = false;
      }
      return;
    }

    const endMs = endsAt ?? Date.now() + held * 1000;
    const state = {
      endsAt: endMs / 1000,
      startedAt: (endMs - duration * 1000) / 1000,
      running,
      leftSeconds: left,
      phase,
      deep: deepFocus && phase === 'focus',
    };

    if (liveOn.current) {
      LiveActivity.update(state);
    } else {
      liveOn.current = LiveActivity.start(state);
    }
    // `left` намеренно не в зависимостях: он меняется раз в секунду,
    // а активность от этого не зависит — она считает время сама.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, endsAt, held, duration, phase, deepFocus]);

  // Живая активность переживает закрытие экрана: сессия идёт, даже когда
  // человек ушёл на другую вкладку. Гасим только при полном размонтировании.
  useEffect(() => () => {
    if (liveOn.current) LiveActivity.end();
  }, []);

  /**
   * Паузу могли нажать на экране блокировки, пока приложение спало.
   * Тогда ведущим оказывается экран блокировки — он единственный, кто
   * наверняка жив в момент нажатия, — и таймер подстраивается под него,
   * а не наоборот.
   */
  const lastStamp = useRef(0);

  const adoptExternal = useCallback(() => {
    const s = LiveActivity.readShared();
    if (!s || s.stamp <= lastStamp.current) return;
    lastStamp.current = s.stamp;

    setRunning(s.running);
    setHeld(s.leftSeconds);
    setEndsAt(s.running ? s.endsAt * 1000 : null);
    setNow(Date.now());
  }, []);

  // Из фона можно вернуться через час — время должно быть верным сразу,
  // не дожидаясь ближайшей границы минуты.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setNow(Date.now());
        adoptExternal();
      }
    });
    return () => sub.remove();
  }, [adoptExternal]);

  /**
   * Регулятор доступен, пока не потрачено ни секунды. Привязка к startedAt
   * не годится: после возврата с перерыва он пуст, и случайное касание
   * стёрло бы восстановленный остаток.
   */
  const editable = !running && left === duration;

  const setMinutes = useCallback(
    (m: number) => {
      setDuration(m * 60);
      setHeld(m * 60);
      // Выбор запоминается для этой фазы: в следующий раз она начнётся
      // с той длительности, которую человек выставил, а не с заводской.
      persistDuration(phase, m * 60);
    },
    [phase, persistDuration]
  );

  /**
   * Ноль ловим здесь, а не в тикающем счётчике: вернувшись из фона через
   * час, приложение увидит просроченный дедлайн и завершит фазу сразу,
   * не досчитывая пропущенное по секунде.
   */
  useEffect(() => {
    if (left === 0 && running) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRunning(false);
      advance(true);
    }
  }, [left, running, advance]);

  const toggleRun = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    if (running) {
      // На паузе остаток нужно зафиксировать: дедлайн дальше не имеет
      // смысла, часы-то продолжают идти.
      setHeld(left);
      setEndsAt(null);
      setRunning(false);
      return;
    }

    /**
     * Старт с нетронутого регулятора: дуга отматывается к нулю и уже
     * оттуда растёт заново.
     *
     * Без этого она перескакивала одним кадром. Регулятор и прогресс
     * меряют разное: у первого полный круг — час шкалы, у второго — вся
     * сессия. Двадцать пять минут на регуляторе стоят на сорока-с-лишним
     * процентах круга, а прогресс сессии в этот момент равен нулю, и
     * переход между ними выглядел обрывом.
     *
     * Отмотка эту разницу проговаривает: круг был про минуты, стал про
     * сессию. Продолжение с паузы её не делает — там дуга уже на своём
     * месте, и откат читался бы как потеря сделанного.
     */
    if (left === duration) {
      // Одним присваиванием, через последовательность. Двумя подряд —
      // сначала сырое значение, потом анимация — не работает: в одном
      // такте Reanimated оставляет последнюю запись и отбрасывает
      // анимацию, дуга просто замирает на месте регулятора.
      progress.value = withSequence(
        withTiming(duration / (MAX_MIN * 60), { duration: 0 }),
        withTiming(0, { duration: 560, easing: Easing.inOut(Easing.cubic) })
      );
    }

    const t = Date.now();
    // `now` двигаем вместе с дедлайном. Вне сессии он обновляется раз
    // в минуту и может быть на полминуты позади — остаток на один кадр
    // оказался бы больше выставленного.
    setNow(t);
    setEndsAt(t + left * 1000);
    setRunning(true);
    // Момент старта фиксируем один раз за сессию: пауза не должна
    // сдвигать левую границу диапазона.
    setStartedAt((prev) => prev ?? new Date(t));
  }, [running, left, duration, progress]);

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

  /**
   * Сброс возвращает текущую фазу к началу — не переключает на следующую.
   * Круги пройденных сессий не трогаем: человек отменил один заход,
   * а не отказался от всего сделанного за день.
   *
   * Deep Focus снимается вместе с сессией: держать приложения закрытыми
   * ради таймера, который уже обнулён, не за чем.
   */
  const reset = useCallback(() => {
    if (deepFocus) {
      stopBlocking();
      setDeepFocus(false);
    }
    delete stash.current[phase];
    setRunning(false);
    setEndsAt(null);
    setStartedAt(null);
    // Длительность остаётся выставленной: сбрасывается ход, а не настройка.
    setHeld(duration);
    // Дугу отматывает эффект, следящий за left — отдельно её здесь не трогаем.
  }, [deepFocus, phase, duration]);

  /**
   * Подсказка про удержание. Живёт здесь, а не в кнопке: ей нужно место
   * над доком, и висеть она должна ещё секунду после того, как палец
   * убрали — иначе при быстром тычке текст мелькнёт и его не прочитают.
   */
  const [hintOn, setHintOn] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hint = useSharedValue(0);

  const handleHold = useCallback((holding: boolean) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    if (holding) {
      setHintOn(true);
      return;
    }
    // Полторы секунды на прочтение: при быстром тычке подсказка иначе
    // мелькнёт вместе с пальцем, а именно этот случай её и вызывает.
    hintTimer.current = setTimeout(() => setHintOn(false), 1800);
  }, []);

  useEffect(() => {
    hint.value = withTiming(hintOn ? 1 : 0, { duration: 200 });
  }, [hintOn, hint]);

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hint.value,
    transform: [{ translateY: (1 - hint.value) * 6 }],
  }));

  /** Сбрасывать нечего, пока фаза стоит нетронутой на полном круге */
  const canReset = running || left < duration;

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
        <View style={styles.dockWrap}>
          {/* Подсказка absolute: появись она в потоке, док подпрыгивал бы
              на каждое касание. */}
          <Animated.Text
            style={[styles.hint, hintStyle, { color: skin.ink.secondary }]}
            pointerEvents="none"
          >
            Держите, чтобы сбросить
          </Animated.Text>

          <View style={styles.dockRow}>
            <HoldButton
              size={64}
              radius={22}
              icon="arrow.counterclockwise"
              iconColor={skin.ink.primary}
              ringColor={skin.accentHi}
              trackColor={skin.ink.tertiary}
              scheme={skin.glassScheme}
              disabled={!canReset}
              onComplete={reset}
              onHoldChange={handleHold}
              accessibilityLabel="Сбросить"
            />

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

  dockWrap: { justifyContent: 'flex-end' },
  dockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  // Над кольцом сброса, но выше его внешнего края: иначе подсказка
  // задевала бы растущую дугу.
  hint: {
    position: 'absolute',
    top: -26,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
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
  btnPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
});
