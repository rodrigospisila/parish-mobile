import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useCommunity } from '../../src/context/CommunityContext';
import {
  CatechesisOpenClass,
  MyDependent,
  applyCatechesis,
  getCatechesisOpenClasses,
  getMyDependents,
} from '../../src/services/catechesisService';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

type Who = { kind: 'self' } | { kind: 'dependent'; id: string; name: string } | { kind: 'new' };

/** Inscrição online na catequese (responsável ou o próprio adulto). */
export default function CatechesisApplyScreen() {
  const router = useRouter();
  const colors = useColors();
  const { activeCommunityId } = useCommunity();
  const styles = createStyles(colors);

  const [classes, setClasses] = useState<CatechesisOpenClass[]>([]);
  const [dependents, setDependents] = useState<MyDependent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedClass, setSelectedClass] = useState<CatechesisOpenClass | null>(null);
  const [who, setWho] = useState<Who>({ kind: 'self' });
  const [childName, setChildName] = useState('');
  const [childBirth, setChildBirth] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [openClasses, myDependents] = await Promise.all([
        getCatechesisOpenClasses(activeCommunityId),
        getMyDependents().catch(() => [] as MyDependent[]),
      ]);
      setClasses(openClasses);
      setDependents(myDependents);
    } catch (error) {
      console.error('Erro ao carregar turmas abertas:', error);
      setClasses([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeCommunityId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const handleSubmit = async () => {
    if (!selectedClass) {
      Alert.alert('Escolha a turma', 'Toque numa turma para selecionar.');
      return;
    }
    if (who.kind === 'new') {
      if (childName.trim().length < 5) {
        Alert.alert('Nome do catequizando', 'Informe o nome completo.');
        return;
      }
      if (childBirth.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(childBirth.trim())) {
        Alert.alert('Data de nascimento', 'Use o formato AAAA-MM-DD (ou deixe em branco).');
        return;
      }
    }
    if (!consent) {
      Alert.alert(
        'Consentimento necessário',
        'Autorize o tratamento dos dados do catequizando para concluir a inscrição.',
      );
      return;
    }
    setSubmitting(true);
    try {
      await applyCatechesis({
        classId: selectedClass.classId,
        forMemberId: who.kind === 'dependent' ? who.id : undefined,
        newChild:
          who.kind === 'new'
            ? { fullName: childName.trim(), birthDate: childBirth.trim() || undefined }
            : undefined,
        consentGiven: true,
      });
      Alert.alert(
        'Inscrição enviada ✓',
        'A coordenação da catequese vai confirmar a matrícula — você recebe o aviso por aqui.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (error: any) {
      Alert.alert('Não foi possível inscrever', error?.message ?? 'Tente novamente.');
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
        <Text style={styles.headerTitle}>Inscrição na catequese</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
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
            {classes.map((klass) => {
              const full = klass.openSpots !== null && klass.openSpots <= 0;
              const selected = selectedClass?.classId === klass.classId;
              return (
                <TouchableOpacity
                  key={klass.classId}
                  style={[styles.classCard, selected && styles.classCardSelected, full && { opacity: 0.55 }]}
                  disabled={full}
                  activeOpacity={0.85}
                  onPress={() => setSelectedClass(klass)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.className} numberOfLines={1}>
                      {klass.stage.name} · {klass.name}
                    </Text>
                    <Text style={styles.classMeta} numberOfLines={1}>
                      {klass.weekday !== null && klass.weekday !== undefined
                        ? `${WEEKDAYS[klass.weekday]}`
                        : ''}
                      {klass.time ? ` às ${klass.time}` : ''}
                      {klass.room ? ` · ${klass.room}` : ''}
                    </Text>
                    <Text style={styles.classSpots}>
                      {full
                        ? 'Sem vagas'
                        : klass.openSpots === null
                          ? 'Vagas abertas'
                          : `${klass.openSpots} vaga${klass.openSpots === 1 ? '' : 's'}`}
                    </Text>
                  </View>
                  {selected && <FontAwesome5 name="check-circle" size={18} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}

            <Text style={styles.stepLabel}>2 · Quem vai participar</Text>
            <TouchableOpacity
              style={[styles.whoRow, who.kind === 'self' && styles.whoSelected]}
              onPress={() => setWho({ kind: 'self' })}
            >
              <Text style={styles.whoText}>Eu mesmo(a)</Text>
            </TouchableOpacity>
            {dependents.map((dependent) => (
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
            <TouchableOpacity
              style={[styles.whoRow, who.kind === 'new' && styles.whoSelected]}
              onPress={() => setWho({ kind: 'new' })}
            >
              <Text style={styles.whoText}>＋ Cadastrar filho(a)</Text>
            </TouchableOpacity>
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
                <Text style={styles.fieldLabel}>Nascimento (AAAA-MM-DD, opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={childBirth}
                  onChangeText={setChildBirth}
                  placeholder="2017-05-10"
                  placeholderTextColor={colors.textTertiary}
                  autoCapitalize="none"
                />
              </View>
            )}

            <Text style={styles.stepLabel}>3 · Consentimento</Text>
            <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((v) => !v)} activeOpacity={0.8}>
              <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
                {consent && <Ionicons name="checkmark" size={15} color="#fff" />}
              </View>
              <Text style={styles.consentText}>
                Autorizo o tratamento dos dados pessoais do catequizando para a gestão da catequese
                (LGPD) — a equipe da turma terá acesso a nome, presença e documentos.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
              onPress={() => void handleSubmit()}
            >
              <Text style={styles.primaryBtnText}>
                {submitting ? 'Enviando...' : 'Enviar inscrição'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.footNote}>
              A matrícula fica aguardando a confirmação da coordenação. Sem batismo registrado, a
              certidão fica como pendência para levar à secretaria.
            </Text>
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
  });
