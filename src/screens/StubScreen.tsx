import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SFSymbol } from 'expo-symbols';

import { INK, SERIF_BOLD, type Scheme } from '../theme';

/**
 * Заглушка под вкладки, которых ещё нет. Существует, чтобы оболочка с
 * навигацией работала целиком уже сейчас, а экраны нарастали по одному.
 */
export function StubScreen({
  title,
  hint,
  icon,
  scheme,
}: {
  title: string;
  hint: string;
  icon: SFSymbol;
  scheme: Scheme;
}) {
  const ink = INK[scheme];
  return (
    <View style={styles.root}>
      <SymbolView name={icon} size={40} tintColor={ink.tertiary} weight="light" />
      <Text style={[styles.title, { color: ink.primary }]}>{title}</Text>
      <Text style={[styles.hint, { color: ink.secondary }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 44,
    gap: 14,
  },
  title: { fontSize: 30, fontFamily: SERIF_BOLD, letterSpacing: -0.5 },
  hint: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
