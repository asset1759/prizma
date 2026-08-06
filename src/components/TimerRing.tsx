import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, LinearGradient, Path, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Слой 1 — содержимое.
 *
 * Кольцо лежит прямо на холсте, без стеклянной подложки: стекло на стекле
 * даёт мутную кашу, а стекло под тонкой дугой съедает её контраст.
 */

export const RING_SIZE = 232;
// Толстое кольцо: тонкая дуга на цветном фоне теряется, а здесь она —
// единственный носитель прогресса, цифры его не дублируют.
const STROKE = 16;

export function TimerRing({
  progress,
  accent,
  accentHi,
  track,
  children,
}: {
  /** 0 → 1, доля пройденного времени */
  progress: SharedValue<number>;
  accent: string;
  accentHi: string;
  /** Дорожка под дугой — своя в светлой и тёмной теме */
  track: string;
  children?: React.ReactNode;
}) {
  // Дуга начинается на 12 часах и идёт по часовой стрелке.
  const path = useMemo(() => {
    const inset = STROKE / 2;
    return Skia.PathBuilder.Make()
      .addArc(
        {
          x: inset,
          y: inset,
          width: RING_SIZE - STROKE,
          height: RING_SIZE - STROKE,
        },
        -90,
        360
      )
      .detach();
  }, []);

  const end = useDerivedValue(() => Math.min(1, Math.max(0, progress.value)));

  return (
    <View style={styles.wrap}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path
          path={path}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          color={track}
        />
        <Path
          path={path}
          style="stroke"
          strokeWidth={STROKE}
          strokeCap="round"
          start={0}
          end={end}
        >
          <LinearGradient
            start={vec(0, 0)}
            end={vec(RING_SIZE, RING_SIZE)}
            colors={[accentHi, accent]}
          />
        </Path>
      </Canvas>
      <View style={styles.face} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: RING_SIZE,
    height: RING_SIZE,
  },
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
});
