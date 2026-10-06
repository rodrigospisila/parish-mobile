import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PickerInput from './PickerInput';
import {
  TerritoryCommunity,
  TerritoryDiocese,
  TerritoryParish,
  getCommunityAncestors,
  listCommunities,
  listDioceses,
  listParishes,
} from '../services/churchService';
import { useAuth } from '../context/AuthContext';
import { useColors } from '../context/ThemeContext';

interface Props {
  /** Exige o aceite LGPD (usado no onboarding). No fluxo de troca, o usuário já consentiu. */
  requireConsent?: boolean;
  submitLabel: string;
  /** Valores iniciais (pré-seleção no fluxo de troca). */
  initialDioceseId?: string;
  initialParishId?: string;
  initialCommunityId?: string;
  /** Chamado após salvar com sucesso. No onboarding, o _layout navega sozinho. */
  onSaved?: () => void;
  /** Ação customizada ao confirmar (ex.: vincular secundária). Default: troca a comunidade principal. */
  onSubmit?: (communityId: string) => Promise<void>;
}

/** Estado de carga de cada nível da cascata */
type LevelState = 'idle' | 'loading' | 'ready' | 'error';

const CommunitySelector: React.FC<Props> = ({
  requireConsent = false,
  submitLabel,
  initialDioceseId,
  initialParishId,
  initialCommunityId,
  onSaved,
  onSubmit,
}) => {
  const { user, updateCommunity } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);

  const [dioceses, setDioceses] = useState<TerritoryDiocese[]>([]);
  const [parishes, setParishes] = useState<TerritoryParish[]>([]);
  const [communities, setCommunities] = useState<TerritoryCommunity[]>([]);
  const [diocesesState, setDiocesesState] = useState<LevelState>('loading');
  const [parishesState, setParishesState] = useState<LevelState>('idle');
  const [communitiesState, setCommunitiesState] = useState<LevelState>('idle');
  const [dioceseId, setDioceseId] = useState(initialDioceseId);
  const [parishId, setParishId] = useState(initialParishId);
  const [communityId, setCommunityId] = useState(initialCommunityId);
  const [consent, setConsent] = useState(!requireConsent);
  // Pré-seleção (troca de comunidade): resolve diocese/paróquia da comunidade atual
  const [ancestorsResolved, setAncestorsResolved] = useState(!initialCommunityId);
  const [submitting, setSubmitting] = useState(false);

  // Só a resposta da ÚLTIMA requisição de cada nível vale (trocas rápidas)
  const parishSeq = useRef(0);
  const communitySeq = useRef(0);

  const loadDioceses = useCallback(async () => {
    setDiocesesState('loading');
    try {
      setDioceses(await listDioceses());
      setDiocesesState('ready');
    } catch (e) {
      console.error(e);
      setDiocesesState('error');
    }
  }, []);

  const loadParishes = useCallback(async (forDioceseId?: string) => {
    const seq = ++parishSeq.current;
    setParishes([]);
    if (!forDioceseId) {
      setParishesState('idle');
      return;
    }
    setParishesState('loading');
    try {
      const data = await listParishes(forDioceseId);
      if (seq !== parishSeq.current) return;
      setParishes(data);
      setParishesState('ready');
    } catch (e) {
      if (seq !== parishSeq.current) return;
      console.error(e);
      setParishesState('error');
    }
  }, []);

  const loadCommunities = useCallback(async (forParishId?: string, forDioceseId?: string) => {
    const seq = ++communitySeq.current;
    setCommunities([]);
    if (!forParishId) {
      setCommunitiesState('idle');
      return;
    }
    setCommunitiesState('loading');
    try {
      const data = await listCommunities(forParishId, forDioceseId);
      if (seq !== communitySeq.current) return;
      setCommunities(data);
      setCommunitiesState('ready');
    } catch (e) {
      if (seq !== communitySeq.current) return;
      console.error(e);
      setCommunitiesState('error');
    }
  }, []);

  useEffect(() => {
    loadDioceses();
    // Cadastro antigo/gestor: diocese/paróquia do usuário podem não ser as da
    // comunidade — pergunta ao servidor de qual paróquia ela é (1 requisição)
    if (initialCommunityId) {
      getCommunityAncestors(initialCommunityId)
        .then((ancestors) => {
          if (ancestors) {
            setDioceseId(ancestors.dioceseId);
            setParishId(ancestors.parishId);
          }
        })
        .finally(() => setAncestorsResolved(true));
    }
  }, []);

  // Cada nível carrega quando o anterior é escolhido
  useEffect(() => {
    if (!ancestorsResolved) return;
    loadParishes(dioceseId);
  }, [dioceseId, ancestorsResolved, loadParishes]);

  useEffect(() => {
    if (!ancestorsResolved) return;
    loadCommunities(parishId, dioceseId);
    // dioceseId só serve ao servidor antigo; trocar a diocese já zera a paróquia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, ancestorsResolved, loadCommunities]);

  /** Aviso de falha com "Tentar de novo" — sem ele o assistente prendia o usuário */
  const renderRetry = (message: string, onRetry: () => void) => (
    <View style={styles.errorBox}>
      <Ionicons name="cloud-offline-outline" size={18} color={colors.error} />
      <Text style={styles.errorText}>{message}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
        <Text style={styles.retryText}>Tentar de novo</Text>
      </TouchableOpacity>
    </View>
  );

  const canSubmit = !!dioceseId && !!parishId && !!communityId && consent;

  const handleSave = async () => {
    if (!dioceseId || !parishId || !communityId) {
      Alert.alert('Atenção', 'Selecione sua Diocese, Paróquia e Comunidade.');
      return;
    }
    if (requireConsent && !consent) {
      Alert.alert('Consentimento necessário', 'Autorize o tratamento dos seus dados pessoais para continuar.');
      return;
    }
    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado.');
      return;
    }
    setSubmitting(true);
    try {
      if (onSubmit) {
        await onSubmit(communityId);
      } else {
        await updateCommunity(communityId, true);
      }
      onSaved?.();
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível salvar. Tente novamente.');
      setSubmitting(false);
    }
  };

  if (diocesesState === 'loading' || !ancestorsResolved) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando dados da Igreja…</Text>
      </View>
    );
  }

  if (diocesesState === 'error') {
    return (
      <View style={styles.card}>
        {renderRetry('Não foi possível carregar as dioceses. Confira sua internet.', loadDioceses)}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <PickerInput
        label="Diocese"
        icon="business"
        selectedValue={dioceseId || ''}
        onValueChange={(v) => {
          setDioceseId(v);
          setParishId(undefined);
          setCommunityId(undefined);
        }}
        items={dioceses.map((d) => ({ label: d.state ? `${d.name} (${d.state})` : d.name, value: d.id }))}
        placeholder="Selecione sua Diocese"
      />

      <PickerInput
        label="Paróquia"
        icon="location"
        selectedValue={parishId || ''}
        onValueChange={(v) => {
          setParishId(v);
          setCommunityId(undefined);
        }}
        items={parishes.map((p) => ({ label: p.city ? `${p.name} — ${p.city}` : p.name, value: p.id }))}
        placeholder={parishesState === 'loading' ? 'Carregando paróquias…' : 'Selecione sua Paróquia'}
        disabled={!dioceseId || parishesState !== 'ready' || parishes.length === 0}
      />
      {parishesState === 'error' &&
        renderRetry('Não foi possível carregar as paróquias desta diocese.', () => loadParishes(dioceseId))}
      {parishesState === 'ready' && parishes.length === 0 && (
        <Text style={styles.hint}>Nenhuma paróquia cadastrada nesta diocese.</Text>
      )}

      <PickerInput
        label="Comunidade"
        icon="people"
        selectedValue={communityId || ''}
        onValueChange={setCommunityId}
        items={communities.map((c) => ({ label: c.name, value: c.id }))}
        placeholder={communitiesState === 'loading' ? 'Carregando comunidades…' : 'Selecione sua Comunidade'}
        disabled={!parishId || communitiesState !== 'ready' || communities.length === 0}
      />
      {communitiesState === 'error' &&
        renderRetry('Não foi possível carregar as comunidades desta paróquia.', () =>
          loadCommunities(parishId, dioceseId),
        )}
      {communitiesState === 'ready' && communities.length === 0 && (
        <Text style={styles.hint}>Nenhuma comunidade cadastrada nesta paróquia.</Text>
      )}

      {requireConsent && (
        <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((v) => !v)} activeOpacity={0.8}>
          <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
            {consent && <Ionicons name="checkmark" size={15} color="#fff" />}
          </View>
          <Text style={styles.consentText}>
            Autorizo o tratamento dos meus dados pessoais para fins de gestão paroquial (LGPD).
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.button, !canSubmit && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={submitting || !canSubmit}
        activeOpacity={0.85}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.buttonText}>{submitLabel}</Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    loading: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    loadingText: { marginTop: 12, color: colors.textSecondary },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.borderLight,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    errorBox: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      padding: 12,
      marginTop: -4,
      marginBottom: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.error,
      backgroundColor: colors.card,
    },
    errorText: { flex: 1, minWidth: 160, fontSize: 13, color: colors.text, lineHeight: 18 },
    retryButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.primary,
    },
    retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
    hint: { fontSize: 13, color: colors.textSecondary, marginTop: -4, marginBottom: 12 },
    consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 6, marginBottom: 4 },
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
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      marginTop: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    buttonDisabled: { backgroundColor: colors.disabled, shadowOpacity: 0, elevation: 0 },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  });

export default CommunitySelector;
