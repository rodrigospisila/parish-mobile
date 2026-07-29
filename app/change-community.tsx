import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import CommunitySelector from '../src/components/CommunitySelector';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';

export default function ChangeCommunityScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trocar comunidade</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Selecione a diocese, paróquia e comunidade que você passa a frequentar.
        </Text>

        <CommunitySelector
          submitLabel="Salvar alterações"
          initialDioceseId={user?.dioceseId}
          initialParishId={user?.parishId}
          initialCommunityId={user?.communityId}
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
