import React, { useEffect, useMemo } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Canvas, Circle, RadialGradient, vec, BlurMask } from '@shopify/react-native-skia';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * Слой 0 — живой холст.
 *
 * Несколько размытых цветных пятен, медленно дрейфующих по экрану. Это
 * единственное, что даёт Liquid Glass смысл: без движущегося цвета под ним
 * стекло читается как обычная серая панель.
 */

type BlobSpec = {
  color: string;
  /** Доли ширины/высоты экрана: откуда и куда дрейфует центр */
  from: [number, number];
  to: [number, number];
  /** Радиус в долях ширины экрана */
  radius: number;
  /** Сдвиг фазы, чтобы пятна не двигались синхронно */
  phase: number;
  opacity: number;
};

// Пятна намеренно прижаты к верхнему и нижнему краям: стекло живёт именно
// там (чип и док), а без света под собой оно вырождается в серую плашку.
const LAYOUT: Omit<BlobSpec, 'color'>[] = [
  { from: [0.14, 0.04], to: [0.58, 0.24], radius: 0.82, phase: 0, opacity: 0.95 },
  { from: [0.92, 0.36], to: [0.48, 0.58], radius: 0.68, phase: 1.7, opacity: 0.8 },
  { from: [0.2, 0.92], to: [0.82, 1.0], radius: 0.78, phase: 3.4, opacity: 0.9 },
];

function Blob({ spec, W, H, t }: { spec: BlobSpec; W: number; H: number; t: { value: number } }) {
  const r = spec.radius * W;

  const cx = useDerivedValue(() => {
    const k = 0.5 + 0.5 * Math.sin(t.value * Math.PI * 2 + spec.phase);
    return (spec.from[0] + (spec.to[0] - spec.from[0]) * k) * W;
  });

  const cy = useDerivedValue(() => {
    const k = 0.5 + 0.5 * Math.sin(t.value * Math.PI * 2 + spec.phase + 0.9);
    return (spec.from[1] + (spec.to[1] - spec.from[1]) * k) * H;
  });

  const center = useDerivedValue(() => vec(cx.value, cy.value));

  return (
    <Circle cx={cx} cy={cy} r={r} opacity={spec.opacity}>
      <RadialGradient c={center} r={r} colors={[spec.color, `${spec.color}00`]} />
      <BlurMask blur={70} style="normal" />
    </Circle>
  );
}

export function AmbientCanvas({
  colors,
  opacity = 1,
}: {
  colors: [string, string, string];
  opacity?: number;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const t = useSharedValue(0);

  useEffect(() => {
    // Один общий драйвер: пятна расходятся за счёт сдвига фазы, а не отдельных таймеров.
    t.value = withRepeat(
      withTiming(1, { duration: 26000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [t]);

  const blobs = useMemo<BlobSpec[]>(
    () => LAYOUT.map((l, i) => ({ ...l, color: colors[i] ?? colors[0] })),
    [colors]
  );

  return (
    <Canvas style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {blobs.map((spec, i) => (
        <Blob key={i} spec={spec} W={W} H={H} t={t} />
      ))}
    </Canvas>
  );
}
