import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '@/hooks/useAuth';

export default function HomeScreen() {
  const { user } = useAuth();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Olá, {user?.fullName?.split(' ')[0]}!</Text>
        <Text style={styles.subtitle}>Bem-vindo ao Parish</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Acesso Rápido</Text>
        
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🙏 Liturgia Diária</Text>
          <Text style={styles.cardDescription}>Confira as leituras de hoje</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📅 Próximos Eventos</Text>
          <Text style={styles.cardDescription}>Veja o calendário da paróquia</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>✅ Minhas Escalas</Text>
          <Text style={styles.cardDescription}>Gerencie suas atividades</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#6200ee',
    padding: 24,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginTop: 4,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 14,
    color: '#666',
  },
});

