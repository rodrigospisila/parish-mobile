import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import CommunitySelector from '../src/components/CommunitySelector';
import { useColors } from '../src/context/ThemeContext';
import { useCommunity } from '../src/context/CommunityContext';
import { addMyCommunity } from '../src/services/memberCommunitiesService';

/** Vincula uma comunidade SECUNDÁRIA (multi-comunidade, Fase 3). */
export default function LinkCommunityScreen() {
  const router = useRouter();
  const colors = useColors();
  const { refreshLinks } = useCommunity();
  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vincular comunidade</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Sua comunidade principal continua a mesma. O vínculo secundário permite acompanhar a
          agenda dessa comunidade e servir nas pastorais dela — você fica visível para os
          coordenadores de lá.
        </Text>

        <CommunitySelector
          submitLabel="Vincular comunidade"
          requireConsent
          onSubmit={async (communityId) => {
            await addMyCommunity(communityId);
            await refreshLinks();
            Alert.alert('Comunidade vinculada ✓', 'Você já pode alternar para ela na tela inicial.');
          }}
          onSaved={() => router.back()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    scroll: { padding: 20 },
    intro: { fontSize: 14, color: colors.textSecondary, marginBottom: 16, lineHeight: 20 },
  });
