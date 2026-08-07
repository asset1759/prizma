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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';

import {
  dressShield,
  ensureAuthorized,
  hasSelection,
  listId,
  listSize,
  startBlocking,
  stopBlocking,
} from '../blocking';

import * as LiveActivity from '../../modules/live-activity';
import { record as recordSession } from '../history';

import { GlassPane } from '../components/GlassPane';
import { HoldButton } from '../components/HoldButton';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { useClock, useResolvedScheme, useSettings, useT } from '../settings';
import { useSubscribed } from '../subscription';
import { MAX_MIN, TimerRing } from '../components/TimerRing';
import {
  DEEP_FOCUS,
  INK,
  PHASES,
  SERIF_BOLD,
  SESSIONS_PER_ROUND,
  matchPreset,
  withAlpha,
  type Ambient,
  type Phase,
} from '../theme';

const PRESET_LABEL = {
  classic: 'presetClassic',
  deep: 'presetDeep',
  brief: 'presetBrief',
} as const;

const PHASE_KEY = {
  focus: 'phaseFocus',
  short: 'phaseShort',
  long: 'phaseLong',
} as const;

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

  const t = useT();
  const clock = useClock();
  const subscribed = useSubscribed();
  const insets = useSafeAreaInsets();
  const scheme = useResolvedScheme();
  const { settings, update, setDuration: persistDuration } = useSettings();
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

  /**
   * Пробег спектра в конце сессии — та самая призма, от которой имя.
   * Показывается только за досчитанную фазу: это награда, а не отклик
   * на любое действие. Сброс её не запускает.
   */
  const flash = useSharedValue(0);

  // Deep Focus не отдельная фаза и не тема, а наложение поверх текущей фазы.
  // В светлой теме он всё равно тёмный: смысл режима в том, что свет уходит
  // из комнаты, и зависеть от настроек телефона это не должно.
  const skin = useMemo(() => {
    const deep = deepFocus && phase === 'focus';
    if (deep) {
      return {
        label: t('deepFocus'),
        accent: DEEP_FOCUS.accent,
        accentHi: DEEP_FOCUS.accentHi,
        canvas: DEEP_FOCUS.canvas,
        canvasOpacity: DEEP_FOCUS.canvasOpacity,
        ink: INK.dark,
        glassScheme: 'dark' as const,
      };
    }
    return {
      label: t(PHASE_KEY[phase]),
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
  }, [deepFocus, phase, spec, scheme, t]);

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

  /**
   * Пока идёт возврат к регулятору, кольцо остаётся в режиме прогресса.
   *
   * Регулятор рисуется без анимации — он должен ходить за пальцем, а не
   * догонять его. Поэтому при сбросе мы не отдаём кольцо ему сразу,
   * а доводим дугу прогрессом до той же отметки и только потом
   * переключаем: в момент переключения обе дуги совпадают, и подмены
   * не видно.
   */
  const [settling, setSettling] = useState(false);

  /** Отложенный переход к следующей фазе — ждёт, пока пробежит луч */
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Дуга догоняет отдельно от цифр: секундный скачок выглядел бы дёшево.
  useEffect(() => {
    // Во время возврата дугой распоряжается сброс — иначе этот эффект
    // тянул бы её к нулю, а он туда же и ведёт.
    if (settling) return;
    progress.value = withTiming(1 - left / duration, { duration: 900 });
  }, [left, duration, progress, settling]);

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
      t,
      endsAt !== null ? clock.time(new Date(endsAt)) : clock.endIn(held)
    );
  }, [deepFocus, endsAt, held, t, clock]);

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
      title: skin.label,
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
  }, [running, endsAt, held, duration, phase, deepFocus, skin.label]);

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
  const editable = !running && left === duration && !settling;

  /**
   * Набор длительностей меняется в настройках, а экран таймера остаётся
   * смонтированным — вкладки его больше не снимают. Поэтому изменение надо
   * подхватывать здесь.
   *
   * Только на нетронутой фазе: перебивать идущую или отложенную сессию
   * настройкой нельзя, это стёрло бы уже сделанное.
   */
  const lastSaved = useRef(saved);

  useEffect(() => {
    // Только на настоящее изменение настроек. Без этой сверки эффект
    // срабатывал бы и на кручение регулятора и тут же возвращал бы
    // длительность к сохранённой — ручка отскакивала бы из-под пальца.
    if (lastSaved.current === saved) return;
    lastSaved.current = saved;

    if (running || left !== duration) return;
    const next = saved[phase];
    if (next === duration) return;
    setDuration(next);
    setHeld(next);
  }, [saved, phase, running, left, duration]);

  /**
   * Шкала кольца — насечки и подписи — принадлежит регулятору и должна
   * появляться и уходить вместе с дугой, а не подменяться в конце готовой
   * картинкой. Длительность та же, что у отмотки и возврата, поэтому
   * всё кольцо движется как одно целое.
   *
   * Во время возврата условие держится за `settling`: регулятором кольцо
   * ещё не стало, но шкала уже должна проявляться.
   */
  const dialOn = useSharedValue(1);

  useEffect(() => {
    dialOn.value = withTiming(editable || settling ? 1 : 0, {
      duration: 560,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [editable, settling, dialOn]);

  /**
   * Центр кольца ведёт та же величина, что и шкалу.
   *
   * Окно секунд сужается до нуля, а сами секунды одновременно уезжают
   * ровно на свою ширину влево — под минуты. Обе величины идут от одного
   * `dialOn`, поэтому «:00» не тает, а именно прячется за числом:
   * левый край окна стоит впритык к минутам и обрезает всё, что за него
   * заехало.
   */
  const [secW, setSecW] = useState(0);

  const winStyle = useAnimatedStyle(() => ({ width: secW * (1 - dialOn.value) }));

  const secStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -secW * dialOn.value }],
  }));

  // Без секунд числу просторнее — оно подрастает, освобождая место обратно
  // при их появлении. Скачок размера между режимами был ещё одним стыком.
  const numStyle = useAnimatedStyle(() => ({ fontSize: 58 + 8 * dialOn.value }));

  /**
   * Playfair садится ниже середины своей строки, и тем сильнее, чем мельче
   * кегль. Замерено по снимкам экрана: 11.7 pt при 58 и 8.0 pt при 66.
   *
   * Поэтому поправка не постоянная, а едет вместе с кеглем от той же
   * величины: иначе число подпрыгивало бы посреди перехода. Числа взяты
   * из измерения, а не из метрик шрифта — RN пересчитывает их по-своему,
   * и сходятся только замеры.
   */
  const stackStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -(11.7 - 3.7 * dialOn.value) }],
  }));

  const minStyle = useAnimatedStyle(() => ({ opacity: dialOn.value }));

  const setMinutes = useCallback(
    (m: number) => {
      setDuration(m * 60);
      setHeld(m * 60);
      /**
       * Запоминаем только по подписке. Регулятор бесплатный — крутить
       * может кто угодно, — но выставленное живёт до конца текущей фазы.
       * Платится не длительность, а её память: получить своё сочетание
       * обратно завтра и есть то, за что просят денег.
       */
      if (subscribed) persistDuration(phase, m * 60);
    },
    [phase, persistDuration, subscribed]
  );

  /**
   * Ноль ловим здесь, а не в тикающем счётчике: вернувшись из фона через
   * час, приложение увидит просроченный дедлайн и завершит фазу сразу,
   * не досчитывая пропущенное по секунде.
   */
  useEffect(() => {
    if (left !== 0 || !running) return;

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setRunning(false);

    // Перерыв в историю не идёт — он не достижение. Фокус идёт весь,
    // но с отметкой, чем кончился: досчитанные и прерванные показываются
    // по-разному, а вот считаться должны оба, иначе доля доведённых до
    // конца невыводима ни из чего.
    if (phase === 'focus') {
      recordSession({
        sec: duration,
        deep: deepFocus,
        done: true,
        startedAt: startedAt?.getTime(),
        planned: duration,
      });
    }
    /**
     * Держим ноль на виду. Без этого остаток тут же возвращался к `held`,
     * то есть к полной длительности, кольцо признавало себя регулятором
     * и досчитанный круг пропадал в тот самый момент, ради которого всё
     * и затевалось.
     */
    setHeld(0);

    // Одним присваиванием: два подряд в одном такте Reanimated схлопывает
    // до последнего и анимацию теряет.
    flash.value = withSequence(
      withTiming(0, { duration: 0 }),
      // Ровный ход: разгон и торможение съедали середину пути, где луч
      // как раз и виден лучше всего.
      withTiming(1, { duration: 1500, easing: Easing.linear })
    );

    if (endTimer.current) clearTimeout(endTimer.current);
    /**
     * Смену фазы придерживаем: иначе кольцо начнёт перекрашиваться и
     * собирать шкалу прямо под лучом. К этому моменту луч уже гаснет,
     * так что переход подхватывает его, а не перебивает.
     */
    endTimer.current = setTimeout(() => advance(true), 1350);
  }, [left, running, advance, flash, phase, duration, deepFocus]);

  // Чистим только при размонтировании. Возврат из самого эффекта не годится:
  // эффект перезапускается сразу же — состояние-то он и меняет, — и уборка
  // гасила бы таймер, который только что поставили.
  useEffect(() => () => {
    if (endTimer.current) clearTimeout(endTimer.current);
  }, []);

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

  /**
   * Отметил ли человек хоть что-то в системном выборе.
   *
   * Дублирует проверку хранилища намеренно: включение Deep Focus не должно
   * зависеть от того, ответит ли чтение. Событие приходит прямо в момент
   * отметки и врать не может.
   */
  const picked = useRef(false);

  const enableDeep = useCallback(() => {
    startBlocking(t, settings.appList, clock.endIn(left));
    setDeepFocus(true);
  }, [left, t, clock, settings.appList]);

  /**
   * Строгая сессия идёт — оборвать её нельзя.
   *
   * Держим и щит, и сброс: выключить блокировку через сброс было бы
   * обходным путём в один жест, и весь смысл режима пропал бы.
   */
  const lockedByStrict = settings.strict && deepFocus && running;

  /**
   * Обе плашки наверху показывают настоящее.
   *
   * Раньше слева стоял «Тихий дом» — название пресета из первого макета,
   * за которым ничего не появилось, — а справа зашитая цифра 12. Плашка,
   * которая всегда говорит одно и то же, хуже отсутствующей: она врёт,
   * и человек перестаёт верить остальным.
   */
  const presetName = (() => {
    const k = matchPreset(saved);
    return k ? t(PRESET_LABEL[k]) : t('presetCustom');
  })();

  /**
   * Сколько закрыто. Ноль не показываем никогда: если список не пуст,
   * а числа нет, честнее сказать «Включено», чем «0 закрыто» — ноль
   * читается как «ничего не сработало» и подрывает доверие к плашке,
   * которая как раз и отвечает за то, работает ли блокировка.
   */
  const counted = settings.listCount ?? listSize(settings.appList);
  const blockedCount = counted ? counted.apps + counted.categories : 0;

  const refuseStrict = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    Alert.alert(t('strictTitle'), t('strictRunning'));
  }, [t]);

  const toggleDeep = useCallback(async () => {
    if (lockedByStrict) {
      refuseStrict();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});

    if (deepFocus) {
      stopBlocking();
      setDeepFocus(false);
      return;
    }

    const authorized = await ensureAuthorized();
    if (!authorized) {
      Alert.alert(
        t('screenTimeTitle'),
        t('screenTimeBody')
      );
      return;
    }

    // Первый раз — сначала выбор приложений, блокировать пока нечего.
    if (!hasSelection(settings.appList)) {
      picked.current = false;
      setPickerOpen(true);
      return;
    }

    enableDeep();
  }, [deepFocus, enableDeep, settings.appList, lockedByStrict, refuseStrict, t]);

  /**
   * Сброс возвращает текущую фазу к началу — не переключает на следующую.
   * Круги пройденных сессий не трогаем: человек отменил один заход,
   * а не отказался от всего сделанного за день.
   *
   * Deep Focus снимается вместе с сессией: держать приложения закрытыми
   * ради таймера, который уже обнулён, не за чем.
   */
  const reset = useCallback(() => {
    if (lockedByStrict) {
      refuseStrict();
      return;
    }
    if (deepFocus) {
      stopBlocking();
      setDeepFocus(false);
    }

    /**
     * Прерванная сессия тоже пишется. Не ради того, чтобы её показать —
     * в итогах и столбиках её не будет, — а ради знаменателя: без
     * прерванных доля доведённых до конца всегда ровно сто процентов,
     * и единственная метрика приложения, умеющая ухудшаться, молчит.
     *
     * Короче минуты не пишется ничего: отсекается в `record`.
     */
    if (phase === 'focus') {
      recordSession({
        sec: duration - left,
        deep: deepFocus,
        done: false,
        startedAt: startedAt?.getTime(),
        planned: duration,
      });
    }

    delete stash.current[phase];
    setRunning(false);
    setEndsAt(null);
    setStartedAt(null);
    // Длительность остаётся выставленной: сбрасывается ход, а не настройка.
    setHeld(duration);

    /**
     * Дуга дорастает до отметки регулятора — зеркально старту, где она
     * оттуда же отматывалась. Без этого кольцо перескакивало одним
     * кадром: прогресс сессии и положение регулятора меряют разное,
     * и переход между ними надо проговорить движением.
     */
    setSettling(true);
    progress.value = withTiming(
      duration / (MAX_MIN * 60),
      { duration: 560, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        // Кольцо отдаём регулятору только когда дуга уже на месте.
        if (finished) runOnJS(setSettling)(false);
      }
    );
  }, [deepFocus, phase, duration, left, startedAt, progress, lockedByStrict, refuseStrict]);

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
  const rangeText = `${clock.time(startedAt ?? new Date(now))} → ${clock.time(
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
              {presetName}
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
              {!deepFocus
                ? t('blockingOff')
                : blockedCount > 0
                  ? t('blockedCount', { count: blockedCount })
                  : t('blockingOn')}
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
              dialOn={dialOn}
              flash={flash}
              onChangeMinutes={setMinutes}
              labelColor={skin.ink.tertiary}
            >
              {/* Минуты стоят на месте, секунды прячутся за ними и оттуда же
                  выезжают. Никакого затухания: окно секунд обрезает всё, что
                  левее, поэтому «:00» буквально выходит из-под числа. */}
              <Animated.View style={[styles.faceStack, stackStyle]}>
                <View style={styles.faceRow}>
                  <Animated.Text
                    style={[styles.faceNum, numStyle, { color: skin.ink.primary }]}
                  >
                    {Math.floor(left / 60)}
                  </Animated.Text>

                  <Animated.View style={[styles.secWindow, winStyle]}>
                    <Animated.Text
                      style={[
                        styles.faceNum,
                        numStyle,
                        secStyle,
                        { color: skin.ink.primary, width: secW || undefined },
                      ]}
                      numberOfLines={1}
                    >
                      {`:${String(left % 60).padStart(2, '0')}`}
                    </Animated.Text>
                  </Animated.View>
                </View>

                {/* Подпись висит под числом и в разметке не участвует.
                    Иначе связка центровалась бы как пара, и само число
                    стояло бы выше середины кольца. */}
                <Animated.Text
                  style={[styles.minLabel, minStyle, { color: skin.ink.secondary }]}
                >
                  {t('minutesShort')}
                </Animated.Text>
              </Animated.View>

              {/* Зонд: меряет ширину секунд один раз, чтобы знать, на сколько
                  их прятать. Лежит вне потока и не виден. */}
              <Text
                style={styles.probe}
                onLayout={(e) => {
                  const w = Math.ceil(e.nativeEvent.layout.width);
                  if (w > 0 && w !== secW) setSecW(w);
                }}
              >
                :00
              </Text>
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
            {t('holdToReset')}
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
              accessibilityLabel={t('a11yReset')}
              accessibilityHint={t('a11yHoldHint')}
            />

            <Pressable
              onPress={toggleRun}
              style={({ pressed }) => [styles.liftMain, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel={running ? t('a11yPause') : t('a11yStart')}
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
              accessibilityLabel={t('a11yDeepFocus')}
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

        {/* Системный выбор Apple, если список ещё пуст. Обычно его правят
            на вкладке «Приложения», но не гнать же туда человека, который
            уже нажал Deep Focus. */}
        {pickerOpen ? (
          <DeviceActivitySelectionSheetViewPersisted
            familyActivitySelectionId={listId(settings.appList)}
            headerText={t('pickerHeader')}
            footerText={t('pickerFooter')}
            includeEntireCategory
            onSelectionChange={(e) => {
              const m = e.nativeEvent;
              const total = m.applicationCount + m.categoryCount + m.webDomainCount;
              picked.current = total > 0;
              update({
                listCount: total > 0
                  ? { apps: m.applicationCount, categories: m.categoryCount }
                  : null,
              });
            }}
            onDismissRequest={() => {
              setPickerOpen(false);
              if (picked.current || hasSelection(settings.appList)) enableDeep();
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

  // Центруется по числу, а не по паре с подписью: середина кольца должна
  // приходиться на цифры, они здесь главные.
  faceStack: { alignItems: 'center' },
  faceRow: { flexDirection: 'row', alignItems: 'center' },
  // Высота задана жёстко: размер шрифта анимируется, и без этого строка
  // дышала бы по высоте вместе с ним.
  faceNum: {
    lineHeight: 72,
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    ...Platform.select({ ios: { fontFamily: SERIF_BOLD } }),
  },
  // Обрезает всё, что уехало за левый край, — за счёт этого секунды
  // и выглядят спрятанными под минутами.
  secWindow: { overflow: 'hidden' },
  minLabel: {
    position: 'absolute',
    // Отсчитывается от низа строки с числом, а он ниже самих цифр из-за
    // междустрочного интервала — отсюда запас.
    bottom: -17,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  probe: { position: 'absolute', opacity: 0, fontSize: 58, letterSpacing: -2,
    ...Platform.select({ ios: { fontFamily: SERIF_BOLD } }) },

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
