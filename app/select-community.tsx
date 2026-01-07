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
import { Stack } from 'expo-router';
import PickerInput from '../src/components/PickerInput';
import { Diocese, getDioceses } from '../src/services/churchService';
import { useAuth } from '../src/context/AuthContext';
import { useColors } from '../src/context/ThemeContext';
import { authService } from '../src/services/authService';

export default function SelectCommunityScreen() {
  const { user, updateUser } = useAuth();
  const colors = useColors();
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [selectedDioceseId, setSelectedDioceseId] = useState<string | undefined>(undefined);
  const [selectedParishId, setSelectedParishId] = useState<string | undefined>(undefined);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Carregar Dioceses
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

  // Lógica de filtragem hierárquica
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

  const handleSaveCommunity = async () => {
    if (!selectedDioceseId || !selectedParishId || !selectedCommunityId) {
      Alert.alert('Erro', 'Por favor, selecione sua Diocese, Paróquia e Comunidade.');
      return;
    }

    if (!user) {
      Alert.alert('Erro', 'Usuário não autenticado.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Chamar o serviço para atualizar o communityId no backend
      await authService.updateCommunity(user.id, selectedCommunityId);

      // 2. Atualizar o contexto localmente - a navegação será feita automaticamente pelo _layout.tsx
      updateUser({ ...user, communityId: selectedCommunityId });
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar sua comunidade. Tente novamente.');
      console.error(error);
      setIsSubmitting(false);
    }
  };

  const styles = createStyles(colors);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando dados da Igreja...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Selecione sua Comunidade', headerShown: false }} />

      <View style={styles.header}>
        <Text style={styles.title}>Bem-vindo(a)!</Text>
        <Text style={styles.subtitle}>Para continuar, selecione sua comunidade:</Text>
      </View>

      <View style={styles.form}>
        <PickerInput
          label="Diocese"
          selectedValue={selectedDioceseId}
          onValueChange={handleDioceseChange}
          items={dioceses.map((d) => ({ label: d.name, value: d.id }))}
          placeholder="Selecione sua Diocese"
        />

        <PickerInput
          label="Paróquia"
          selectedValue={selectedParishId}
          onValueChange={handleParishChange}
          items={availableParishes.map((p) => ({ label: p.name, value: p.id }))}
          placeholder="Selecione sua Paróquia"
          disabled={!selectedDioceseId || availableParishes.length === 0}
        />

        <PickerInput
          label="Comunidade"
          selectedValue={selectedCommunityId}
          onValueChange={handleCommunityChange}
          items={availableCommunities.map((c) => ({ label: c.name, value: c.id }))}
          placeholder="Selecione sua Comunidade"
          disabled={!selectedParishId || availableCommunities.length === 0}
        />

        <TouchableOpacity
          style={[styles.button, isSubmitting && styles.buttonDisabled]}
          onPress={handleSaveCommunity}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Salvar Comunidade</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      padding: 20,
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 10,
      color: colors.textSecondary,
    },
    header: {
      marginBottom: 30,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      marginBottom: 10,
      textAlign: 'center',
      color: colors.text,
    },
    subtitle: {
      fontSize: 16,
      textAlign: 'center',
      color: colors.textSecondary,
    },
    form: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 20,
    },
    buttonDisabled: {
      backgroundColor: colors.disabled,
    },
    buttonText: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: '600',
    },
  });
