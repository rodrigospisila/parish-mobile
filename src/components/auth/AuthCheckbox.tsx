import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthPalette } from './authPalette';

export type AuthCheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Destaca a caixa em vermelho (ex.: tentou continuar sem marcar) */
  invalid?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Caixa de seleção grande (alvo ≥ 44pt) com o texto ao lado */
export function AuthCheckbox({ checked, onChange, label, invalid = false, disabled = false, style }: AuthCheckboxProps) {
  const { colors, palette } = useAuthPalette();
  const borderColor = invalid && !checked ? palette.error : checked ? palette.link : palette.fieldBorder;
  return (
    <TouchableOpacity
      style={[styles.row, style]}
      onPress={() => onChange(!checked)}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.box,
          { borderColor, backgroundColor: checked ? palette.link : palette.fieldBackground },
        ]}
      >
        {checked && <FontAwesome5 name="check" size={14} color={colors.textInverse} solid />}
      </View>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 44,
    paddingVertical: 4,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
  },
});

export default AuthCheckbox;
