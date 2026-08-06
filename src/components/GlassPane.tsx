import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';

import { INK, type Scheme } from '../theme';

/**
 * Единственный источник стекла в приложении.
 *
 * Проверка доступности делается один раз при загрузке модуля: на iOS ниже 26
 * API нет, и вместо имитации блюром рисуется плотная подложка со светлой
 * кромкой — откровенно другая поверхность честнее плохой подделки.
 */
export const GLASS_AVAILABLE = isLiquidGlassAvailable();

export function GlassPane({
  children,
  style,
  radius,
  tint,
  dense,
  scheme,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius: number;
  /** Тинт фазы — так выделяется главное действие, а не сплошной заливкой */
  tint?: string;
  /** Плотный вариант материала: для элемента, который обязан читаться первым */
  dense?: boolean;
  /**
   * Стекло не следует теме телефона вслепую: в Deep Focus оно обязано быть
   * тёмным даже при светлой системной теме.
   */
  scheme: Scheme;
}) {
  if (GLASS_AVAILABLE) {
    // "clear" — прозрачный вариант материала. "regular" плотнее и на цветном
    // фоне съедает преломление, ради которого материал и берут.
    return (
      <GlassView
        glassEffectStyle={dense ? 'regular' : 'clear'}
        tintColor={tint}
        colorScheme={scheme}
        isInteractive
        style={[{ borderRadius: radius }, style]}
      >
        {children}
      </GlassView>
    );
  }

  const ink = INK[scheme];
  return (
    <View
      style={[
        { borderRadius: radius },
        {
          backgroundColor: tint ?? ink.fallback,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: ink.fallbackEdge,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
