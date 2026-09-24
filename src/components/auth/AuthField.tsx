import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthPalette, type AuthColors, type AuthPalette } from './authPalette';

export type AuthFieldProps = TextInputProps & {
  /** Rótulo acima do campo (também é o nome lido pelo leitor de tela) */
  label: string;
  /** Ícone FontAwesome5 à esquerda (ex.: "envelope", "lock") */
  icon: string;
  /** Ação à direita do campo (ex.: limpar, mostrar senha) */
  right?: React.ReactNode;
  inputRef?: React.Ref<TextInput>;
  /** Campo de senha com o botão de olho para mostrar/ocultar o que foi digitado */
  secureToggle?: boolean;
  /** Dica curta abaixo do campo (ex.: "Pelo menos 8 letras ou números") */
  hint?: string;
  /** Estilo do bloco externo (rótulo + campo + dica) */
  containerStyle?: StyleProp<ViewStyle>;
};

/** Campo com rótulo, ícone à esquerda e borda de foco */
export function AuthField({
  label,
  icon,
  right,
  inputRef,
  secureToggle = false,
  hint,
  containerStyle,
  style,
  onFocus,
  onBlur,
  secureTextEntry,
  ...input
}: AuthFieldProps) {
  const { colors, palette } = useAuthPalette();
  const [focused, setFocused] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const styles = fieldStyles(colors, palette);

  return (
    <View style={[styles.container, containerStyle]}>
      {/* O leitor de tela já lê o rótulo pelo próprio campo */}
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <FontAwesome5
          name={icon}
          size={15}
          solid
          color={focused ? palette.link : colors.textTertiary}
          style={styles.icon}
        />
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          placeholderTextColor={palette.placeholder}
          accessibilityLabel={label}
          accessibilityHint={hint}
          secureTextEntry={secureToggle ? !showSecret : secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {secureToggle && (
          <TouchableOpacity
            onPress={() => setShowSecret((value) => !value)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={showSecret ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <FontAwesome5 name={showSecret ? 'eye-slash' : 'eye'} size={17} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
        {right}
      </View>
      {!!hint && (
        <Text style={styles.hint} importantForAccessibility="no" accessibilityElementsHidden>
          {hint}
        </Text>
      )}
    </View>
  );
}

const fieldStyles = (colors: AuthColors, palette: AuthPalette) =>
  StyleSheet.create({
    container: {
      marginBottom: 14,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      backgroundColor: palette.fieldBackground,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    boxFocused: {
      borderColor: palette.link,
      borderWidth: 2,
      backgroundColor: colors.card,
    },
    icon: {
      width: 20,
      marginRight: 10,
      textAlign: 'center',
    },
    input: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    eyeButton: {
      paddingLeft: 12,
      paddingVertical: 10,
    },
    hint: {
      fontSize: 14,
      lineHeight: 19,
      color: colors.textSecondary,
      marginTop: 6,
    },
  });

export default AuthField;
