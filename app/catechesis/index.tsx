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
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '../../src/context/ThemeContext';
import {
  FamilyCatechesisItem,
  getMyCatechesisClasses,
  classPendingTotal,
  classPendingParts,
  getMyFamilyCatechesis,
  MyCatechesisClass,
  shareCatechesisCertificate,
  shareCatechesisDeclaration,
  CatechesisAssessment,
  RATING_LABELS,
  getEnrollmentAssessments,
  submitCatechesisDocument,
  submitCatechesisDeclaration,
  applyCatechesisDocCorrection,
  getClassDocRequirements,
  CatechesisDocRequirement,
  getEnrollmentAttendance,
  getMyNotifications,
  EnrollmentAttendanceItem,
  AppNotification,
  shareFeeReceipt,
  getCommunityCatechesisClasses,
} from '../../src/services/catechesisService';
import { useAuth } from '../../src/context/AuthContext';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Minhas turmas de catequese (catequista/auxiliar). */
export default function CatechesisClassesScreen() {
  const router = useRouter();
  const colors = useColors();
  const styles = createStyles(colors);
  const { user } = useAuth();
  const isCoordinatorRole = ['PASTORAL_COORDINATOR', 'COMMUNITY_COORDINATOR', 'PARISH_ADMIN', 'DIOCESAN_ADMIN', 'SYSTEM_ADMIN'].includes(
    String(user?.role ?? ''),
  );

  const [classes, setClasses] = useState<MyCatechesisClass[]>([]);
  const [family, setFamily] = useState<FamilyCatechesisItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [assessView, setAssessView] = useState<{ name: string; items: CatechesisAssessment[] } | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
  // O que cada turma pede na inscrição (obrigatório / "não tenho" / outra denominação)
  const [docReqsByClass, setDocReqsByClass] = useState<Record<string, CatechesisDocRequirement[]>>({});
  // Modal para informar a denominação do batismo (Android não tem Alert.prompt)
  const [denomView, setDenomView] = useState<{ enrollmentId: string; kind: string } | null>(null);
  const [denomText, setDenomText] = useState('');
  const [savingDenom, setSavingDenom] = useState(false);
  const [noticeView, setNoticeView] = useState<AppNotification[] | null>(null);
  const [attendanceView, setAttendanceView] = useState<{ name: string; items: EnrollmentAttendanceItem[] } | null>(null);
  const [agendaView, setAgendaView] = useState<{ name: string; items: Array<{ date: string; topic?: string | null }> } | null>(null);

  const openNotices = async () => {
    try {
      const items = await getMyNotifications('CATECHESIS');
      if (!items.length) {
        Alert.alert('Avisos', 'Nenhum aviso da catequese recebido ainda.');
        return;
      }
      setNoticeView(items);
    } catch (error: any) {
      Alert.alert('Avisos', error?.message ?? 'Não foi possível carregar.');
    }
  };

  const openAttendanceDetail = async (enrollmentId: string, name: string) => {
    try {
      const items = await getEnrollmentAttendance(enrollmentId);
      if (!items.length) {
        Alert.alert('Frequência', 'Nenhuma chamada registrada ainda.');
        return;
      }
      setAttendanceView({ name, items });
    } catch (error: any) {
      Alert.alert('Frequência', error?.message ?? 'Não foi possível carregar.');
    }
  };

  const pickAndSubmitDocument = async (enrollmentId: string, kind: string, useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão', 'Autorize o acesso para enviar a foto do documento.');
      return;
    }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    if (result.canceled || !result.assets?.length) return;
    setUploadingDoc(enrollmentId + kind);
    try {
      await submitCatechesisDocument(enrollmentId, kind, result.assets[0]);
      Alert.alert(
        'Documento enviado ✓',
        'A coordenação vai conferir e dar baixa na pendência — você recebe o aviso por aqui. Depois de aceito, o documento fica guardado no prontuário da matrícula.',
      );
      await load(true);
    } catch (error: any) {
      Alert.alert('Envio', error?.message ?? 'Não foi possível enviar. Tente novamente.');
    } finally {
      setUploadingDoc(null);
    }
  };

  const pickPdfAndSubmit = async (enrollmentId: string, kind: string) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setUploadingDoc(enrollmentId + kind);
    try {
      await submitCatechesisDocument(enrollmentId, kind, {
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'application/pdf',
        fileName: asset.name ?? 'documento.pdf',
      });
      Alert.alert(
        'Documento enviado ✓',
        'A coordenação vai conferir e dar baixa na pendência — você recebe o aviso por aqui.',
      );
      await load(true);
    } catch (error: any) {
      Alert.alert('Envio', error?.message ?? 'Não foi possível enviar. Tente novamente.');
    } finally {
      setUploadingDoc(null);
    }
  };

  const handleSendDocument = (enrollmentId: string, kind: string) => {
    Alert.alert(
      `Enviar ${kind}`,
      'Fotografe, escolha da galeria ou anexe um PDF.\n\nO arquivo pode passar por conferência automática assistida por IA (provedor externo); a decisão é sempre da equipe da catequese. Depois de aceito, o documento fica guardado no prontuário da matrícula.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: '📷 Tirar foto', onPress: () => void pickAndSubmitDocument(enrollmentId, kind, true) },
        { text: '🖼 Galeria', onPress: () => void pickAndSubmitDocument(enrollmentId, kind, false) },
        { text: '📄 Arquivo/PDF', onPress: () => void pickPdfAndSubmit(enrollmentId, kind) },
      ],
    );
  };

  /** A conferência automática LEU dados diferentes do cadastro: oferece
   * corrigir o cadastro conforme o documento (nome e/ou nascimento). */
  const handleApplyCorrection = (
    doc: { id: string; extractedName?: string | null; extractedBirthDate?: string | null },
    memberName: string,
  ) => {
    const parts: string[] = [];
    if (doc.extractedName && doc.extractedName !== memberName) {
      parts.push(`Nome: "${memberName}" → "${doc.extractedName}"`);
    }
    if (doc.extractedBirthDate) {
      const birth = new Date(doc.extractedBirthDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
      parts.push(`Nascimento: ${birth} (conforme o documento)`);
    }
    Alert.alert(
      'Corrigir o cadastro?',
      `O documento traz dados diferentes do cadastro:\n\n${parts.join('\n')}\n\nDeseja atualizar o cadastro conforme o documento? A alteração fica registrada e o documento é conferido de novo.`,
      [
        { text: 'Manter como está', style: 'cancel' },
        {
          text: 'Corrigir cadastro',
          onPress: async () => {
            try {
              await applyCatechesisDocCorrection(doc.id);
              Alert.alert('Cadastro corrigido ✓', 'O documento será conferido novamente em instantes.');
              await load(true);
            } catch (error: any) {
              Alert.alert('Correção', error?.message ?? 'Não foi possível corrigir.');
            }
          },
        },
      ],
    );
  };

  /** "Não tenho o documento" — a coordenação aceita ou recusa a declaração. */
  const handleDeclareNotHave = (enrollmentId: string, kind: string) => {
    Alert.alert(
      `Não tem ${kind}?`,
      'A coordenação vai receber a sua declaração e pode aceitá-la ou pedir o documento mesmo assim.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Declarar que não tem',
          onPress: async () => {
            try {
              await submitCatechesisDeclaration(enrollmentId, kind, 'NOT_HAVE');
              Alert.alert('Declaração enviada ✓', 'A coordenação vai analisar — você recebe o aviso por aqui.');
              await load(true);
            } catch (error: any) {
              Alert.alert('Declaração', error?.message ?? 'Não foi possível enviar.');
            }
          },
        },
      ],
    );
  };

  const handleSubmitDenomination = async () => {
    if (!denomView) return;
    const denomination = denomText.trim();
    if (denomination.length < 2) {
      Alert.alert('Denominação', 'Informe em qual igreja o batismo foi realizado.');
      return;
    }
    setSavingDenom(true);
    try {
      await submitCatechesisDeclaration(denomView.enrollmentId, denomView.kind, 'OTHER_DENOMINATION', denomination);
      setDenomView(null);
      setDenomText('');
      Alert.alert(
        'Declaração enviada ✓',
        'A coordenação vai analisar o batismo de outra denominação e aceitar ou recusar — você recebe o aviso por aqui.',
      );
      await load(true);
    } catch (error: any) {
      Alert.alert('Declaração', error?.message ?? 'Não foi possível enviar.');
    } finally {
      setSavingDenom(false);
    }
  };

  const openFamilyAssessments = async (enrollmentId: string, name: string) => {
    try {
      const items = await getEnrollmentAssessments(enrollmentId);
      if (!items.length) {
        Alert.alert('Pareceres', 'Nenhum parecer registrado ainda.');
        return;
      }
      setAssessView({ name, items });
    } catch (error: any) {
      Alert.alert('Pareceres', error?.message ?? 'Não foi possível carregar.');
    }
  };

  const handleShareDocument = async (
    enrollmentId: string,
    kind: 'certificate' | 'declaration',
    memberName: string,
  ) => {
    if (downloadingId) return; // um download por vez — evita misturar arquivos
    setDownloadingId(enrollmentId);
    try {
      if (kind === 'certificate') await shareCatechesisCertificate(enrollmentId, memberName);
      else await shareCatechesisDeclaration(enrollmentId, memberName);
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
      // Coordenação sem turma própria: lista as turmas da comunidade (o backend
      // já autoriza aprovar/conversar por papel + escopo)
      const coordination = mine.length === 0 && isCoordinatorRole ? await getCommunityCatechesisClasses() : [];
      setClasses([...mine, ...coordination]);
      setFamily(familyItems);
      // O que cada turma pede na inscrição — falha vira lista vazia e o card
      // cai no comportamento antigo (pendências em texto)
      const activeClassIds = [
        ...new Set(
          familyItems
            .filter((item) => item.status === 'ACTIVE' || item.status === 'PENDING_APPROVAL')
            .map((item) => item.class.id),
        ),
      ];
      const reqEntries = await Promise.all(
        activeClassIds.map(async (classId) => {
          try {
            return [classId, await getClassDocRequirements(classId)] as const;
          } catch {
            return [classId, [] as CatechesisDocRequirement[]] as const;
          }
        }),
      );
      setDocReqsByClass(Object.fromEntries(reqEntries));
    } catch (error) {
      console.error('Erro ao carregar turmas de catequese:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isCoordinatorRole]);

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
          <TouchableOpacity style={styles.noticesBtn} activeOpacity={0.8} onPress={() => void openNotices()}>
            <FontAwesome5 name="bell" size={13} color={colors.primary} />
            <Text style={styles.noticesBtnText}>Histórico de avisos</Text>
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
                        (item.status === 'PENDING_APPROVAL' || item.status === 'WAITLISTED') && {
                          color: colors.warning,
                          borderColor: colors.warning,
                        },
                        item.status === 'REJECTED' && { color: colors.error, borderColor: colors.error },
                      ]}
                    >
                      {item.status === 'COMPLETED'
                        ? 'Concluído'
                        : item.status === 'PENDING_APPROVAL'
                          ? 'Aguardando aprovação'
                          : item.status === 'WAITLISTED'
                            ? `Fila de espera${item.waitlistPosition ? ` · nº ${item.waitlistPosition}` : ''}`
                            : item.status === 'REJECTED'
                              ? 'Não aprovada'
                              : 'Ativo'}
                    </Text>
                  </View>
                  <Text style={styles.cardStage} numberOfLines={1}>
                    {item.class.name} · {item.class.year}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {item.class.community.name}
                    {item.class.weekday !== null && item.class.weekday !== undefined
                      ? ` · ${WEEKDAYS[item.class.weekday]}`
                      : ''}
                    {item.class.time ? ` às ${item.class.time}` : ''}
                  </Text>
                  <View style={styles.cardStats}>
                    <TouchableOpacity
                      onPress={() =>
                        void openAttendanceDetail(
                          item.enrollmentId,
                          item.member.isSelf ? 'Você' : item.member.fullName,
                        )
                      }
                      hitSlop={8}
                    >
                      <Text style={styles.cardStat}>
                        ✅ Presença: {item.attendanceRate === null ? '—' : `${item.attendanceRate}%`}
                        {item.sessions > 0 ? ' ›' : ''}
                      </Text>
                    </TouchableOpacity>
                    {item.nextSession ? (
                      <TouchableOpacity
                        disabled={!(item.upcomingSessions ?? []).length}
                        onPress={() =>
                          setAgendaView({
                            name: item.class.name,
                            items: item.upcomingSessions ?? [],
                          })
                        }
                        hitSlop={8}
                      >
                        <Text style={styles.cardStat}>
                          📅 Próximo: {new Date(item.nextSession.date).getUTCDate().toString().padStart(2, '0')}/
                          {(new Date(item.nextSession.date).getUTCMonth() + 1).toString().padStart(2, '0')}
                          {(item.upcomingSessions ?? []).length > 1 ? ' ›' : ''}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {item.status === 'WAITLISTED' && (
                    <Text style={styles.pendingLine} numberOfLines={3}>
                      ⏳ A turma estava cheia — o pedido está na fila de espera. A coordenação pode
                      abrir uma vaga; você recebe o aviso por aqui.
                    </Text>
                  )}
                  {item.status === 'REJECTED' && (
                    <>
                      {item.rejectionReason ? (
                        <Text style={styles.pendingLine} numberOfLines={3}>
                          ℹ️ Motivo: {item.rejectionReason}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={styles.docBtn}
                        onPress={() =>
                          router.push(
                            (item.member.isSelf
                              ? '/catechesis/apply'
                              : `/catechesis/apply?memberId=${item.member.id}`) as never,
                          )
                        }
                      >
                        <Text style={styles.docBtnText}>🔄 Inscrever novamente</Text>
                      </TouchableOpacity>
                    </>
                  )}
                  {(item.status === 'ACTIVE' || item.status === 'PENDING_APPROVAL') &&
                    (() => {
                      const reqs = docReqsByClass[item.class.id] ?? [];
                      // Sem os requisitos da turma (offline/erro), cai no
                      // comportamento antigo: pendências em texto
                      if (reqs.length === 0) {
                        return (item.pendingDocuments ?? '')
                          .split(/[;,]/)
                          .map((kind) => kind.trim())
                          .filter(Boolean)
                          .map((kind) => {
                            const latest = (item.documents ?? []).find(
                              (doc) => doc.kind.toLowerCase() === kind.toLowerCase(),
                            );
                            const busy = uploadingDoc === item.enrollmentId + kind;
                            if (latest?.status === 'SUBMITTED') {
                              return (
                                <Text key={kind} style={styles.pendingLine} numberOfLines={2}>
                                  📎 {kind}: em conferência pela coordenação
                                </Text>
                              );
                            }
                            return (
                              <View key={kind}>
                                {latest?.status === 'REJECTED' && (
                                  <Text style={styles.pendingLine} numberOfLines={2}>
                                    ⚠️ {kind} recusado{latest.reviewNotes ? `: ${latest.reviewNotes}` : ''} — envie novamente
                                  </Text>
                                )}
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  disabled={busy}
                                  onPress={() => handleSendDocument(item.enrollmentId, kind)}
                                >
                                  <Text style={styles.docBtnText}>
                                    {busy ? 'Enviando...' : `📎 Enviar ${kind}`}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            );
                          });
                      }
                      // Requisitos da turma: um bloco por documento pedido
                      return reqs.map((req) => {
                        const docs = (item.documents ?? []).filter(
                          (doc) => doc.kind.toLowerCase() === req.kind.toLowerCase(),
                        );
                        const submitted = docs.find((doc) => doc.status === 'SUBMITTED');
                        const verified = docs.find((doc) => doc.status === 'VERIFIED');
                        const rejected = docs.find((doc) => doc.status === 'REJECTED');
                        const busy = uploadingDoc === item.enrollmentId + req.kind;
                        if (submitted) {
                          if (submitted.declaration) {
                            return (
                              <Text key={req.kind} style={styles.pendingLine} numberOfLines={2}>
                                📎 {req.kind}: declaração enviada — aguardando a coordenação
                              </Text>
                            );
                          }
                          // Resultado da conferência automática JÁ para o
                          // responsável — antes de a coordenação aprovar
                          const memberName = item.member.isSelf ? '' : item.member.fullName;
                          if (submitted.autoCheckStatus === 'MATCH') {
                            return (
                              <Text key={req.kind} style={styles.okLine} numberOfLines={2}>
                                ✓ {req.kind}: documento confere — aguardando a coordenação
                              </Text>
                            );
                          }
                          if (submitted.autoCheckStatus === 'MISMATCH') {
                            const canFix = !!(submitted.extractedName || submitted.extractedBirthDate);
                            return (
                              <View key={req.kind}>
                                <Text style={styles.pendingLine} numberOfLines={4}>
                                  ⚠️ {req.kind}: {submitted.autoCheckNotes ?? 'dados diferentes do cadastro'}
                                </Text>
                                <View style={styles.docBtnRow}>
                                  {canFix && (
                                    <TouchableOpacity
                                      style={styles.docBtn}
                                      onPress={() => handleApplyCorrection(submitted, memberName || item.member.fullName)}
                                    >
                                      <Text style={styles.docBtnText}>✎ Corrigir cadastro pelo documento</Text>
                                    </TouchableOpacity>
                                  )}
                                  <TouchableOpacity
                                    style={styles.docBtn}
                                    disabled={busy}
                                    onPress={() => handleSendDocument(item.enrollmentId, req.kind)}
                                  >
                                    <Text style={styles.docBtnText}>📎 Reenviar outro</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          }
                          if (submitted.autoCheckStatus === 'UNREADABLE') {
                            return (
                              <View key={req.kind}>
                                <Text style={styles.pendingLine} numberOfLines={3}>
                                  ⚠️ {req.kind}: não foi possível ler o documento — se a foto ficou ruim, reenvie
                                </Text>
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  disabled={busy}
                                  onPress={() => handleSendDocument(item.enrollmentId, req.kind)}
                                >
                                  <Text style={styles.docBtnText}>📎 Reenviar</Text>
                                </TouchableOpacity>
                              </View>
                            );
                          }
                          return (
                            <Text key={req.kind} style={styles.pendingLine} numberOfLines={2}>
                              📎 {req.kind}:{' '}
                              {submitted.autoCheckStatus === 'SKIPPED'
                                ? 'em conferência pela coordenação'
                                : 'enviado — lendo o documento…'}
                            </Text>
                          );
                        }
                        if (verified) {
                          return (
                            <Text key={req.kind} style={styles.okLine} numberOfLines={2}>
                              ✓ {req.kind}:{' '}
                              {verified.declaration === 'NOT_HAVE'
                                ? 'dispensado (declarou que não tem)'
                                : verified.declaration === 'OTHER_DENOMINATION'
                                  ? `batismo aceito${verified.denomination ? ` (${verified.denomination})` : ''}`
                                  : 'conferido'}
                            </Text>
                          );
                        }
                        return (
                          <View key={req.kind}>
                            {rejected ? (
                              <Text style={styles.pendingLine} numberOfLines={2}>
                                ⚠️ {req.kind} recusado{rejected.reviewNotes ? `: ${rejected.reviewNotes}` : ''} — envie novamente
                              </Text>
                            ) : (
                              <Text style={styles.pendingLine} numberOfLines={1}>
                                📄 {req.kind}
                                {req.required ? ' · obrigatório' : ''}
                              </Text>
                            )}
                            <View style={styles.docBtnRow}>
                              <TouchableOpacity
                                style={styles.docBtn}
                                disabled={busy}
                                onPress={() => handleSendDocument(item.enrollmentId, req.kind)}
                              >
                                <Text style={styles.docBtnText}>{busy ? 'Enviando...' : '📎 Enviar'}</Text>
                              </TouchableOpacity>
                              {req.allowNotHave && (
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  disabled={busy}
                                  onPress={() => handleDeclareNotHave(item.enrollmentId, req.kind)}
                                >
                                  <Text style={styles.docBtnText}>Não tenho</Text>
                                </TouchableOpacity>
                              )}
                              {req.allowOtherDenomination && (
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  disabled={busy}
                                  onPress={() => {
                                    setDenomText('');
                                    setDenomView({ enrollmentId: item.enrollmentId, kind: req.kind });
                                  }}
                                >
                                  <Text style={styles.docBtnText}>Outra denominação</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      });
                    })()}
                  {(item.fees ?? [])
                    .filter((fee) => fee.status === 'PENDING')
                    .map((fee) => (
                      <Text key={fee.id} style={styles.pendingLine} numberOfLines={2}>
                        💰 {fee.description}: R$ {fee.amount.toFixed(2).replace('.', ',')} — pendente
                        (procure a coordenação)
                      </Text>
                    ))}
                  {(item.fees ?? [])
                    .filter((fee) => fee.status === 'PAID' && fee.paymentId)
                    .map((fee) => (
                      <TouchableOpacity
                        key={fee.id}
                        style={styles.docBtn}
                        disabled={downloadingId === fee.paymentId}
                        onPress={async () => {
                          setDownloadingId(fee.paymentId!);
                          try {
                            await shareFeeReceipt(fee.paymentId!, fee.description);
                          } catch (error: any) {
                            Alert.alert('Recibo', error?.message ?? 'Não foi possível gerar.');
                          } finally {
                            setDownloadingId(null);
                          }
                        }}
                      >
                        <Text style={styles.docBtnText}>
                          {downloadingId === fee.paymentId ? 'Gerando...' : `🧾 Recibo · ${fee.description}`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  {(item.status === 'ACTIVE' || item.status === 'PENDING_APPROVAL') && (
                    <TouchableOpacity
                      style={styles.docBtn}
                      onPress={() => router.push(`/catechesis/chat/${item.enrollmentId}` as never)}
                    >
                      <Text style={styles.docBtnText}>
                        💬 Falar com a catequista{item.unreadMessages ? ` (${item.unreadMessages} nova(s))` : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {(item.status === 'ACTIVE' || item.status === 'COMPLETED') && (
                    <TouchableOpacity
                      style={styles.docBtn}
                      onPress={() => void openFamilyAssessments(item.enrollmentId, item.member.isSelf ? 'Você' : item.member.fullName)}
                    >
                      <Text style={styles.docBtnText}>
                        📝 Pareceres do catequista ({item.assessmentsCount ?? 0})
                      </Text>
                    </TouchableOpacity>
                  )}
                  {item.status === 'COMPLETED' && (
                    <TouchableOpacity
                      style={styles.docBtn}
                      disabled={downloadingId === item.enrollmentId}
                      onPress={() => void handleShareDocument(item.enrollmentId, 'certificate', item.member.fullName)}
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
                      onPress={() => void handleShareDocument(item.enrollmentId, 'declaration', item.member.fullName)}
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
              {classes.every((klass) => klass.role === 'Coordenação')
                ? 'Turmas da comunidade (coordenação)'
                : family.length > 0
                  ? 'Minhas turmas (catequista)'
                  : 'Suas turmas como catequista ou auxiliar'}
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
                {classPendingTotal(klass) > 0 && (
                  <View style={styles.pendBadge} accessibilityLabel={`${classPendingTotal(klass)} pendências`}>
                    <Text style={styles.pendBadgeText}>{classPendingTotal(klass)}</Text>
                  </View>
                )}
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
              {classPendingTotal(klass) > 0 && (
                <Text style={styles.pendLine}>⚠️ {classPendingParts(klass).join(' · ')} ›</Text>
              )}
            </TouchableOpacity>
          ))
          )}
          </>
        )}
      </ScrollView>

      {/* Histórico de avisos */}
      <Modal
        visible={!!noticeView}
        transparent
        animationType="fade"
        onRequestClose={() => setNoticeView(null)}
      >
        <Pressable style={styles.assessOverlay} onPress={() => setNoticeView(null)}>
          <Pressable style={styles.assessSheet} onPress={() => {}}>
            <Text style={styles.assessTitle}>🔔 Avisos da catequese</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {(noticeView ?? []).map((notice) => (
                <View key={notice.id} style={styles.assessCard}>
                  <Text style={styles.assessPeriod}>
                    {notice.title}
                    {'  '}
                    <Text style={styles.noticeDate}>
                      {new Date(notice.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                      })}
                    </Text>
                  </Text>
                  <Text style={styles.assessNotes}>{notice.body}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.assessClose} onPress={() => setNoticeView(null)}>
              <Text style={styles.assessCloseText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Agenda dos próximos encontros da turma */}
      <Modal
        visible={!!agendaView}
        transparent
        animationType="fade"
        onRequestClose={() => setAgendaView(null)}
      >
        <Pressable style={styles.assessOverlay} onPress={() => setAgendaView(null)}>
          <Pressable style={styles.assessSheet} onPress={() => {}}>
            <Text style={styles.assessTitle}>📅 Agenda · {agendaView?.name ?? ''}</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {(agendaView?.items ?? []).map((session, index) => (
                <View key={index} style={styles.attendanceRow}>
                  <Text style={styles.attendanceDate}>
                    {new Date(session.date).toLocaleDateString('pt-BR', {
                      timeZone: 'UTC',
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.agendaTopic} numberOfLines={1}>
                    {session.topic || 'Tema a definir'}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.assessClose} onPress={() => setAgendaView(null)}>
              <Text style={styles.assessCloseText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Frequência detalhada */}
      <Modal
        visible={!!attendanceView}
        transparent
        animationType="fade"
        onRequestClose={() => setAttendanceView(null)}
      >
        <Pressable style={styles.assessOverlay} onPress={() => setAttendanceView(null)}>
          <Pressable style={styles.assessSheet} onPress={() => {}}>
            <Text style={styles.assessTitle}>🗓 Frequência · {attendanceView?.name ?? ''}</Text>
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {(attendanceView?.items ?? []).map((item, index) => (
                <View key={index} style={styles.attendanceRow}>
                  <Text style={styles.attendanceDate}>
                    {new Date(item.date).toLocaleDateString('pt-BR', {
                      timeZone: 'UTC',
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                    {item.topic ? ` · ${item.topic}` : ''}
                  </Text>
                  <Text
                    style={[
                      styles.attendanceMark,
                      { color: item.present ? (item.late ? colors.warning : colors.success) : colors.error },
                    ]}
                  >
                    {item.present ? (item.late ? '🕒 Atrasado' : '✓ Presente') : '✗ Ausente'}
                  </Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.assessClose} onPress={() => setAttendanceView(null)}>
              <Text style={styles.assessCloseText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Batismo em outra denominação: informar qual (Android não tem Alert.prompt) */}
      <Modal
        visible={!!denomView}
        transparent
        animationType="fade"
        onRequestClose={() => setDenomView(null)}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.assessOverlay} onPress={() => setDenomView(null)}>
          <Pressable style={styles.assessSheet} onPress={() => {}}>
            <Text style={styles.assessTitle}>Batismo em outra denominação</Text>
            <Text style={styles.assessNotes}>
              Informe em qual igreja cristã o batismo foi realizado. A coordenação da catequese vai
              analisar e aceitar ou recusar — você recebe o aviso por aqui.
            </Text>
            <TextInput
              style={styles.denomInput}
              placeholder="Ex.: Assembleia de Deus"
              placeholderTextColor={colors.textTertiary}
              value={denomText}
              onChangeText={setDenomText}
              maxLength={80}
              autoFocus
            />
            <TouchableOpacity
              style={[styles.assessClose, savingDenom && { opacity: 0.6 }]}
              disabled={savingDenom}
              onPress={() => void handleSubmitDenomination()}
            >
              <Text style={styles.assessCloseText}>{savingDenom ? 'Enviando…' : 'Enviar declaração'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.denomCancel} disabled={savingDenom} onPress={() => setDenomView(null)}>
              <Text style={styles.denomCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Pareceres (leitura da família) — Modal trata o voltar do Android */}
      <Modal
        visible={!!assessView}
        transparent
        animationType="fade"
        onRequestClose={() => setAssessView(null)}
      >
        <Pressable style={styles.assessOverlay} onPress={() => setAssessView(null)}>
          <Pressable style={styles.assessSheet} onPress={() => {}}>
            <Text style={styles.assessTitle}>Pareceres · {assessView?.name ?? ''}</Text>
            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {(assessView?.items ?? []).map((assessment) => (
                <View key={assessment.id} style={styles.assessCard}>
                  <Text style={styles.assessPeriod}>
                    {assessment.period}
                    {assessment.rating ? ` · ${RATING_LABELS[assessment.rating]}` : ''}
                  </Text>
                  <Text style={styles.assessNotes}>{assessment.notes}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.assessClose} onPress={() => setAssessView(null)}>
              <Text style={styles.assessCloseText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
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
    okLine: { fontSize: 12.5, color: colors.success, marginTop: 6, fontWeight: '600' },
    docBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    denomInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14.5,
      color: colors.text,
      backgroundColor: colors.surface,
      marginTop: 12,
    },
    denomCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
    denomCancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
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
    assessOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    assessSheet: { backgroundColor: colors.card, borderRadius: 16, padding: 18 },
    assessTitle: { fontSize: 16.5, fontWeight: '800', color: colors.text, marginBottom: 10 },
    assessCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    assessPeriod: { fontSize: 13.5, fontWeight: '800', color: colors.text },
    assessNotes: { fontSize: 13.5, color: colors.textSecondary, marginTop: 4, lineHeight: 19 },
    assessClose: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    assessCloseText: { color: '#fff', fontSize: 14.5, fontWeight: '800' },
    noticesBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 11,
      marginTop: 8,
    },
    noticesBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
    noticeDate: { fontSize: 11.5, color: colors.textTertiary, fontWeight: '600' },
    attendanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    agendaTopic: { flex: 1, fontSize: 13, color: colors.textSecondary, textAlign: 'right' },
    attendanceDate: { flex: 1, fontSize: 13.5, color: colors.text },
    attendanceMark: { fontSize: 13, fontWeight: '800' },
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
    pendBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    pendBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    pendLine: { marginTop: 8, fontSize: 12.5, fontWeight: '700', color: colors.warning },
  });
