import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SLOW_REQUEST_MS, useAuthPalette, type AuthColors, type AuthPalette } from './authPalette';

export type AuthButtonProps = {
  label: string;
  onPress: () => void;
  /** "primary" (padrão, cheio na cor da marca) ou "secondary" (contorno, ex.: Voltar) */
  variant?: 'primary' | 'secondary';
  /** Mostra o carregamento e bloqueia novos toques */
  loading?: boolean;
  /** Texto durante o carregamento (ex.: "Entrando…"); padrão = label */
  busyLabel?: string;
  /** Texto quando o servidor demora (padrão: "Ainda conectando…") */
  slowLabel?: string;
  /** Tempo até trocar para slowLabel (padrão: 8 s) */
  slowAfterMs?: number;
  disabled?: boolean;
  /** Ícone FontAwesome5 opcional antes do texto */
  icon?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

/** Botão das telas de acesso: primário com "…ando" e aviso de servidor lento, ou secundário */
export function AuthButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  busyLabel,
  slowLabel = 'Ainda conectando…',
  slowAfterMs = SLOW_REQUEST_MS,
  disabled = false,
  icon,
  accessibilityHint,
  style,
}: AuthButtonProps) {
  const { colors, palette } = useAuthPalette();
  const [isSlow, setIsSlow] = useState(false);
  const styles = buttonStyles(colors, palette);
  const primary = variant === 'primary';
  const busyText = busyLabel ?? label;

  // Aviso de "ainda conectando" quando o servidor demora a responder
  useEffect(() => {
    if (!loading) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), slowAfterMs);
    return () => clearTimeout(timer);
  }, [loading, slowAfterMs]);

  const textStyle = primary ? styles.primaryText : styles.secondaryText;
  const contentColor = primary ? colors.textInverse : colors.text;

  return (
    <TouchableOpacity
      style={[
        primary ? styles.primary : styles.secondary,
        loading && styles.busy,
        disabled && !loading && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={loading || disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={loading ? busyText : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
    >
      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator color={contentColor} />
          <Text style={textStyle}>{isSlow ? slowLabel : busyText}</Text>
        </View>
      ) : icon ? (
        <View style={styles.row}>
          <FontAwesome5 name={icon} size={15} color={contentColor} solid />
          <Text style={textStyle}>{label}</Text>
        </View>
      ) : (
        <Text style={textStyle}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

const buttonStyles = (colors: AuthColors, palette: AuthPalette) =>
  StyleSheet.create({
    primary: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    secondary: {
      borderRadius: 12,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
    },
    // Carregando: mantém a cor da marca (spinner branco sobre cinza some)
    busy: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    primaryText: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
  });

export default AuthButton;
