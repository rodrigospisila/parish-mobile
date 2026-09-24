import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontAwesome5 } from '@expo/vector-icons';
import { HERO_GRADIENT } from './authPalette';

const LOGO = require('../../../assets/images/logo-mark.png');

export type AuthHeroProps = {
  /** Texto grande abaixo da logo (padrão: "Parish") */
  title?: string;
  /** Frase curta abaixo do título — some no modo compacto */
  subtitle?: string;
  /** Logo e título menores (teclado aberto ou fonte grande) — ver useCompactHero() */
  compact?: boolean;
  /** Mostra o botão "Voltar" no canto do cabeçalho */
  onBack?: () => void;
  /** Rótulo do botão de voltar para o leitor de tela (padrão: "Voltar") */
  backLabel?: string;
};

/** Cabeçalho em degradê da marca, com a logo; o cartão da tela se sobrepõe à parte de baixo */
export function AuthHero({ title = 'Parish', subtitle, compact = false, onBack, backLabel = 'Voltar' }: AuthHeroProps) {
  const insets = useSafeAreaInsets();
  return (
    <LinearGradient
      colors={HERO_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, compact && styles.heroCompact, { paddingTop: insets.top + (compact ? 16 : 32) }]}
    >
      {onBack && (
        <TouchableOpacity
          onPress={onBack}
          style={[styles.back, { top: insets.top + 8 }]}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
        >
          <FontAwesome5 name="arrow-left" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}
      <Image
        source={LOGO}
        style={compact ? styles.logoCompact : styles.logo}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <Text style={[styles.brand, compact && styles.brandCompact]} maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {!compact && !!subtitle && (
        <Text style={styles.tagline} maxFontSizeMultiplier={1.5}>
          {subtitle}
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 64,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroCompact: {
    paddingBottom: 52,
  },
  back: {
    position: 'absolute',
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 1,
  },
  logo: {
    width: 92,
    height: 92,
  },
  logoCompact: {
    width: 52,
    height: 52,
  },
  brand: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginTop: 10,
  },
  brandCompact: {
    fontSize: 22,
    marginTop: 4,
  },
  tagline: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default AuthHero;
