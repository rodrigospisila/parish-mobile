import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import CommunitySelector from '../src/components/CommunitySelector';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';

export default function SelectCommunityScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);
  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Selecione sua Comunidade', headerShown: false }} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <FontAwesome5 name="church" size={26} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>{firstName ? `Bem-vindo(a), ${firstName}!` : 'Bem-vindo(a)!'}</Text>
          <Text style={styles.heroSubtitle}>Vamos configurar sua conta. Selecione onde você participa.</Text>
        </LinearGradient>

        <CommunitySelector requireConsent submitLabel="Salvar e continuar" />

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={12} color={colors.textTertiary} />
          <Text style={styles.footerHint}>Você pode alterar isso depois em Perfil.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, padding: 20, paddingTop: 16 },
    hero: {
      borderRadius: 20,
      paddingVertical: 28,
      paddingHorizontal: 22,
      alignItems: 'center',
      marginBottom: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
    },
    heroTitle: { fontSize: 24, fontWeight: '800', color: '#fff', textAlign: 'center' },
    heroSubtitle: {
      fontSize: 14.5,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
    },
    footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18 },
    footerHint: { fontSize: 12.5, color: colors.textTertiary, textAlign: 'center' },
  });
