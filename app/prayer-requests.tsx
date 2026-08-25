import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useCommunity } from '../src/context/CommunityContext';
import {
  PrayerRequest,
  PrayerCategory,
  PRAYER_CATEGORY_LABELS,
  getApprovedPrayerRequests,
  createPrayerRequest,
  prayForRequest,
} from '../src/services/prayerRequestService';

const CATEGORIES = Object.keys(PRAYER_CATEGORY_LABELS) as PrayerCategory[];

/** Mural de oração: pedidos aprovados da comunidade + envio de novo pedido. */
export default function PrayerRequestsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { activeCommunityId } = useCommunity();
  const styles = createStyles(colors);

  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // ids pelos quais já rezei NESTA visita — evita spam de toques no contador
  const [prayed, setPrayed] = useState<Record<string, boolean>>({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'OTHER' as PrayerCategory,
    isAnonymous: false,
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      try {
        const items = await getApprovedPrayerRequests(activeCommunityId);
        setRequests(items);
      } catch (error) {
        console.error('Erro ao carregar pedidos de oração:', error);
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

  const handlePray = async (request: PrayerRequest) => {
    if (prayed[request.id]) return;
    setPrayed((current) => ({ ...current, [request.id]: true }));
    setRequests((current) =>
      current.map((item) =>
        item.id === request.id ? { ...item, prayerCount: item.prayerCount + 1 } : item,
      ),
    );
    try {
      const count = await prayForRequest(request.id);
      if (count > 0) {
        setRequests((current) =>
          current.map((item) => (item.id === request.id ? { ...item, prayerCount: count } : item)),
        );
      }
    } catch (error: any) {
      // Reverte o otimismo — o toque não foi registrado (offline, pedido removido...)
      setPrayed((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id ? { ...item, prayerCount: Math.max(0, item.prayerCount - 1) } : item,
        ),
      );
      Alert.alert('Oração', error?.message ?? 'Não foi possível registrar agora. Tente novamente.');
    }
  };

  const handleSubmit = async () => {
    if (form.title.trim().length < 3) {
      Alert.alert('Pedido de oração', 'Dê um título curto ao pedido.');
      return;
    }
    if (form.description.trim().length < 5) {
      Alert.alert('Pedido de oração', 'Descreva o pedido em poucas palavras.');
      return;
    }
    if (!activeCommunityId) {
      Alert.alert('Pedido de oração', 'Vincule-se a uma comunidade para enviar.');
      return;
    }
    setSubmitting(true);
    try {
      await createPrayerRequest({
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        isAnonymous: form.isAnonymous,
        communityId: activeCommunityId,
      });
      setShowForm(false);
      setForm({ title: '', description: '', category: 'OTHER', isAnonymous: false });
      Alert.alert(
        'Pedido enviado 🙏',
        'A coordenação vai aprovar e seu pedido aparece no mural para a comunidade rezar junto.',
      );
    } catch (error: any) {
      Alert.alert('Não foi possível enviar', error?.message ?? 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🙏 Mural de oração</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowForm(true)}>
          <Text style={styles.newBtnText}>+ Fazer um pedido de oração</Text>
        </TouchableOpacity>

        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : requests.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome5 name="praying-hands" size={26} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              Nenhum pedido no mural ainda — seja quem começa a corrente de oração.
            </Text>
          </View>
        ) : (
          requests.map((request) => (
            <View key={request.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle}>{request.title}</Text>
                <Text style={styles.cardCategory}>
                  {PRAYER_CATEGORY_LABELS[request.category] ?? request.category}
                </Text>
              </View>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {request.isAnonymous ? 'Pedido anônimo' : request.member?.fullName ?? 'Comunidade'} ·{' '}
                {new Date(request.createdAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                })}
              </Text>
              <Text style={styles.cardBody}>{request.description}</Text>
              <TouchableOpacity
                style={[styles.prayBtn, prayed[request.id] && styles.prayBtnDone]}
                onPress={() => void handlePray(request)}
                disabled={!!prayed[request.id]}
              >
                <Text style={[styles.prayBtnText, prayed[request.id] && styles.prayBtnTextDone]}>
                  {prayed[request.id] ? '✓ Você rezou' : '🙏 Rezei por isso'} · {request.prayerCount}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={showForm} transparent animationType="fade" onRequestClose={() => setShowForm(false)}>
        <Pressable style={styles.overlay} onPress={() => !submitting && setShowForm(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <Text style={styles.sheetTitle}>Novo pedido de oração</Text>
              <TextInput
                style={styles.input}
                placeholder="Título (ex.: Pela saúde da minha mãe)"
                placeholderTextColor={colors.textTertiary}
                maxLength={80}
                value={form.title}
                onChangeText={(title) => setForm({ ...form, title })}
              />
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Conte em poucas palavras pelo que rezar"
                placeholderTextColor={colors.textTertiary}
                maxLength={500}
                multiline
                value={form.description}
                onChangeText={(description) => setForm({ ...form, description })}
              />
              <View style={styles.categoryRow}>
                {CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[styles.categoryChip, form.category === category && styles.categoryChipOn]}
                    onPress={() => setForm({ ...form, category })}
                  >
                    <Text
                      style={[styles.categoryChipText, form.category === category && styles.categoryChipTextOn]}
                    >
                      {PRAYER_CATEGORY_LABELS[category]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.anonRow}
                onPress={() => setForm({ ...form, isAnonymous: !form.isAnonymous })}
              >
                <FontAwesome5
                  name={form.isAnonymous ? 'check-square' : 'square'}
                  size={18}
                  color={form.isAnonymous ? colors.primary : colors.textTertiary}
                />
                <Text style={styles.anonText}>Manter meu nome anônimo no mural</Text>
              </TouchableOpacity>
              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  disabled={submitting}
                  onPress={() => setShowForm(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} disabled={submitting} onPress={() => void handleSubmit()}>
                  <Text style={styles.submitBtnText}>{submitting ? 'Enviando...' : 'Enviar pedido'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
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
    newBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    newBtnText: { color: '#fff', fontWeight: '800', fontSize: 14.5 },
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
    cardCategory: { fontSize: 11.5, fontWeight: '700', color: colors.primary },
    cardMeta: { fontSize: 12, color: colors.textSecondary },
    cardBody: { fontSize: 14, color: colors.text, lineHeight: 21, marginTop: 4 },
    prayBtn: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 7,
      marginTop: 8,
    },
    prayBtnDone: { borderColor: colors.border, backgroundColor: colors.surface },
    prayBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    prayBtnTextDone: { color: colors.textSecondary },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      gap: 10,
    },
    sheetTitle: { fontSize: 16.5, fontWeight: '800', color: colors.text },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14.5,
      color: colors.text,
      backgroundColor: colors.surface,
    },
    inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    categoryChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    categoryChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
    categoryChipText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600' },
    categoryChipTextOn: { color: colors.primary },
    anonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
    anonText: { fontSize: 13.5, color: colors.text },
    sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
    cancelBtn: { paddingHorizontal: 14, paddingVertical: 10 },
    cancelBtnText: { color: colors.textSecondary, fontWeight: '700' },
    submitBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    submitBtnText: { color: '#fff', fontWeight: '800' },
  });
