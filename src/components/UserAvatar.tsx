import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import {
  avatarUrlFor,
  getAuthHeader,
  getAvatarVersion,
  onAvatarVersion,
} from '../services/avatarService';

/**
 * Avatar do usuário: mostra a foto de perfil quando existe e cai nas iniciais
 * quando não há foto (404) ou a imagem falha. Re-busca sozinho quando a foto
 * é trocada em qualquer tela (versão global do avatarService).
 */
export default function UserAvatar({
  userId,
  name,
  size = 44,
  style,
  textStyle,
}: {
  userId?: string | null;
  name?: string | null;
  size?: number;
  /** Estilo do círculo de fallback (cor de fundo etc.) */
  style?: ViewStyle;
  /** Estilo do texto das iniciais */
  textStyle?: TextStyle;
}) {
  const [version, setVersion] = useState(getAvatarVersion());
  const [failed, setFailed] = useState(false);
  const [headers, setHeaders] = useState<Record<string, string> | null>(null);

  useEffect(() => onAvatarVersion((v) => {
    setFailed(false);
    setVersion(v);
  }), []);

  useEffect(() => {
    let cancelled = false;
    void getAuthHeader().then((h) => {
      if (!cancelled) setHeaders(h);
    });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const initials = (() => {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  })();

  const base: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  if (!userId || failed || !headers) {
    return (
      <View style={[styles.fallback, base, style]}>
        <Text style={[styles.fallbackText, { fontSize: size * 0.38 }, textStyle]}>{initials}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.fallback, base, style]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.38 }, textStyle]}>{initials}</Text>
      <Image
        source={{ uri: avatarUrlFor(userId, version), headers }}
        style={StyleSheet.absoluteFillObject}
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: 'rgba(255,255,255,0.25)' },
  fallbackText: { color: '#fff', fontWeight: '800' },
});
