import React, { useEffect, useState } from 'react';
import { View, Text, Button, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { getNextMass, Event } from '../../src/services/eventService';
import { formatDateTime } from '../../src/utils/dateUtils';

export default function HomeScreen() {
  const { signOut, user } = useAuth();
  const [nextMass, setNextMass] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user?.communityId) {
      const loadNextMass = async () => {
        setIsLoading(true);
        try {
          const mass = await getNextMass(user.communityId);
          setNextMass(mass);
        } catch (error) {
          console.error('Erro ao carregar próxima missa:', error);
        } finally {
          setIsLoading(false);
        }
      };
      loadNextMass();
    }
  }, [user?.communityId]);

  const renderNextMass = () => {
    if (isLoading) {
      return <ActivityIndicator size="small" color="#0000ff" />;
    }

    if (!nextMass) {
      return <Text style={styles.infoText}>Nenhuma missa programada para sua comunidade.</Text>;
    }

    return (
      <View style={styles.massCard}>
        <Text style={styles.massTitle}>{nextMass.title}</Text>
        <Text style={styles.massDetail}>Data: {formatDateTime(nextMass.date)}</Text>
        <Text style={styles.massDetail}>Local: {nextMass.location}</Text>
        <Text style={styles.massDetail}>Tipo: {nextMass.type}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bem-vindo(a), {user?.name}!</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Próxima Missa</Text>
        {renderNextMass()}
      </View>

      <Button title="Sair" onPress={signOut} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  card: {
    width: '100%',
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  massCard: {
    marginTop: 5,
  },
  massTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  massDetail: {
    fontSize: 14,
    color: '#555',
  },
  infoText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 10,
  }
});
