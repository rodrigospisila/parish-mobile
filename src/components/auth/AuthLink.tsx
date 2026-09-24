import React from 'react';
import { StyleSheet, Text, TouchableOpacity, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useAuthPalette } from './authPalette';

export type AuthLinkProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Estilo da área de toque (alinhamento, margens) */
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  /** "link" (padrão) para navegação/site; "button" para ações na própria tela */
  accessibilityRole?: 'link' | 'button';
  accessibilityHint?: string;
};

/** Link de texto com alvo de toque ≥ 44pt */
export function AuthLink({
  label,
  onPress,
  disabled = false,
  style,
  textStyle,
  accessibilityRole = 'link',
  accessibilityHint,
}: AuthLinkProps) {
  const { palette } = useAuthPalette();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
      style={[styles.touch, style]}
    >
      <Text style={[styles.text, { color: palette.link }, textStyle]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touch: {
    minHeight: 44,
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    fontWeight: '600',
  },
});

export default AuthLink;
