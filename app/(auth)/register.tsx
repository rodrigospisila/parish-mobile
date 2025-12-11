'''import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import TextInput from '../../src/components/TextInput';
import PickerInput from '../../src/components/PickerInput';
import { churchService, Diocese, Parish, Community } from '../../src/services/churchService';
import { authService } from '../../src/services/authService';
import { useAuth } from '../../src/context/AuthContext';

export default function RegisterScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [dioceses, setDioceses] = useState<Diocese[]>([]);
  const [selectedDioceseId, setSelectedDioceseId] = useState<number | undefined>(undefined);
  const [selectedParishId, setSelectedParishId] = useState<number | undefined>(undefined);
  const [selectedCommunityId, setSelectedCommunityId] = useState<number | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadDioceses = async () => {
      try {
        const data = await churchService.getDioceses();
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

  const handleDioceseChange = (value: number | string) => {
    const id = typeof value === 'string' ? parseInt(value, 10) : value;
    setSelectedDioceseId(id);
    setSelectedParishId(undefined);
    setSelectedCommunityId(undefined);
  };

  const handleParishChange = (value: number | string) => {
    const id = typeof value === 'string' ? parseInt(value, 10) : value;
    setSelectedParishId(id);
    setSelectedCommunityId(undefined);
  };

  const handleRegister = async () => {
    if (!email || !password || !name || !selectedDioceseId || !selectedParishId || !selectedCommunityId) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos e selecione sua comunidade.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await authService.register({
        email,
        password,
        name,
        dioceseId: selectedDioceseId,
        parishId: selectedParishId,
        communityId: selectedCommunityId,
      });
      
      // Assumindo que o serviço de registro retorna o token
      await signIn(user.token);
      router.replace('/(tabs)');
    } catch (error) {
      Alert.alert('Erro no Registro', 'Não foi possível completar o seu registro. Tente novamente.');
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
      <Text style={styles.title}>Criar Conta</Text>

      <TextInput
        label="Nome Completo"
        value={name}
        onChangeText={setName}
        placeholder="Seu nome"
        autoCapitalize="words"
      />
      <TextInput
        label="Email"
        value={email}
        onChangeText={setEmail}
        placeholder="seu@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        label="Senha"
        value={password}
        onChangeText={setPassword}
        placeholder="Sua senha"
        secureTextEntry
      />

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
        disabled={!selectedDioceseId}
      />

      <PickerInput
        label="Comunidade"
        selectedValue={selectedCommunityId}
        onValueChange={(value) => setSelectedCommunityId(typeof value === 'string' ? parseInt(value, 10) : value)}
        items={availableCommunities.map((c) => ({ label: c.name, value: c.id }))}
        placeholder="Selecione sua Comunidade"
        disabled={!selectedParishId}
      />

      <Button title={isSubmitting ? 'Registrando...' : 'Registrar'} onPress={handleRegister} disabled={isSubmitting} />

      <Link href="/(auth)/login" style={styles.link}>
        Já tem conta? Faça Login
      </Link>
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
    marginBottom: 30,
    textAlign: 'center',
  },
  link: {
    marginTop: 20,
    color: 'blue',
    textAlign: 'center',
  },
});
'''
