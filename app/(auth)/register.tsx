import { Stack, Link } from 'expo-router';
import React, { useState } from 'react';
import { View, Text, StyleSheet, Button, Alert, ScrollView } from 'react-native';
import TextInput from '../../../src/components/TextInput';
import { useAuth } from '../../../src/context/AuthContext';

export default function RegisterScreen() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    try {
      // O registro agora é simplificado, sem os IDs de igreja
      await register({ name, email, password });
    } catch (error) {
      Alert.alert('Erro no Registro', 'Não foi possível completar o cadastro. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'Criar Conta' }} />
      <Text style={styles.title}>Criar Conta</Text>

      <TextInput label="Nome Completo" value={name} onChangeText={setName} placeholder="Seu nome" />
      <TextInput label="Email" value={email} onChangeText={setEmail} placeholder="seu@email.com" keyboardType="email-address" autoCapitalize="none" />
      <TextInput label="Senha" value={password} onChangeText={setPassword} placeholder="Sua senha" secureTextEntry />

      <Button title={loading ? "Registrando..." : "Registrar"} onPress={handleRegister} disabled={loading} />

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
