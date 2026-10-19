import React, { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useEntitlements } from '../context/EntitlementsContext';
import { canCoordinateSchedules } from '../utils/pastoralCoordination';

/**
 * Estado calmo de recurso fora do plano da comunidade (no lugar de Alert de
 * erro ou lista vazia que parece "não há nada"). Sem preço, sem link de
 * compra e sem falar em pagamento: a contratação é da paróquia, pela web
 * (regras das lojas — o fiel nunca paga).
 *
 * `refreshable`: puxar para atualizar reconsulta o plano e a tela tenta de
 * novo (plano ativado na paróquia aparece sem reiniciar o app). Não usar
 * dentro de outra ScrollView.
 */
export default function PlanLockedState({ title, refreshable = false }: { title?: string; refreshable?: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const { refresh } = useEntitlements();
  const [refreshing, setRefreshing] = useState(false);
  const manages = canCoordinateSchedules(user);

  const content = (
    <View style={styles.container} accessible accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Ionicons name="leaf-outline" size={30} color={colors.primary} />
      </View>
      {title ? <Text style={styles.kicker}>{title}</Text> : null}
      <Text style={styles.title}>Este recurso não está ativo na sua comunidade</Text>
      <Text style={styles.body}>
        {manages
          ? 'A administração da paróquia pode ativá-lo pelo painel do Parish. Calendário, horários, liturgia e avisos continuam funcionando normalmente.'
          : 'Calendário, horários de missa, liturgia e avisos da paróquia continuam funcionando normalmente.'}
      </Text>
    </View>
  );

  if (!refreshable) return content;

  const onRefresh = () => {
    setRefreshing(true);
    refresh().finally(() => setRefreshing(false));
  };

  return (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {content}
    </ScrollView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 40 },
    iconWrap: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + '1A',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    kicker: { fontSize: 13, fontWeight: '700', color: colors.textTertiary, marginBottom: 6, textTransform: 'uppercase' },
    title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center', marginBottom: 8 },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary, textAlign: 'center' },
  });

/**
 * Tela inteira de recurso fora do plano (telas empilhadas, sem tab bar):
 * cabeçalho com "Voltar" + o estado calmo.
 */
export function PlanLockedScreen({ title }: { title: string }) {
  const colors = useColors();
  const styles = createScreenStyles(colors);
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)' as never))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
        >
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerBtn} />
      </View>
      <PlanLockedState refreshable />
    </SafeAreaView>
  );
}

const createScreenStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.text },
  });
