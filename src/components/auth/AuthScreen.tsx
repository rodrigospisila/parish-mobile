import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { AuthHero, type AuthHeroProps } from './AuthHero';
import { useAuthPalette, type AuthColors, type AuthPalette } from './authPalette';
import { useCompactHero } from './useCompactHero';

export type AuthScreenProps = Omit<AuthHeroProps, 'compact'> & {
  /** Força o cabeçalho compacto; se omitido, usa useCompactHero() (teclado aberto ou fonte grande) */
  compact?: boolean;
  children: React.ReactNode;
};

/**
 * Esqueleto das telas de acesso: cabeçalho em degradê com a logo, conteúdo
 * sobreposto e rolagem que acompanha o teclado.
 */
export function AuthScreen({ compact, children, ...hero }: AuthScreenProps) {
  const { colors } = useAuthPalette();
  const insets = useSafeAreaInsets();
  const autoCompact = useCompactHero();
  const compactHero = compact ?? autoCompact;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <AuthHero {...hero} compact={compactHero} />
        <View style={styles.body}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export type AuthCardProps = {
  /** Título do cartão (anunciado como cabeçalho) */
  title: string;
  subtitle?: React.ReactNode;
  /** Ícone FontAwesome5 num círculo acima do título */
  icon?: string;
  /** Texto pequeno acima do título (ex.: "Passo 1 de 3") */
  eyebrow?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Cartão branco sobreposto ao cabeçalho, com título e subtítulo */
export function AuthCard({ title, subtitle, icon, eyebrow, children, style }: AuthCardProps) {
  const { colors, palette } = useAuthPalette();
  const styles = cardStyles(colors, palette);
  return (
    <View style={[styles.card, style]}>
      {icon && (
        <View style={styles.stepIcon}>
          <FontAwesome5 name={icon} size={18} color={palette.link} solid />
        </View>
      )}
      {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
      <Text style={styles.cardTitle} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : <View style={styles.noSubtitle} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  body: {
    paddingHorizontal: 20,
    marginTop: -40,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },
});

const cardStyles = (colors: AuthColors, palette: AuthPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 22,
      shadowColor: '#0B1C2C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 6,
    },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlightLight,
      marginBottom: 12,
    },
    eyebrow: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: palette.link,
      marginBottom: 4,
    },
    cardTitle: {
      fontSize: 21,
      fontWeight: '700',
      color: colors.text,
    },
    cardSubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 21,
      marginTop: 4,
      marginBottom: 18,
    },
    noSubtitle: {
      height: 18,
    },
  });

export default AuthScreen;
