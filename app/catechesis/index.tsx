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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  FamilyCatechesisItem,
  getMyCatechesisClasses,
  getMyFamilyCatechesis,
  MyCatechesisClass,
  shareCatechesisCertificate,
  shareCatechesisDeclaration,
} from '../../src/services/catechesisService';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Minhas turmas de catequese (catequista/auxiliar). */
export default function CatechesisClassesScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);

  const [classes, setClasses] = useState<MyCatechesisClass[]>([]);
  const [family, setFamily] = useState<FamilyCatechesisItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleShareDocument = async (
    enrollmentId: string,
    kind: 'certificate' | 'declaration',
  ) => {
    setDownloadingId(enrollmentId);
    try {
      if (kind === 'certificate') await shareCatechesisCertificate(enrollmentId);
      else await shareCatechesisDeclaration(enrollmentId);
    } catch (error: any) {
      Alert.alert('Documento', error?.message ?? 'Não foi possível gerar o documento.');
    } finally {
      setDownloadingId(null);
    }
  };

  const load = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    try {
      const [mine, familyItems] = await Promise.all([
        getMyCatechesisClasses(),
        getMyFamilyCatechesis().catch(() => [] as FamilyCatechesisItem[]),
      ]);
      setClasses(mine);
      setFamily(familyItems);
    } catch (error) {
      console.error('Erro ao carregar turmas de catequese:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

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
        <Text style={styles.headerTitle}>Catequese</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => load(true)} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <>
          <TouchableOpacity
            style={styles.applyBtn}
            activeOpacity={0.85}
            onPress={() => router.push('/catechesis/apply' as never)}
          >
            <FontAwesome5 name="user-plus" size={14} color="#fff" />
            <Text style={styles.applyBtnText}>Inscrever na catequese</Text>
          </TouchableOpacity>

          {classes.length === 0 && family.length === 0 && (
            <View style={styles.empty}>
              <FontAwesome5 name="book-open" size={28} color={colors.textTertiary} />
              <Text style={styles.emptyText}>
                Nenhuma turma por aqui ainda — inscreva você ou seus filhos pelo botão acima, ou
                procure a coordenação da catequese.
              </Text>
            </View>
          )}
          {family.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Acompanhamento da família</Text>
              {family.map((item) => (
                <View key={item.enrollmentId} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>
                      {item.member.isSelf ? 'Você' : item.member.fullName}
                    </Text>
                    <Text
                      style={[
                        styles.roleChip,
                        item.status === 'COMPLETED' && { color: colors.success, borderColor: colors.success },
                        item.status === 'PENDING_APPROVAL' && { color: colors.warning, borderColor: colors.warning },
                        item.status === 'REJECTED' && { color: colors.error, borderColor: colors.error },
                      ]}
                    >
                      {item.status === 'COMPLETED'
                        ? 'Concluído'
                        : item.status === 'PENDING_APPROVAL'
                          ? 'Aguardando aprovação'
                          : item.status === 'REJECTED'
                            ? 'Não aprovada'
                            : 'Ativo'}
                    </Text>
                  </View>
                  <Text style={styles.cardStage} numberOfLines={1}>
                    {item.class.stage.name} · {item.class.name}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.class.community.name}
                    {item.class.weekday !== null && item.class.weekday !== undefined
                      ? ` · ${WEEKDAYS[item.class.weekday]}`
                      : ''}
                    {item.class.time ? ` às ${item.class.time}` : ''}
                  </Text>
                  <View style={styles.cardStats}>
                    <Text style={styles.cardStat}>
                      ✅ Presença: {item.attendanceRate === null ? '—' : `${item.attendanceRate}%`}
                    </Text>
                    {item.nextSession ? (
                      <Text style={styles.cardStat}>
                        📅 Próximo: {new Date(item.nextSession.date).getUTCDate().toString().padStart(2, '0')}/
                        {(new Date(item.nextSession.date).getUTCMonth() + 1).toString().padStart(2, '0')}
                      </Text>
                    ) : null}
                  </View>
                  {item.pendingDocuments ? (
                    <Text style={styles.pendingLine} numberOfLines={2}>
                      📄 Documentos pendentes: {item.pendingDocuments}
                    </Text>
                  ) : null}
                  {item.status === 'COMPLETED' && (
                    <TouchableOpacity
                      style={styles.docBtn}
                      disabled={downloadingId === item.enrollmentId}
                      onPress={() => void handleShareDocument(item.enrollmentId, 'certificate')}
                    >
                      <Text style={styles.docBtnText}>
                        {downloadingId === item.enrollmentId ? 'Gerando...' : '🎓 Baixar certificado'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {item.status === 'ACTIVE' && (
                    <TouchableOpacity
                      style={styles.docBtn}
                      disabled={downloadingId === item.enrollmentId}
                      onPress={() => void handleShareDocument(item.enrollmentId, 'declaration')}
                    >
                      <Text style={styles.docBtnText}>
                        {downloadingId === item.enrollmentId ? 'Gerando...' : '📄 Declaração de matrícula'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}

          {classes.length > 0 && (
            <Text style={styles.sectionLabel}>
              {family.length > 0 ? 'Minhas turmas (catequista)' : 'Suas turmas como catequista ou auxiliar'}
            </Text>
          )}
          {classes.length > 0 && (
          classes.map((klass) => (
            <TouchableOpacity
              key={klass.classId}
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => router.push(`/catechesis/${klass.classId}` as never)}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {klass.name}
                </Text>
                <Text style={styles.roleChip}>{klass.role}</Text>
              </View>
              <Text style={styles.cardStage} numberOfLines={1}>
                {klass.stage.name} · {klass.year}
              </Text>
              <Text style={styles.cardMeta} numberOfLines={1}>
                {klass.community.name}
                {klass.weekday !== null && klass.weekday !== undefined
                  ? ` · ${WEEKDAYS[klass.weekday]}`
                  : ''}
                {klass.time ? ` às ${klass.time}` : ''}
                {klass.room ? ` · ${klass.room}` : ''}
              </Text>
              <View style={styles.cardStats}>
                <Text style={styles.cardStat}>
                  👥 {klass.activeEnrollments} catequizando{klass.activeEnrollments === 1 ? '' : 's'}
                </Text>
                <Text style={styles.cardStat}>
                  📅 {klass.sessionsCount} encontro{klass.sessionsCount === 1 ? '' : 's'}
                </Text>
              </View>
            </TouchableOpacity>
          ))
          )}
          </>
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
    subtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 6,
      marginBottom: 2,
    },
    pendingLine: { fontSize: 12.5, color: colors.warning, marginTop: 6 },
    applyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
    },
    applyBtnText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
    docBtn: {
      alignSelf: 'flex-start',
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
      marginTop: 8,
    },
    docBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 3,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
    roleChip: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
      overflow: 'hidden',
    },
    cardStage: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    cardMeta: { fontSize: 12.5, color: colors.textSecondary },
    cardStats: { flexDirection: 'row', gap: 14, marginTop: 6 },
    cardStat: { fontSize: 12.5, color: colors.textSecondary },
  });
