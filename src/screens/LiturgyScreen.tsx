import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react';
import api from '../services/api';

interface LiturgyData {
  date: string;
  liturgy: string;
  liturgicalColor: string;
  firstReading: {
    title: string;
    text: string;
    reference: string;
  };
  psalm: {
    title: string;
    text: string;
    reference: string;
  };
  secondReading?: {
    title: string;
    text: string;
    reference: string;
  };
  gospel: {
    title: string;
    text: string;
    reference: string;
  };
}

export default function LiturgyScreen() {
  const [liturgy, setLiturgy] = useState<LiturgyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadLiturgy();
  }, []);

  async function loadLiturgy() {
    try {
      const response = await api.get('/liturgy/today');
      setLiturgy(response.data);
    } catch (error) {
      console.error('Erro ao carregar liturgia:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function onRefresh() {
    setRefreshing(true);
    loadLiturgy();
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6B46C1" />
      </View>
    );
  }

  if (!liturgy) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Não foi possível carregar a liturgia</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.date}>{new Date().toLocaleDateString('pt-BR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}</Text>
        <Text style={styles.liturgyTitle}>{liturgy.liturgy}</Text>
        <View style={[styles.colorBadge, { backgroundColor: getColorCode(liturgy.liturgicalColor) }]}>
          <Text style={styles.colorText}>{liturgy.liturgicalColor}</Text>
        </View>
      </View>

      <View style={styles.content}>
        <ReadingSection
          title={liturgy.firstReading.title}
          reference={liturgy.firstReading.reference}
          text={liturgy.firstReading.text}
        />

        <ReadingSection
          title={liturgy.psalm.title}
          reference={liturgy.psalm.reference}
          text={liturgy.psalm.text}
        />

        {liturgy.secondReading && (
          <ReadingSection
            title={liturgy.secondReading.title}
            reference={liturgy.secondReading.reference}
            text={liturgy.secondReading.text}
          />
        )}

        <ReadingSection
          title={liturgy.gospel.title}
          reference={liturgy.gospel.reference}
          text={liturgy.gospel.text}
          isGospel
        />
      </View>
    </ScrollView>
  );
}

function ReadingSection({ title, reference, text, isGospel = false }: any) {
  return (
    <View style={[styles.section, isGospel && styles.gospelSection]}>
      <Text style={[styles.sectionTitle, isGospel && styles.gospelTitle]}>
        {title}
      </Text>
      <Text style={styles.reference}>{reference}</Text>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

function getColorCode(color: string): string {
  const colors: { [key: string]: string } = {
    'Verde': '#10B981',
    'Roxo': '#8B5CF6',
    'Branco': '#F3F4F6',
    'Vermelho': '#EF4444',
    'Rosa': '#EC4899',
  };
  return colors[color] || '#6B7280';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#6B46C1',
    padding: 24,
    paddingTop: 48,
  },
  date: {
    fontSize: 14,
    color: '#E9D5FF',
    marginBottom: 8,
    textTransform: 'capitalize',
  },
  liturgyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  colorBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  colorText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6B46C1',
  },
  gospelSection: {
    backgroundColor: '#FEF3C7',
    borderLeftColor: '#F59E0B',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6B46C1',
    marginBottom: 4,
  },
  gospelTitle: {
    color: '#F59E0B',
  },
  reference: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  text: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
});

