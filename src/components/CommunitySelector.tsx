import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PickerInput from './PickerInput';
import { Diocese, getDioceses } from '../services/churchService';
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
}

const CommunitySelector: React.FC<Props> = ({
  requireConsent = false,
  submitLabel,
  initialDioceseId,
  initialParishId,
  initialCommunityId,
  onSaved,
}) => {
  const { user, updateCommunity } = useAuth();
  const colors = useColors();
  const styles = createStyles(colors);

  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [dioceseId, setDioceseId] = useState(initialDioceseId);
  const [parishId, setParishId] = useState(initialParishId);
  const [communityId, setCommunityId] = useState(initialCommunityId);
  const [consent, setConsent] = useState(!requireConsent);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setDioceses(await getDioceses());
      } catch (e) {
        Alert.alert('Erro', 'Não foi possível carregar os dados da Igreja.');
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const parishes = useMemo(
    () => dioceses.find((d) => d.id === dioceseId)?.parishes ?? [],
    [dioceses, dioceseId],
  );
  const communities = useMemo(
    () => parishes.find((p) => p.id === parishId)?.communities ?? [],
    [parishes, parishId],
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
      await updateCommunity(communityId, true);
      onSaved?.();
    } catch (error: any) {
      Alert.alert('Erro', error?.message || 'Não foi possível salvar. Tente novamente.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando dados da Igreja…</Text>
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
        items={dioceses.map((d) => ({ label: d.name, value: d.id }))}
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
        items={parishes.map((p) => ({ label: p.name, value: p.id }))}
        placeholder="Selecione sua Paróquia"
        disabled={!dioceseId || parishes.length === 0}
      />

      <PickerInput
        label="Comunidade"
        icon="people"
        selectedValue={communityId || ''}
        onValueChange={setCommunityId}
        items={communities.map((c) => ({ label: c.name, value: c.id }))}
        placeholder="Selecione sua Comunidade"
        disabled={!parishId || communities.length === 0}
      />

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
