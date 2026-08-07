import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';

import { GlassPane } from './GlassPane';
import type { Scheme } from '../theme';

/**
 * Кнопка, срабатывающая от удержания.
 *
 * Нужна там, где случайное касание стоит дорого: сброс стирает начатую
 * сессию, и подтверждать его отдельным диалогом — значит ставить окно
 * поверх экрана ради одной кнопки. Удержание дешевле: оно и есть
 * подтверждение, растянутое во времени.
 *
 * Заполняющееся кольцо взято с главного кольца таймера намеренно —
 * в приложении уже есть язык «дуга растёт, значит идёт время».
 */

/** Меньше — легко нажать случайно, больше — начинает раздражать */
const HOLD_MS = 820;

/** Насколько кольцо выходит за кромку стекла */
const RIM = 7;
const RING_W = 3;

/**
 * Щелчки учащаются к концу: нарастающее напряжение подсказывает пальцу,
 * что осталось немного, лучше любой подписи.
 */
const TICKS = [0.3, 0.55, 0.73, 0.86, 0.95];

export function HoldButton({
  size,
  radius,
  icon,
  iconColor,
  ringColor,
  trackColor,
  scheme,
  disabled,
  onComplete,
  onHoldChange,
  accessibilityLabel,
  accessibilityHint,
}: {
  size: number;
  radius: number;
  icon: SFSymbol;
  iconColor: string;
  /** Цвет растущей дуги — акцент текущей фазы */
  ringColor: string;
  /** Непройденная часть кольца: показывает, сколько ещё держать */
  trackColor: string;
  scheme: Scheme;
  disabled?: boolean;
  onComplete: () => void;
  /** Экран показывает подсказку, пока палец на кнопке */
  onHoldChange?: (holding: boolean) => void;
  accessibilityLabel: string;
  accessibilityHint: string;
}) {
  const fill = useSharedValue(0);
  /** Видимость кольца отдельно от заполнения: дорожка нужна сразу */
  const shown = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const fired = useRef(false);

  const clearTicks = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTicks, [clearTicks]);

  const box = size + RIM * 2;

  /**
   * Кольцо повторяет форму кнопки, а не рисуется окружностью: у стекла
   * скругление меньше половины стороны, и круг вокруг него читался бы
   * как чужая деталь. Контур начинается в верхней точке и идёт по
   * часовой — так же, как дуга таймера.
   */
  const ring = useMemo(() => {
    const w = box - RING_W;
    const r = radius + RIM - RING_W / 2;
    const o = RING_W / 2;
    return Skia.PathBuilder.Make()
      .moveTo(o + w / 2, o)
      .arcToTangent(o + w, o, o + w, o + w, r)
      .arcToTangent(o + w, o + w, o, o + w, r)
      .arcToTangent(o, o + w, o, o, r)
      .arcToTangent(o, o, o + w, o, r)
      .close()
      .detach();
  }, [box, radius]);

  const end = useDerivedValue(() => fill.value);

  const finish = useCallback(() => {
    fired.current = true;
    clearTicks();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onHoldChange?.(false);
    // Кольцо гаснет уже полным — откатывать его назад значило бы показать
    // отмену там, где действие как раз состоялось.
    shown.value = withTiming(0, { duration: 300 });
    fill.value = withDelay(320, withTiming(0, { duration: 1 }));
    onComplete();
  }, [clearTicks, onComplete, onHoldChange, shown, fill]);

  const pressIn = useCallback(() => {
    fired.current = false;
    clearTicks();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onHoldChange?.(true);

    shown.value = withTiming(1, { duration: 120 });
    fill.value = 0;
    fill.value = withTiming(
      1,
      { duration: HOLD_MS, easing: Easing.linear },
      (done) => {
        if (done) runOnJS(finish)();
      }
    );

    TICKS.forEach((t) => {
      timers.current.push(
        setTimeout(() => {
          Haptics.selectionAsync().catch(() => {});
        }, HOLD_MS * t)
      );
    });
  }, [clearTicks, finish, onHoldChange, shown, fill]);

  const pressOut = useCallback(() => {
    clearTicks();
    if (fired.current) return;

    cancelAnimation(fill);
    // Быстрый откат: отпустили — значит передумали, тянуть незачем.
    shown.value = withTiming(0, { duration: 190 });
    fill.value = withTiming(0, { duration: 190 });
    onHoldChange?.(false);
  }, [clearTicks, onHoldChange, shown, fill]);

  const ringStyle = useAnimatedStyle(() => ({ opacity: shown.value }));

  // Стрелка отматывает назад вместе с дугой: значок сброса и должен
  // выглядеть как откручиваемое время.
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-fill.value * 180}deg` }, { scale: 1 - fill.value * 0.12 }],
  }));

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
    >
      {/* Тень на обёртке, а не на стекле: поверх материала она гасит
          преломление по кромке, ради которого стекло и берут. */}
      <View style={[styles.lift, disabled && styles.off]}>
        <GlassPane
          style={[styles.face, { width: size, height: size }]}
          radius={radius}
          scheme={scheme}
        >
          <Animated.View style={iconStyle}>
            <SymbolView name={icon} size={22} tintColor={iconColor} weight="medium" />
          </Animated.View>
        </GlassPane>
      </View>

      {/* Кольцо поверх тени: под ней оно теряло бы половину яркости */}
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { top: -RIM, left: -RIM, width: box, height: box }, ringStyle]}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={ring} style="stroke" strokeWidth={RING_W} color={trackColor} />
          <Path
            path={ring}
            style="stroke"
            strokeWidth={RING_W}
            strokeCap="round"
            color={ringColor}
            start={0}
            end={end}
          />
        </Canvas>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  lift: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  face: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  off: { opacity: 0.32 },
  ring: { position: 'absolute' },
});
