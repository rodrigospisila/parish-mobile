import React, { useCallback, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthPalette } from './authPalette';

export type AuthErrorBoxProps = {
  /** Texto da caixa; vazio/nulo não desenha nada */
  message?: string | null;
  /** "error" (padrão) em vermelho; "info" em azul, para avisos de sucesso ("Código enviado…") */
  tone?: 'error' | 'info';
  style?: StyleProp<ViewStyle>;
  /** Conteúdo extra abaixo do texto (ex.: um link de ação) */
  children?: React.ReactNode;
};

/** Caixa de erro (ou aviso) dentro do cartão, no lugar do Alert */
export function AuthErrorBox({ message, tone = 'error', style, children }: AuthErrorBoxProps) {
  const { colors, palette } = useAuthPalette();
  if (!message) return null;
  const color = tone === 'error' ? palette.error : palette.link;
  return (
    <View
      style={[
        styles.box,
        tone === 'error'
          ? { backgroundColor: color + '14', borderColor: color + '55' }
          : { backgroundColor: colors.highlightLight, borderColor: color + '55' },
        style,
      ]}
    >
      <FontAwesome5
        name={tone === 'error' ? 'exclamation-circle' : 'info-circle'}
        size={14}
        color={color}
        solid
      />
      <View style={styles.content}>
        <Text style={[styles.text, { color: tone === 'error' ? color : colors.text }]}>{message}</Text>
        {children}
      </View>
    </View>
  );
}

/**
 * Mensagem de erro da tela com anúncio ao leitor de tela — VoiceOver/TalkBack
 * não leem sozinhos uma caixa que acabou de aparecer.
 * Devolve [mensagem, mostrar(mensagem), limpar()].
 */
export function useAnnouncedError() {
  const [message, setMessage] = useState('');
  const show = useCallback((next: string) => {
    setMessage(next);
    if (next) AccessibilityInfo.announceForAccessibility(next);
  }, []);
  const clear = useCallback(() => setMessage(''), []);
  return [message, show, clear] as const;
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 15,
    lineHeight: 20,
  },
});

export default AuthErrorBox;
