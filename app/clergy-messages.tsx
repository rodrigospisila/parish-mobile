import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useCommunity } from '../src/context/CommunityContext';
import {
  ClergyMessage,
  getClergyMessages,
  getAudienceLabel,
} from '../src/services/clergyMessageService';

/** Histórico completo da Palavra Pastoral, com leitura integral. */
export default function ClergyMessagesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { activeCommunityId } = useCommunity();
  const styles = createStyles(colors);

  const [messages, setMessages] = useState<ClergyMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      try {
        const { messages: items } = await getClergyMessages(50, activeCommunityId);
        setMessages(items);
      } catch (error) {
        console.error('Erro ao carregar a Palavra Pastoral:', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeCommunityId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>📜 Palavra Pastoral</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : messages.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome5 name="scroll" size={26} color={colors.textTertiary} />
            <Text style={styles.emptyText}>Nenhuma mensagem por aqui ainda.</Text>
          </View>
        ) : (
          messages.map((message) => {
            const expanded = expandedId === message.id;
            return (
              <TouchableOpacity
                key={message.id}
                style={styles.card}
                activeOpacity={0.85}
                onPress={() => setExpandedId(expanded ? null : message.id)}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={expanded ? undefined : 1}>
                    {message.title}
                  </Text>
                  <Text style={styles.cardDate}>
                    {new Date(message.publishedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {message.senderLabel || 'Palavra Pastoral'} · {getAudienceLabel(message)}
                </Text>
                <Text style={styles.cardBody} numberOfLines={expanded ? undefined : 3}>
                  {message.body ?? ''}
                </Text>
                <Text style={styles.cardToggle}>{expanded ? '▲ Recolher' : '▼ Ler completa'}</Text>
              </TouchableOpacity>
            );
          })
        )}
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
    scroll: { padding: 16, paddingBottom: 40, gap: 10 },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    cardTitle: { flex: 1, fontSize: 15.5, fontWeight: '700', color: colors.text },
    cardDate: { fontSize: 12, color: colors.textTertiary, fontWeight: '600' },
    cardMeta: { fontSize: 12, color: colors.textSecondary },
    cardBody: { fontSize: 14, color: colors.text, lineHeight: 21, marginTop: 4 },
    cardToggle: { fontSize: 12.5, fontWeight: '700', color: colors.primary, marginTop: 6 },
  });
