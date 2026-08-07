import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { Canvas, Group, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

/**
 * Кольцо таймера в двух режимах.
 *
 * До старта — регулятор длительности: полный круг равен MAX_MIN минутам,
 * ручка тянется по окружности. После старта — обычный индикатор прогресса.
 * Один элемент вместо двух: до старта кольцо иначе просто простаивает.
 */

export const RING_SIZE = 232;
const STROKE = 16;
const R = (RING_SIZE - STROKE) / 2;
const CENTER = RING_SIZE / 2;

/** Полный оборот = час. Меньше пяти минут сессия не имеет смысла. */
export const MAX_MIN = 60;
export const MIN_MIN = 5;

/** Ручка чуть шире дуги: в неё вписана стрелка направления */
const KNOB = 28;

const ARC_RECT = {
  x: STROKE / 2,
  y: STROKE / 2,
  width: RING_SIZE - STROKE,
  height: RING_SIZE - STROKE,
};

/** Угол от 12 часов по часовой стрелке, 0…360 */
function angleFromTop(dx: number, dy: number) {
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export function TimerRing({
  progress,
  accent,
  accentHi,
  track,
  /** Минуты, выставленные регулятором. Показываются, пока сессия не идёт */
  minutes,
  /** Пока true — кольцо работает регулятором, иначе индикатором */
  editable,
  /**
   * Насколько кольцо сейчас «регулятор»: 1 — шкала на месте, 0 — её нет.
   * Ведёт экран, потому что только он знает про переходы старта и сброса.
   */
  dialOn,
  onChangeMinutes,
  labelColor,
  children,
}: {
  progress: SharedValue<number>;
  accent: string;
  accentHi: string;
  track: string;
  minutes: number;
  editable: boolean;
  dialOn: SharedValue<number>;
  onChangeMinutes?: (m: number) => void;
  labelColor: string;
  children?: React.ReactNode;
}) {
  // Дуга начинается на 12 часах и идёт по часовой стрелке.
  const path = useMemo(
    () => Skia.PathBuilder.Make().addArc(ARC_RECT, -90, 360).detach(),
    []
  );

  const fill = Math.min(1, Math.max(0, minutes / MAX_MIN));

  /**
   * Единая длина дуги для обоих режимов.
   *
   * Раньше их было две — своя у регулятора, своя у прогресса, — и на
   * переходе одна подменялась другой готовой картинкой. Теперь дуга,
   * насечки, шкала и ручка считаются от одного значения, поэтому
   * двигаются вместе и подменять нечего.
   *
   * Регулятор берётся без анимации: он обязан идти за пальцем, а не
   * догонять его. Переходы ведёт экран через `progress`.
   */
  const arc = useDerivedValue(() =>
    editable ? fill : Math.min(1, Math.max(0, progress.value))
  );

  /**
   * Обрезка насечек по текущей длине дуги. Путь пересобирается каждый
   * кадр — иначе шкала проступала бы вся разом поверх ещё короткой дуги,
   * а именно это и читалось как подмена картинки.
   */
  const tickClip = useDerivedValue(() =>
    Skia.PathBuilder.Make()
      .addArc(ARC_RECT, -90, Math.max(0.01, arc.value * 360))
      .detach()
  );

  // Насечки по заполненной части — та самая деталь, из-за которой кольцо
  // читается как шкала, а не как просто дуга.
  const ticks = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (let m = 1; m <= MAX_MIN; m += 1) {
      const a = ((m / MAX_MIN) * 360 - 90) * (Math.PI / 180);
      const long = m % 5 === 0;
      const inner = R - (long ? 6 : 4);
      const outer = R + (long ? 6 : 4);
      b.moveTo(CENTER + Math.cos(a) * inner, CENTER + Math.sin(a) * inner);
      b.lineTo(CENTER + Math.cos(a) * outer, CENTER + Math.sin(a) * outer);
    }
    return b.detach();
  }, []);

  const lastM = useRef(minutes);
  lastM.current = minutes;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => editable,
        onMoveShouldSetPanResponder: () => editable,
        onPanResponderGrant: (e) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY),
        onPanResponderMove: (e) => handle(e.nativeEvent.locationX, e.nativeEvent.locationY),
      }),
    // handle замыкает свежий onChangeMinutes через ref-подобный доступ ниже
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, onChangeMinutes]
  );

  function handle(lx: number, ly: number) {
    const deg = angleFromTop(lx - CENTER, ly - CENTER);
    let m = Math.round((deg / 360) * MAX_MIN);
    // Верхняя точка — это конец круга, а не ноль: иначе при заходе за 12
    // регулятор схлопывался бы в минимум.
    if (m <= 0) m = lastM.current > MAX_MIN / 2 ? MAX_MIN : MIN_MIN;
    m = Math.max(MIN_MIN, Math.min(MAX_MIN, m));
    if (m !== lastM.current) {
      lastM.current = m;
      // Щелчок на каждой минуте — как насечка под пальцем у физического
      // регулятора. Реже ощущается как подтормаживание, а не как шкала.
      Haptics.selectionAsync().catch(() => {});
      onChangeMinutes?.(m);
    }
  }

  /**
   * Ручка живёт в обоих режимах: до старта за неё тянут, во время сессии
   * она отмечает текущую точку на круге. Позиция считается в воркл
   * от анимированного прогресса — иначе во время сессии она дёргалась бы
   * раз в секунду вместо плавного хода.
   */
  const knobStyle = useAnimatedStyle(() => {
    const p = arc.value;
    const a = ((p * 360 - 90) * Math.PI) / 180;
    return {
      transform: [
        { translateX: Math.cos(a) * R },
        { translateY: Math.sin(a) * R },
        { rotate: `${p * 360}deg` },
      ],
    };
  });

  /** Шкала гаснет и загорается вместе с насечками */
  const scaleStyle = useAnimatedStyle(() => ({ opacity: dialOn.value }));

  return (
    <View style={styles.wrap} {...(editable ? pan.panHandlers : {})}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          color={track}
        />

        {/* Заполненная часть — одна на оба режима */}
        <Path
          path={path}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          start={0}
          end={arc}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(RING_SIZE, RING_SIZE)}
            colors={[accentHi, accent]}
          />
        </Path>

        {/* Насечки поверх заливки, обрезаны по её текущей длине */}
        <Group clip={tickClip} opacity={dialOn} layer>
          <Path
            path={ticks}
            style="stroke"
            strokeWidth={1.4}
            color="rgba(255,255,255,0.45)"
          />
        </Group>
      </Canvas>

      {/* Подписи шкалы принадлежат регулятору: во время сессии они
          сообщали бы о длительности, которую уже не поменять. Гаснут
          не мгновенно, а вместе с насечками и дугой. */}
      <Animated.View
        style={[StyleSheet.absoluteFill, scaleStyle]}
        pointerEvents="none"
      >
        <Label value={MAX_MIN} style={styles.lTop} color={labelColor} />
        <Label value={MAX_MIN / 4} style={styles.lRight} color={labelColor} />
        <Label value={MAX_MIN / 2} style={styles.lBottom} color={labelColor} />
        <Label value={(MAX_MIN / 4) * 3} style={styles.lLeft} color={labelColor} />
      </Animated.View>

      {/* Стрелка касательная к окружности и всегда по часовой: сверху вправо,
          справа вниз, слева вверх. Нарисована смотрящей вправо и повёрнута
          на текущий угол — так она подсказывает направление хода. */}
      <Animated.View
        style={[styles.knob, { backgroundColor: accentHi }, knobStyle]}
        pointerEvents="none"
      >
        <SymbolView name="arrow.right" size={13} tintColor={accent} weight="bold" />
      </Animated.View>

      <View style={styles.face} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

function Label({ value, style, color }: { value: number; style: any; color: string }) {
  return (
    <Text style={[styles.label, style, { color }]} pointerEvents="none">
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  wrap: { width: RING_SIZE, height: RING_SIZE },
  face: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: { position: 'absolute', fontSize: 12, fontWeight: '600' },
  lTop: { top: STROKE + 8, alignSelf: 'center', left: 0, right: 0, textAlign: 'center' },
  lBottom: { bottom: STROKE + 8, alignSelf: 'center', left: 0, right: 0, textAlign: 'center' },
  lRight: { right: STROKE + 10, top: CENTER - 8 },
  lLeft: { left: STROKE + 10, top: CENTER - 8 },
  knob: {
    position: 'absolute',
    // Базовая точка — центр кольца, дальше ручку сдвигает transform.
    left: CENTER - KNOB / 2,
    top: CENTER - KNOB / 2,
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
