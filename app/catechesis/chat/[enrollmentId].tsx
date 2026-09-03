import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../../src/context/ThemeContext';
import {
  CatechesisChatThread,
  getEnrollmentMessages,
  sendEnrollmentMessage,
} from '../../../src/services/catechesisService';

/**
 * Conversa família ↔ equipe da turma (Onda 4). Um fio por matrícula; só os
 * responsáveis e a equipe leem. Atualiza sozinha enquanto a tela está aberta.
 */
export default function CatechesisChatScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>();

  const [thread, setThread] = useState<CatechesisChatThread | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  // Só a resposta da ÚLTIMA carga vale; e uma carga em voo não apaga o que
  // acabou de ser enviado (merge por id)
  const loadSeq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!enrollmentId) return;
      const seq = ++loadSeq.current;
      if (!silent) setIsLoading(true);
      try {
        const data = await getEnrollmentMessages(enrollmentId);
        if (seq !== loadSeq.current) return;
        setThread((prev) => {
          if (!prev) return data;
          const known = new Set(data.messages.map((m) => m.id));
          const extra = prev.messages.filter((m) => !known.has(m.id));
          return { ...data, messages: [...data.messages, ...extra] };
        });
      } catch (error: any) {
        if (!silent) Alert.alert('Conversa', error?.message ?? 'Não foi possível abrir a conversa.');
      } finally {
        setIsLoading(false);
      }
    },
    [enrollmentId],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
      // Sem websocket: atualiza a cada 20s enquanto a conversa está aberta
      const timer = setInterval(() => void load(true), 20000);
      return () => clearInterval(timer);
    }, [load]),
  );

  useEffect(() => {
    if (thread?.messages.length) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [thread?.messages.length]);

  const handleSend = async () => {
    const body = text.trim();
    if (!body || !enrollmentId) return;
    setSending(true);
    try {
      const message = await sendEnrollmentMessage(enrollmentId, body);
      setThread((current) =>
        current && !current.messages.some((m) => m.id === message.id)
          ? { ...current, messages: [...current.messages, message] }
          : current,
      );
      setText('');
    } catch (error: any) {
      Alert.alert('Não enviada', error?.message ?? 'Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  const title = thread ? (thread.isTeam ? `💬 ${thread.student}` : `💬 ${thread.className}`) : '💬 Conversa';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {thread && (
            <Text style={styles.headerSub} numberOfLines={1}>
              {thread.isTeam ? `Família · ${thread.className}` : `Equipe da turma · ${thread.student}`}
            </Text>
          )}
        </View>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
          ) : !thread ? (
            <Text style={styles.emptyText}>Não foi possível abrir a conversa.</Text>
          ) : (
            <>
              <Text style={styles.privacyNote}>
                🔒 Só a família e a equipe da turma leem esta conversa. Tudo fica registrado.
              </Text>
              {thread.messages.length === 0 && (
                <Text style={styles.emptyText}>Nenhuma mensagem ainda — escreva a primeira.</Text>
              )}
              {thread.messages.map((message) => {
                // Conversa de dois lados (família ↔ equipe): alinha pelo LADO —
                // mensagem de outra pessoa do meu lado também fica à direita
                const ownSide = message.fromTeam === thread.isTeam;
                const read = !!message.readAt;
                const delivered = !!message.deliveredAt;
                return (
                  <View key={message.id} style={[styles.row, ownSide ? styles.rowMine : styles.rowOther]}>
                    <View style={[styles.bubble, ownSide ? styles.bubbleMine : styles.bubbleOther]}>
                      {!message.mine && (
                        <Text style={[styles.author, ownSide && styles.authorMine]}>
                          {message.fromTeam ? `Equipe · ${message.authorName}` : `Família · ${message.authorName}`}
                        </Text>
                      )}
                      <Text style={[styles.body, ownSide && styles.bodyMine]}>{message.body}</Text>
                      <View style={styles.foot}>
                        <Text style={[styles.time, ownSide && styles.timeMine]}>
                          {new Date(message.createdAt).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                        {ownSide && (
                          <Text
                            style={[styles.ticks, read && styles.ticksRead]}
                            accessibilityLabel={read ? 'Lida' : delivered ? 'Entregue' : 'Enviada'}
                          >
                            {read || delivered ? '✓✓' : '✓'}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </ScrollView>

        {thread && thread.canWrite ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.input}
              placeholder={thread.isTeam ? 'Escreva para a família...' : 'Escreva para a catequista...'}
              placeholderTextColor={colors.textTertiary}
              value={text}
              onChangeText={setText}
              maxLength={1000}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnOff]}
              disabled={!text.trim() || sending}
              onPress={() => void handleSend()}
            >
              <FontAwesome5 name="paper-plane" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : thread ? (
          <Text style={styles.readOnly}>Matrícula encerrada — conversa somente para leitura.</Text>
        ) : null}
      </KeyboardAvoidingView>
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
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    headerBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
    headerSub: { fontSize: 11.5, color: colors.textSecondary },
    scroll: { padding: 14, paddingBottom: 20, gap: 8 },
    privacyNote: { fontSize: 11.5, color: colors.textTertiary, textAlign: 'center', marginBottom: 6 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginTop: 24 },
    row: { flexDirection: 'row' },
    rowMine: { justifyContent: 'flex-end' },
    rowOther: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '82%', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
    bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    bubbleOther: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderBottomLeftRadius: 4,
    },
    author: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
    authorMine: { color: 'rgba(255,255,255,0.85)' },
    body: { fontSize: 14.5, lineHeight: 20, color: colors.text },
    bodyMine: { color: '#fff' },
    foot: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
    time: { fontSize: 10.5, color: colors.textTertiary },
    timeMine: { color: 'rgba(255,255,255,0.75)' },
    // ✓ enviada · ✓✓ entregue · ✓✓ verde-claro lida (sobre a bolha azul)
    ticks: { fontSize: 11, fontWeight: '800', letterSpacing: -1.5, color: 'rgba(255,255,255,0.75)' },
    ticksRead: { color: '#86efac' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
      padding: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    input: {
      flex: 1,
      maxHeight: 110,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 9,
      fontSize: 14.5,
      color: colors.text,
      backgroundColor: colors.background,
    },
    sendBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnOff: { opacity: 0.45 },
    readOnly: {
      textAlign: 'center',
      fontSize: 12.5,
      color: colors.textSecondary,
      padding: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
  });
