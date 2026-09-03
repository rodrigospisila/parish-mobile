import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useColors } from '../../src/context/ThemeContext';
import { useCommunity } from '../../src/context/CommunityContext';
import {
  CatechesisDocRequirement,
  CatechesisOpenClass,
  MyDependent,
  applyCatechesis,
  getCatechesisOpenClasses,
  getClassDocRequirements,
  getMyDependents,
  getMyFamilyCatechesis,
  submitCatechesisDeclaration,
  submitCatechesisDocument,
} from '../../src/services/catechesisService';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/** Máscara DD/MM/AAAA enquanto digita (aceita só dígitos e insere as barras). */
const maskBirthDate = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/** DD/MM/AAAA -> AAAA-MM-DD validada (null quando inválida/incompleta). */
const birthToIso = (value: string): string | null => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return iso;
};

type Who = { kind: 'self' } | { kind: 'dependent'; id: string; name: string } | { kind: 'new' };

/** Documento resolvido AINDA NA INSCRIÇÃO: arquivo anexado ou declaração. */
type DocDraft =
  | { type: 'file'; asset: { uri: string; mimeType?: string | null; fileName?: string | null } }
  | { type: 'declaration'; declaration: 'NOT_HAVE' | 'OTHER_DENOMINATION'; denomination?: string };

/** Inscrição online na catequese (responsável ou o próprio adulto). */
export default function CatechesisApplyScreen() {
  const router = useRouter();
  const colors = useColors();
  const { activeCommunityId } = useCommunity();
  // Reinscrição: chega com ?memberId= para já selecionar o catequizando
  const { memberId: presetMemberId } = useLocalSearchParams<{ memberId?: string }>();
  const styles = createStyles(colors);

  const [classes, setClasses] = useState<CatechesisOpenClass[]>([]);
  const [dependents, setDependents] = useState<MyDependent[]>([]);
  // Quem JÁ está inscrito (ativa/aguardando/fila) não aparece para inscrever —
  // realocação é papel do coordenador
  const [enrolledMemberIds, setEnrolledMemberIds] = useState<Set<string>>(new Set());
  const [selfEnrolled, setSelfEnrolled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Documentos da turma escolhida, resolvidos NA inscrição
  const [docReqs, setDocReqs] = useState<CatechesisDocRequirement[] | null>(null);
  const [docsDraft, setDocsDraft] = useState<Record<string, DocDraft>>({});
  const [denomFor, setDenomFor] = useState<string | null>(null);
  const [denomText, setDenomText] = useState('');
  const docReqsCache = useRef<Map<string, CatechesisDocRequirement[]>>(new Map());

  const [selectedClass, setSelectedClass] = useState<CatechesisOpenClass | null>(null);
  // Filtros de ano e etapa (na virada, 2026 e 2027 convivem na lista)
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  // Defaults dos filtros só na primeira carga por comunidade — reexecuções do
  // load (refoco) não podem descartar a escolha do usuário
  const defaultsAppliedFor = useRef<string | null>(null);
  // Padrão: cadastrar um filho novo — o caso mais comum da inscrição
  const [who, setWho] = useState<Who>({ kind: 'new' });

  // Turma selecionada que sai da lista visível (filtro mudou) é desmarcada —
  // sem isso o envio ia para uma turma que o usuário nem está vendo
  useEffect(() => {
    setSelectedClass((prev) => {
      if (!prev) return prev;
      const visible =
        classes.some((k) => k.classId === prev.classId) &&
        (yearFilter === null || prev.year === yearFilter) &&
        (stageFilter === null || prev.stage.name === stageFilter);
      return visible ? prev : null;
    });
  }, [classes, yearFilter, stageFilter]);

  // Turma escolhida → carrega o que ela pede de documentos (rascunho zera)
  useEffect(() => {
    setDocsDraft({});
    if (!selectedClass) {
      setDocReqs(null);
      return;
    }
    const cached = docReqsCache.current.get(selectedClass.classId);
    if (cached) {
      setDocReqs(cached);
      return;
    }
    let alive = true;
    setDocReqs(null);
    getClassDocRequirements(selectedClass.classId)
      .then((reqs) => {
        docReqsCache.current.set(selectedClass.classId, reqs);
        if (alive) setDocReqs(reqs);
      })
      .catch(() => {
        // Sem os requisitos (rede), a inscrição segue — documentos ficam
        // para depois, pelo card da matrícula
        if (alive) setDocReqs([]);
      });
    return () => {
      alive = false;
    };
  }, [selectedClass?.classId]);
  const [childName, setChildName] = useState('');
  const [childBirth, setChildBirth] = useState('');
  const [consent, setConsent] = useState(false);
  /** Uso de imagem: exige resposta explícita (null = ainda não escolheu) */
  const [imageConsent, setImageConsent] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [openClasses, myDependents, familyItems] = await Promise.all([
        getCatechesisOpenClasses(activeCommunityId),
        getMyDependents().catch(() => [] as MyDependent[]),
        getMyFamilyCatechesis().catch(() => []),
      ]);
      // Já inscritos (ativa/aguardando aprovação/fila) saem da lista de "quem"
      const effective = familyItems.filter((item) =>
        ['ACTIVE', 'PENDING_APPROVAL', 'WAITLISTED'].includes(item.status),
      );
      setEnrolledMemberIds(new Set(effective.map((item) => item.member.id)));
      setSelfEnrolled(effective.some((item) => item.member.isSelf));
      setClasses(openClasses);
      // Seleção re-resolvida contra a lista nova (turma pode ter saído)
      setSelectedClass((prev) => (prev ? openClasses.find((k) => k.classId === prev.classId) ?? null : null));
      // Padrão do filtro (só na primeira carga desta comunidade): o MAIOR ano
      // disponível — o ano novo, quando o coordenador já abriu as turmas dele
      if (defaultsAppliedFor.current !== (activeCommunityId ?? '')) {
        const years = [...new Set(openClasses.map((klass) => klass.year))];
        setYearFilter(years.length > 1 ? Math.max(...years) : null);
        setStageFilter(null);
        defaultsAppliedFor.current = activeCommunityId ?? '';
      }
      setDependents(myDependents);
      if (presetMemberId) {
        const preset = myDependents.find((dependent) => dependent.id === presetMemberId);
        if (preset) setWho({ kind: 'dependent', id: preset.id, name: preset.fullName });
      }
    } catch (error: any) {
      console.error('Erro ao carregar turmas abertas:', error);
      setClasses([]);
      setLoadError(error?.message ?? 'Não foi possível carregar as turmas.');
    } finally {
      setIsLoading(false);
    }
  }, [activeCommunityId, presetMemberId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ---- documentos resolvidos na própria inscrição ----
  const attachFileFor = (kind: string) => {
    const pickImage = async (useCamera: boolean) => {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permissão', 'Autorize o acesso para anexar a foto do documento.');
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (result.canceled || !result.assets?.length) return;
      setDocsDraft((prev) => ({ ...prev, [kind]: { type: 'file', asset: result.assets[0] } }));
    };
    const pickPdf = async () => {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setDocsDraft((prev) => ({
        ...prev,
        [kind]: {
          type: 'file',
          asset: { uri: asset.uri, mimeType: asset.mimeType ?? 'application/pdf', fileName: asset.name ?? 'documento.pdf' },
        },
      }));
    };
    Alert.alert(`Anexar ${kind}`, 'Fotografe, escolha da galeria ou anexe um PDF.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: '📷 Tirar foto', onPress: () => void pickImage(true) },
      { text: '🖼 Galeria', onPress: () => void pickImage(false) },
      { text: '📄 Arquivo/PDF', onPress: () => void pickPdf() },
    ]);
  };

  const handleConfirmDenomination = () => {
    if (!denomFor) return;
    const denomination = denomText.trim();
    if (denomination.length < 2) {
      Alert.alert('Denominação', 'Informe em qual igreja o batismo foi realizado.');
      return;
    }
    setDocsDraft((prev) => ({ ...prev, [denomFor]: { type: 'declaration', declaration: 'OTHER_DENOMINATION', denomination } }));
    setDenomFor(null);
    setDenomText('');
  };

  /** Rótulo curto do que foi escolhido para o requisito. */
  const draftLabel = (draft: DocDraft): string => {
    if (draft.type === 'file') return `📎 ${draft.asset.fileName ?? 'foto anexada'}`;
    return draft.declaration === 'NOT_HAVE' ? 'Declarado: não tem' : `Outra denominação: ${draft.denomination}`;
  };

  const doSubmit = async () => {
    if (!selectedClass) return;
    setSubmitting(true);
    try {
      const result = await applyCatechesis({
        classId: selectedClass.classId,
        forMemberId: who.kind === 'dependent' ? who.id : undefined,
        newChild:
          who.kind === 'new'
            ? { fullName: childName.trim(), birthDate: birthToIso(childBirth) || undefined }
            : undefined,
        consentGiven: true,
        imageConsent: imageConsent === true,
      });

      // Envia os documentos resolvidos na inscrição (um a um; falha não
      // derruba a inscrição — dá para reenviar pelo card depois)
      const failures: string[] = [];
      let sent = 0;
      for (const [kind, draft] of Object.entries(docsDraft)) {
        try {
          if (draft.type === 'file') {
            await submitCatechesisDocument(result.id, kind, draft.asset);
          } else {
            await submitCatechesisDeclaration(result.id, kind, draft.declaration, draft.denomination);
          }
          sent += 1;
        } catch {
          failures.push(kind);
        }
      }

      const docsLine = sent > 0 ? ` ${sent} documento(s)/declaração(ões) enviados junto.` : '';
      const failLine = failures.length
        ? ` Atenção: ${failures.join(', ')} não foi enviado — reenvie pelo cartão da matrícula.`
        : '';
      if (result?.status === 'WAITLISTED') {
        Alert.alert(
          'Na fila de espera ✓',
          `A turma está cheia, mas o pedido entrou na fila de espera. A coordenação pode abrir uma vaga — você recebe o aviso por aqui.${docsLine}${failLine}`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      } else {
        Alert.alert(
          'Inscrição enviada ✓',
          `A coordenação da catequese vai confirmar a matrícula — você recebe o aviso por aqui.${docsLine}${failLine}`,
          [{ text: 'OK', onPress: () => router.back() }],
        );
      }
    } catch (error: any) {
      Alert.alert('Não foi possível inscrever', error?.message ?? 'Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (!selectedClass) {
      Alert.alert('Escolha a turma', 'Toque numa turma para selecionar.');
      return;
    }
    if (who.kind === 'new') {
      if (childName.trim().length < 5) {
        Alert.alert('Nome do catequizando', 'Informe o nome completo.');
        return;
      }
      if (childBirth.trim()) {
        const iso = birthToIso(childBirth);
        if (!iso) {
          Alert.alert('Data de nascimento', 'Data inválida — use DD/MM/AAAA (ou deixe em branco).');
          return;
        }
      }
    }
    if (!consent) {
      Alert.alert(
        'Consentimento necessário',
        'Autorize o tratamento dos dados do catequizando para concluir a inscrição.',
      );
      return;
    }
    if (imageConsent === null) {
      Alert.alert(
        'Uso de imagem',
        'Escolha se autoriza ou não o uso da imagem do catequizando — a inscrição vale nos dois casos.',
      );
      return;
    }
    // Documentos obrigatórios sem anexo/declaração: avisa, mas não trava a
    // inscrição — a família pode não estar com o papel em mãos agora
    const missingRequired = (docReqs ?? []).filter((req) => req.required && !docsDraft[req.kind]);
    if (missingRequired.length) {
      Alert.alert(
        'Documento obrigatório pendente',
        `Falta anexar: ${missingRequired.map((req) => req.kind).join(', ')}. Você pode enviar agora ou depois, pelo cartão da matrícula.`,
        [
          { text: 'Voltar e anexar', style: 'cancel' },
          { text: 'Enviar mesmo assim', onPress: () => void doSubmit() },
        ],
      );
      return;
    }
    void doSubmit();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()} hitSlop={10}>
          <FontAwesome5 name="arrow-left" size={17} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Inscrição na catequese</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
        ) : loadError ? (
          <View style={styles.empty}>
            <FontAwesome5 name="exclamation-circle" size={26} color={colors.textTertiary} />
            <Text style={styles.emptyText}>{loadError}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void load()}>
              <Text style={styles.primaryBtnText}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : classes.length === 0 ? (
          <View style={styles.empty}>
            <FontAwesome5 name="book-open" size={26} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              Nenhuma turma com inscrições abertas nesta comunidade no momento. Fale com a
              secretaria paroquial.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.stepLabel}>1 · Escolha a turma</Text>
            {(() => {
              const years = [...new Set(classes.map((klass) => klass.year))].sort((a, b) => b - a);
              const stages = [...new Set(classes.map((klass) => klass.stage.name))];
              const visible = classes.filter(
                (klass) =>
                  (yearFilter === null || klass.year === yearFilter) &&
                  (stageFilter === null || klass.stage.name === stageFilter),
              );
              return (
                <>
                  {years.length > 1 && (
                    <View style={styles.filterRow}>
                      <TouchableOpacity
                        style={[styles.filterChip, yearFilter === null && styles.filterChipOn]}
                        onPress={() => setYearFilter(null)}
                      >
                        <Text style={[styles.filterChipText, yearFilter === null && styles.filterChipTextOn]}>Todos os anos</Text>
                      </TouchableOpacity>
                      {years.map((year) => (
                        <TouchableOpacity
                          key={year}
                          style={[styles.filterChip, yearFilter === year && styles.filterChipOn]}
                          onPress={() => setYearFilter(year)}
                        >
                          <Text style={[styles.filterChipText, yearFilter === year && styles.filterChipTextOn]}>{year}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {stages.length > 1 && (
                    <View style={styles.filterRow}>
                      <TouchableOpacity
                        style={[styles.filterChip, stageFilter === null && styles.filterChipOn]}
                        onPress={() => setStageFilter(null)}
                      >
                        <Text style={[styles.filterChipText, stageFilter === null && styles.filterChipTextOn]}>Todas as etapas</Text>
                      </TouchableOpacity>
                      {stages.map((stageName) => (
                        <TouchableOpacity
                          key={stageName}
                          style={[styles.filterChip, stageFilter === stageName && styles.filterChipOn]}
                          onPress={() => setStageFilter(stageName)}
                        >
                          <Text style={[styles.filterChipText, stageFilter === stageName && styles.filterChipTextOn]}>{stageName}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {visible.length === 0 && (
                    <Text style={styles.emptyText}>Nenhuma turma neste ano/etapa — ajuste os filtros acima.</Text>
                  )}
                  {visible.map((klass) => {
                    const full = klass.openSpots !== null && klass.openSpots <= 0;
                    // Fallback CONSERVADOR: sem o campo (backend antigo), turma
                    // cheia volta ao comportamento antigo (desabilitada) — não
                    // prometer fila que o servidor vai recusar
                    const mode = klass.acceptingMode ?? (full ? 'FULL_CLOSED' : 'OPEN');
                    const blocked = mode === 'FULL_CLOSED';
                    const selected = selectedClass?.classId === klass.classId;
                    return (
                      <TouchableOpacity
                        key={klass.classId}
                        style={[styles.classCard, selected && styles.classCardSelected, blocked && { opacity: 0.5 }]}
                        disabled={blocked}
                        activeOpacity={0.85}
                        onPress={() => setSelectedClass(klass)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.className} numberOfLines={1}>
                            {klass.name}
                          </Text>
                          <Text style={styles.classMeta} numberOfLines={1}>
                            {klass.stage.name} · {klass.year}
                            {klass.weekday !== null && klass.weekday !== undefined
                              ? ` · ${WEEKDAYS[klass.weekday]}`
                              : ''}
                            {klass.time ? ` às ${klass.time}` : ''}
                            {klass.room ? ` · ${klass.room}` : ''}
                          </Text>
                          {blocked ? (
                            <Text style={[styles.classSpots, { color: colors.error }]}>
                              Turma cheia — não aceita mais inscrições neste ano
                            </Text>
                          ) : mode === 'WAITLIST' && full ? (
                            <Text style={[styles.classSpots, { color: colors.warning }]}>
                              Turma cheia — fila de espera
                              {klass.waitlistCount ? ` (${klass.waitlistCount} na fila)` : ''}
                            </Text>
                          ) : (
                            <Text style={styles.classSpots}>
                              {klass.openSpots === null
                                ? 'Vagas abertas'
                                : `${klass.openSpots} vaga${klass.openSpots === 1 ? '' : 's'}`}
                            </Text>
                          )}
                        </View>
                        {selected && <FontAwesome5 name="check-circle" size={18} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}

            <Text style={styles.stepLabel}>2 · Quem vai participar</Text>
            <TouchableOpacity
              style={[styles.whoRow, who.kind === 'new' && styles.whoSelected]}
              onPress={() => setWho({ kind: 'new' })}
            >
              <Text style={styles.whoText}>＋ Cadastrar filho(a)</Text>
            </TouchableOpacity>
            {dependents
              // Quem já está inscrito (ativa/aguardando/fila) não reaparece —
              // trocar de turma é com a coordenação
              .filter((dependent) => !enrolledMemberIds.has(dependent.id))
              .map((dependent) => (
                <TouchableOpacity
                  key={dependent.id}
                  style={[
                    styles.whoRow,
                    who.kind === 'dependent' && who.id === dependent.id && styles.whoSelected,
                  ]}
                  onPress={() => setWho({ kind: 'dependent', id: dependent.id, name: dependent.fullName })}
                >
                  <Text style={styles.whoText}>{dependent.fullName}</Text>
                </TouchableOpacity>
              ))}
            {!selfEnrolled && (
              <TouchableOpacity
                style={[styles.whoRow, who.kind === 'self' && styles.whoSelected]}
                onPress={() => setWho({ kind: 'self' })}
              >
                <Text style={styles.whoText}>Eu mesmo(a)</Text>
              </TouchableOpacity>
            )}
            {who.kind === 'new' && (
              <View style={styles.newChildBox}>
                <Text style={styles.fieldLabel}>Nome completo *</Text>
                <TextInput
                  style={styles.input}
                  value={childName}
                  onChangeText={setChildName}
                  placeholder="Nome do catequizando"
                  placeholderTextColor={colors.textTertiary}
                />
                <Text style={styles.fieldLabel}>Nascimento (opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={childBirth}
                  onChangeText={(value) => setChildBirth(maskBirthDate(value))}
                  placeholder="DD/MM/AAAA"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={10}
                />
              </View>
            )}

            {selectedClass && (
              <>
                <Text style={styles.stepLabel}>3 · Documentos da turma</Text>
                {docReqs === null ? (
                  <Text style={styles.footNote}>Carregando o que a turma pede…</Text>
                ) : docReqs.length === 0 ? (
                  <Text style={styles.footNote}>
                    Não foi possível listar os documentos agora — dá para enviar depois pelo cartão da matrícula.
                  </Text>
                ) : (
                  <>
                    {docReqs.map((req) => {
                      const draft = docsDraft[req.kind];
                      return (
                        <View key={req.kind} style={styles.docReqRow}>
                          <Text style={styles.docReqName}>
                            {req.kind}
                            {req.required ? <Text style={styles.docReqRequired}> · obrigatório</Text> : null}
                          </Text>
                          {draft ? (
                            <View style={styles.docChosenRow}>
                              <Text style={styles.docChosenText} numberOfLines={1}>
                                {draftLabel(draft)}
                              </Text>
                              <TouchableOpacity
                                hitSlop={8}
                                onPress={() =>
                                  setDocsDraft((prev) => {
                                    const next = { ...prev };
                                    delete next[req.kind];
                                    return next;
                                  })
                                }
                              >
                                <Text style={styles.docRemove}>✕</Text>
                              </TouchableOpacity>
                            </View>
                          ) : (
                            <View style={styles.docBtnRow}>
                              <TouchableOpacity style={styles.docBtn} onPress={() => attachFileFor(req.kind)}>
                                <Text style={styles.docBtnText}>📎 Anexar</Text>
                              </TouchableOpacity>
                              {req.allowNotHave && (
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  onPress={() =>
                                    setDocsDraft((prev) => ({ ...prev, [req.kind]: { type: 'declaration', declaration: 'NOT_HAVE' } }))
                                  }
                                >
                                  <Text style={styles.docBtnText}>Não tenho</Text>
                                </TouchableOpacity>
                              )}
                              {req.allowOtherDenomination && (
                                <TouchableOpacity
                                  style={styles.docBtn}
                                  onPress={() => {
                                    setDenomText('');
                                    setDenomFor(req.kind);
                                  }}
                                >
                                  <Text style={styles.docBtnText}>Outra denominação</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    <Text style={styles.footNote}>
                      Os arquivos podem passar por conferência automática assistida por IA (provedor externo); a
                      decisão é sempre da equipe. O que faltar dá para enviar depois pelo cartão da matrícula.
                    </Text>
                  </>
                )}
              </>
            )}

            <Text style={styles.stepLabel}>4 · Consentimento</Text>
            <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((v) => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
                {consent && <Ionicons name="checkmark" size={15} color="#fff" />}
              </View>
              <Text style={styles.consentText}>
                Autorizo o tratamento dos dados pessoais do catequizando para a gestão da catequese
                (LGPD) — a equipe da turma terá acesso a nome, presença e documentos.
              </Text>
            </TouchableOpacity>

            <Text style={styles.imageConsentTitle}>📷 Uso de imagem</Text>
            <Text style={styles.imageConsentText}>
              Nos encontros, celebrações e eventos podem ser feitas fotos e vídeos, usados nos murais
              e nos canais de comunicação da paróquia. Escolha uma opção (a inscrição vale nos dois
              casos):
            </Text>
            <TouchableOpacity
              style={[styles.imageOption, imageConsent === true && styles.imageOptionOn]}
              activeOpacity={0.8}
              onPress={() => setImageConsent(true)}
            >
              <View style={[styles.radio, imageConsent === true && styles.radioOn]}>
                {imageConsent === true && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.imageOptionText}>
                <Text style={{ fontWeight: '700' }}>Autorizo</Text> o uso da imagem do catequizando
                pela paróquia
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.imageOption, imageConsent === false && styles.imageOptionOn]}
              activeOpacity={0.8}
              onPress={() => setImageConsent(false)}
            >
              <View style={[styles.radio, imageConsent === false && styles.radioOn]}>
                {imageConsent === false && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.imageOptionText}>
                <Text style={{ fontWeight: '700' }}>Não autorizo</Text> — a equipe será avisada para
                preservar o catequizando em fotos e vídeos
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
              onPress={() => void handleSubmit()}
            >
              <Text style={styles.primaryBtnText}>
                {submitting
                  ? 'Enviando...'
                  : selectedClass && selectedClass.acceptingMode === 'WAITLIST'
                    ? 'Entrar na fila de espera'
                    : 'Enviar inscrição'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footNote}>
              A matrícula fica aguardando a confirmação da coordenação. Sem batismo registrado, a
              certidão fica como pendência para levar à secretaria.
            </Text>
          </>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Batismo em outra denominação: informar qual */}
      <Modal visible={!!denomFor} transparent animationType="fade" onRequestClose={() => setDenomFor(null)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.denomOverlay} onPress={() => setDenomFor(null)}>
            <Pressable style={styles.denomSheet} onPress={() => {}}>
              <Text style={styles.denomTitle}>Batismo em outra denominação</Text>
              <Text style={styles.footNote}>
                Informe em qual igreja cristã o batismo foi realizado — a coordenação aceita ou recusa.
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 10 }]}
                placeholder="Ex.: Assembleia de Deus"
                placeholderTextColor={colors.textTertiary}
                value={denomText}
                onChangeText={setDenomText}
                maxLength={80}
                autoFocus
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmDenomination}>
                <Text style={styles.primaryBtnText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.denomCancel} onPress={() => setDenomFor(null)}>
                <Text style={styles.denomCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
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
    scroll: { padding: 16, paddingBottom: 40 },
    empty: { alignItems: 'center', gap: 12, marginTop: 48, paddingHorizontal: 24 },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    stepLabel: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 16,
      marginBottom: 8,
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
    filterChip: {
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.card,
    },
    filterChipOn: { borderColor: colors.primary, backgroundColor: `${colors.primary}15` },
    filterChipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    filterChipTextOn: { color: colors.primary },
    classCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 8,
    },
    classCardSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
    className: { fontSize: 15, fontWeight: '700', color: colors.text },
    classMeta: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
    classSpots: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 3 },
    whoRow: {
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 6,
    },
    whoSelected: { borderColor: colors.primary, backgroundColor: `${colors.primary}10` },
    whoText: { fontSize: 14.5, fontWeight: '600', color: colors.text },
    newChildBox: { marginTop: 4, marginBottom: 4, gap: 4 },
    fieldLabel: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary, marginTop: 6 },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.text,
      fontSize: 15,
      backgroundColor: colors.surface,
    },
    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    imageConsentTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 14 },
    imageConsentText: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 18, marginTop: 4, marginBottom: 8 },
    imageOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
      backgroundColor: colors.card,
    },
    imageOptionOn: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
    imageOptionText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: colors.primary },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 7,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    consentText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    footNote: { fontSize: 12, color: colors.textTertiary, marginTop: 10, lineHeight: 17 },
    docReqRow: {
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 6,
    },
    docReqName: { fontSize: 14, fontWeight: '700', color: colors.text },
    docReqRequired: { color: colors.error, fontSize: 12, fontWeight: '800' },
    docBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    docBtn: {
      borderWidth: 1.5,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    docBtnText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    docChosenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    docChosenText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.success },
    docRemove: { fontSize: 16, fontWeight: '800', color: colors.textSecondary, paddingHorizontal: 4 },
    denomOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    denomSheet: { backgroundColor: colors.card, borderRadius: 16, padding: 18 },
    denomTitle: { fontSize: 16.5, fontWeight: '800', color: colors.text },
    denomCancel: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
    denomCancelText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  });
