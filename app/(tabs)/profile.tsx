import React from 'react';
import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Stack } from 'expo-router';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Sair',
          onPress: signOut,
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Meu Perfil', headerShown: true }} />
      
      <View style={styles.header}>
        <Text style={styles.title}>Perfil do Usuário</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nome:</Text>
        <Text style={styles.value}>{user?.name || 'Não informado'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>E-mail:</Text>
        <Text style={styles.value}>{user?.email || 'Não informado'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Comunidade ID:</Text>
        <Text style={styles.value}>{user?.communityId || 'Nenhuma selecionada'}</Text>
      </View>

      <View style={styles.signOutContainer}>
        <Button title="Sair da Conta" onPress={handleSignOut} color="#FF3B30" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  header: {
    marginBottom: 30,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 18,
    color: '#333',
  },
  signOutContainer: {
    marginTop: 30,
  },
});
