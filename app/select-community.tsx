import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import ChurchPicker from '../src/components/ChurchPicker'; // Usando o nome ChurchPicker
import { Diocese, Parish, Community, getDioceses } from '../src/services/churchService';
import { useAuth } from '../src/context/AuthContext';
import { authService } from '../src/services/authService';

export default function SelectCommunityScreen() {
  const { user, updateUser } = useAuth();
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
      
      // 2. Atualizar o contexto localmente
      updateUser({ ...user, communityId: selectedCommunityId });
      
      // 3. Redirecionar para a Home
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar sua comunidade. Tente novamente.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0000ff" />
        <Text style={{ marginTop: 10 }}>Carregando dados da Igreja...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Selecione sua Comunidade', headerLeft: () => null }} />
      <Text style={styles.title}>Bem-vindo(a)!</Text>
      <Text style={styles.subtitle}>Para continuar, selecione sua comunidade:</Text>

      <ChurchPicker
        label="Diocese"
        selectedValue={selectedDioceseId}
        onValueChange={handleDioceseChange}
        items={dioceses.map((d) => ({ label: d.name, value: d.id }))}
        placeholder="Selecione sua Diocese"
      />

      <ChurchPicker
        label="Paróquia"
        selectedValue={selectedParishId}
        onValueChange={handleParishChange}
        items={availableParishes.map((p) => ({ label: p.name, value: p.id }))}
        placeholder="Selecione sua Paróquia"
        disabled={!selectedDioceseId || availableParishes.length === 0}
      />

      <ChurchPicker
        label="Comunidade"
        selectedValue={selectedCommunityId}
        onValueChange={handleCommunityChange}
        items={availableCommunities.map((c) => ({ label: c.name, value: c.id }))}
        placeholder="Selecione sua Comunidade"
        disabled={!selectedParishId || availableCommunities.length === 0}
      />

      <Button title={isSubmitting ? 'Salvando...' : 'Salvar Comunidade'} onPress={handleSaveCommunity} disabled={isSubmitting} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#666',
  },
});
