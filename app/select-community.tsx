import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import PickerInput from '../src/components/PickerInput';
import { Diocese, getDioceses } from '../src/services/churchService';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';

export default function SelectCommunityScreen() {
  const { user, updateCommunity } = useAuth();
  const colors = useColors();
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [selectedDioceseId, setSelectedDioceseId] = useState<string | undefined>(undefined);
  const [selectedParishId, setSelectedParishId] = useState<string | undefined>(undefined);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | undefined>(undefined);
  const [consentGiven, setConsentGiven] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadDioceses = async () => {
      try {
        const data = await getDioceses();
        setDioceses(data);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar os dados da Igreja.');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };
    loadDioceses();
  }, []);

  const availableParishes = useMemo(() => {
    const diocese = dioceses.find((d) => d.id === selectedDioceseId);
    return diocese ? diocese.parishes : [];
  }, [dioceses, selectedDioceseId]);

  const availableCommunities = useMemo(() => {
    const parish = availableParishes.find((p) => p.id === selectedParishId);
    return parish ? parish.communities : [];
  }, [availableParishes, selectedParishId]);

  const handleDioceseChange = (value: string) => {
    setSelectedDioceseId(value);
    setSelectedParishId(undefined);
    setSelectedCommunityId(undefined);
  };

  const handleParishChange = (value: string) => {
    setSelectedParishId(value);
    setSelectedCommunityId(undefined);
  };

  const handleCommunityChange = (value: string) => {
    setSelectedCommunityId(value);
  };

  const firstName = (user?.name || '').trim().split(/\s+/)[0] || '';
  const canSubmit = !!selectedDioceseId && !!selectedParishId && !!selectedCommunityId && consentGiven;

  const handleSaveCommunity = async () => {
    if (!selectedDioceseId || !selectedParishId || !selectedCommunityId) {
      Alert.alert('Atenção', 'Selecione sua Diocese, Paróquia e Comunidade.');
      return;
    }
    if (!consentGiven) {
      Alert.alert('Consentimento necessário', 'Para continuar, autorize o tratamento dos seus dados pessoais.');
      return;
    }
    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado.');
      return;
    }

    setIsSubmitting(true);
    try {
      // updateCommunity atualiza no backend + contexto; o _layout.tsx navega.
      await updateCommunity(selectedCommunityId, consentGiven);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível salvar sua comunidade. Tente novamente.');
      console.error(error);
      setIsSubmitting(false);
    }
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando dados da Igreja…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: 'Selecione sua Comunidade', headerShown: false }} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* HERO */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <FontAwesome5 name="church" size={26} color="#fff" />
          </View>
          <Text style={styles.heroTitle}>
            {firstName ? `Bem-vindo(a), ${firstName}!` : 'Bem-vindo(a)!'}
          </Text>
          <Text style={styles.heroSubtitle}>
            Vamos configurar sua conta. Selecione onde você participa.
          </Text>
        </LinearGradient>

        {/* FORM */}
        <View style={styles.card}>
          <PickerInput
            label="Diocese"
            icon="business"
            selectedValue={selectedDioceseId || ''}
            onValueChange={handleDioceseChange}
            items={dioceses.map((d) => ({ label: d.name, value: d.id }))}
            placeholder="Selecione sua Diocese"
          />

          <PickerInput
            label="Paróquia"
            icon="location"
            selectedValue={selectedParishId || ''}
            onValueChange={handleParishChange}
            items={availableParishes.map((p) => ({ label: p.name, value: p.id }))}
            placeholder="Selecione sua Paróquia"
            disabled={!selectedDioceseId || availableParishes.length === 0}
          />

          <PickerInput
            label="Comunidade"
            icon="people"
            selectedValue={selectedCommunityId || ''}
            onValueChange={handleCommunityChange}
            items={availableCommunities.map((c) => ({ label: c.name, value: c.id }))}
            placeholder="Selecione sua Comunidade"
            disabled={!selectedParishId || availableCommunities.length === 0}
          />

          <TouchableOpacity
            style={styles.consentRow}
            onPress={() => setConsentGiven((value) => !value)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, consentGiven && styles.checkboxChecked]}>
              {consentGiven && <Ionicons name="checkmark" size={15} color="#fff" />}
            </View>
            <Text style={styles.consentText}>
              Autorizo o tratamento dos meus dados pessoais para fins de gestão paroquial (LGPD).
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSaveCommunity}
            disabled={isSubmitting || !canSubmit}
            activeOpacity={0.85}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.buttonText}>Salvar e continuar</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.footerRow}>
          <Ionicons name="lock-closed" size={12} color={colors.textTertiary} />
          <Text style={styles.footerHint}>
            Você pode alterar isso depois em Perfil.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    scroll: { flexGrow: 1, padding: 20, paddingTop: 16 },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: { marginTop: 12, color: colors.textSecondary },

    hero: {
      borderRadius: 20,
      paddingVertical: 28,
      paddingHorizontal: 22,
      alignItems: 'center',
      marginBottom: 18,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 6,
    },
    heroIcon: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.4)',
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: '#fff',
      textAlign: 'center',
    },
    heroSubtitle: {
      fontSize: 14.5,
      color: 'rgba(255,255,255,0.9)',
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 20,
    },

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

    consentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginTop: 6,
      marginBottom: 4,
    },
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
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    consentText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 19,
    },

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
    buttonDisabled: {
      backgroundColor: colors.disabled,
      shadowOpacity: 0,
      elevation: 0,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },

    footerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 18,
    },
    footerHint: {
      fontSize: 12.5,
      color: colors.textTertiary,
      textAlign: 'center',
    },
  });
