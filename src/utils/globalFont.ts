import React from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';

/**
 * Aplica a Nunito Sans globalmente preservando a hierarquia de peso.
 *
 * No React Native o `fontWeight` NÃO seleciona automaticamente a variante de uma
 * fonte custom carregada com nomes distintos. Por isso mapeamos o peso pedido
 * para a família correta da Nunito Sans e injetamos o `fontFamily` no <Text> e
 * <TextInput> — sem precisar tocar em cada tela. Estilos que já definem
 * `fontFamily` explicitamente são respeitados.
 */
const WEIGHT_TO_FAMILY: Record<string, string> = {
  '100': 'NunitoSans_400Regular',
  '200': 'NunitoSans_400Regular',
  '300': 'NunitoSans_400Regular',
  '400': 'NunitoSans_400Regular',
  normal: 'NunitoSans_400Regular',
  '500': 'NunitoSans_600SemiBold',
  '600': 'NunitoSans_600SemiBold',
  '700': 'NunitoSans_700Bold',
  bold: 'NunitoSans_700Bold',
  '800': 'NunitoSans_800ExtraBold',
  '900': 'NunitoSans_800ExtraBold',
};

function withFontFamily(style: unknown) {
  const flat = (StyleSheet.flatten(style as any) || {}) as { fontFamily?: string; fontWeight?: string | number };
  if (flat.fontFamily) return style; // respeita fontFamily explícito
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
  const family = WEIGHT_TO_FAMILY[weight] || 'NunitoSans_400Regular';
  // nossa família primeiro; o estilo original (que não tem fontFamily) vem depois
  return [{ fontFamily: family }, style as any];
}

let patched = false;

export function applyGlobalFont() {
  if (patched) return;
  patched = true;
  for (const Comp of [Text, TextInput] as any[]) {
    const original = Comp.render;
    if (typeof original !== 'function') continue;
    Comp.render = function patchedRender(...args: any[]) {
      const el = original.apply(this, args);
      if (!el || !React.isValidElement(el)) return el;
      const anyEl: any = el;
      return React.cloneElement(anyEl, { style: withFontFamily(anyEl.props.style) });
    };
  }
}
