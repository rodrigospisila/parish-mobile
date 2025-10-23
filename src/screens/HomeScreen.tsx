import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen({ navigation }: any) {
  const { user } = useAuth();

  const menuItems = [
    { title: 'Liturgia Diária', icon: '📖', screen: 'Liturgy', color: '#6B46C1' },
    { title: 'Eventos', icon: '📅', screen: 'Events', color: '#10B981' },
    { title: 'Escalas', icon: '👥', screen: 'Schedules', color: '#F59E0B' },
    { title: 'Pedidos de Oração', icon: '🙏', screen: 'PrayerRequests', color: '#EF4444' },
    { title: 'Intenções de Missa', icon: '⛪', screen: 'MassIntentions', color: '#8B5CF6' },
    { title: 'Horários de Missa', icon: '🕐', screen: 'MassSchedules', color: '#3B82F6' },
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Olá, {user?.fullName?.split(' ')[0]}!</Text>
        <Text style={styles.subtitle}>Bem-vindo ao Parish</Text>
      </View>

      <View style={styles.grid}>
        {menuItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={[styles.card, { backgroundColor: item.color }]}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Text style={styles.cardIcon}>{item.icon}</Text>
            <Text style={styles.cardTitle}>{item.title}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Avisos Recentes</Text>
        <View style={styles.newsCard}>
          <Text style={styles.newsTitle}>Bem-vindo ao Parish!</Text>
          <Text style={styles.newsText}>
            Este é o seu aplicativo para acompanhar a vida da comunidade.
          </Text>
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
    backgroundColor: '#6B46C1',
    padding: 24,
    paddingTop: 48,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#E9D5FF',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 16,
  },
  card: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 16,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  newsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  newsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  newsText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
});

