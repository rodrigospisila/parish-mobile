import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/context/ThemeContext';
import { getNextMass, Event } from '../../src/services/eventService';
import { formatDateTimeBR } from '../../src/utils/dateUtils';

export default function HomeScreen() {
  const { user } = useAuth();
  const colors = useColors();
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

  const styles = createStyles(colors);

  const renderNextMass = () => {
    if (isLoading) {
      return <ActivityIndicator size="small" color={colors.primary} />;
    }

    if (!nextMass) {
      return <Text style={styles.infoText}>Nenhuma missa programada para sua comunidade.</Text>;
    }

    return (
      <View style={styles.massCard}>
        <Text style={styles.massTitle}>{nextMass.title}</Text>
        <Text style={styles.massDetail}>Data: {formatDateTimeBR(nextMass.date)}</Text>
        <Text style={styles.massDetail}>Local: {nextMass.location}</Text>
        <View style={styles.typeBadge}>
          <Text style={styles.typeBadgeText}>{nextMass.type}</Text>
        </View>
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
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 30,
      color: colors.text,
      textAlign: 'center',
    },
    card: {
      width: '100%',
      padding: 15,
      borderRadius: 12,
      backgroundColor: colors.card,
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
      borderBottomColor: colors.borderLight,
      paddingBottom: 8,
      color: colors.text,
    },
    massCard: {
      marginTop: 5,
    },
    massTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 8,
      color: colors.text,
    },
    massDetail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    typeBadge: {
      alignSelf: 'flex-start',
      backgroundColor: colors.eventMissa,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      marginTop: 8,
    },
    typeBadgeText: {
      color: colors.textInverse,
      fontSize: 12,
      fontWeight: '600',
    },
    infoText: {
      fontSize: 16,
      color: colors.textTertiary,
      textAlign: 'center',
      paddingVertical: 10,
    },
  });
