import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useCommunity } from '../../src/context/CommunityContext';
import { useColors } from '../../src/context/ThemeContext';
import { Pastoral, Member, getPastorals } from '../../src/services/pastoralService';

export default function PastoralsScreen() {
  const { user } = useAuth();
  const colors = useColors();
  const [pastorals, setPastorals] = useState<Pastoral[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPastoral, setSelectedPastoral] = useState<Pastoral | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const { activeCommunityId } = useCommunity();
  const communityId = activeCommunityId ?? user?.communityId;

  // Carregar Pastorais
  useEffect(() => {
    if (!communityId) {
      setIsLoading(false);
      return;
    }

    const loadPastorals = async () => {
      setIsLoading(true);
      try {
        const data = await getPastorals(communityId);
        setPastorals(data);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar as pastorais.');
        console.error(error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPastorals();
  }, [communityId]);

  const openPastoralDetails = (pastoral: Pastoral) => {
    setSelectedPastoral(pastoral);
    setIsModalVisible(true);
  };

  const closePastoralDetails = () => {
    setIsModalVisible(false);
    setSelectedPastoral(null);
  };

  const styles = createStyles(colors);

  // Cores para os ícones das pastorais
  const pastoralColors = [
    colors.eventMissa,
    colors.eventReuniao,
    colors.eventAtividade,
    colors.primary,
    colors.highlight,
  ];

  const getPastoralColor = (index: number) => {
    return pastoralColors[index % pastoralColors.length];
  };

  const renderPastoralCard = ({ item, index }: { item: Pastoral; index: number }) => (
    <TouchableOpacity
      style={styles.pastoralCard}
      onPress={() => openPastoralDetails(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.pastoralIcon, { backgroundColor: getPastoralColor(index) }]}>
        <Text style={styles.pastoralIconText}>{item.name.charAt(0)}</Text>
      </View>
      <View style={styles.pastoralInfo}>
        <Text style={styles.pastoralName}>{item.name}</Text>
        {item.description && (
          <Text style={styles.pastoralDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        <View style={styles.pastoralMeta}>
          <Text style={styles.pastoralMetaText}>
            {item.members.length} {item.members.length === 1 ? 'membro' : 'membros'}
          </Text>
          {item.coordinator && (
            <Text style={styles.pastoralMetaText}>
              • Coord: {item.coordinator.name.split(' ')[0]}
            </Text>
          )}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const renderMemberItem = (member: Member, isCoordinator: boolean = false) => (
    <View key={member.id} style={styles.memberItem}>
      <View style={[styles.memberAvatar, isCoordinator && styles.coordinatorAvatar]}>
        <Text style={styles.memberAvatarText}>{member.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.memberInfo}>
        <View style={styles.memberNameRow}>
          <Text style={styles.memberName}>{member.name}</Text>
          {isCoordinator && (
            <View style={styles.coordinatorBadge}>
              <Text style={styles.coordinatorBadgeText}>Coordenador(a)</Text>
            </View>
          )}
        </View>
        {member.role && !isCoordinator && (
          <Text style={styles.memberRole}>{member.role}</Text>
        )}
        {member.phone && (
          <Text style={styles.memberPhone}>{member.phone}</Text>
        )}
      </View>
    </View>
  );

  if (!communityId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.message}>Selecione sua comunidade para ver as pastorais.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando Pastorais...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Pastorais</Text>
          <Text style={styles.subtitle}>
            {pastorals.length} {pastorals.length === 1 ? 'pastoral' : 'pastorais'} na sua comunidade
          </Text>
        </View>

        <FlatList
          data={pastorals}
          keyExtractor={(item) => item.id}
          renderItem={renderPastoralCard}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Nenhuma pastoral cadastrada.</Text>
            </View>
          }
        />

        {/* Modal de Detalhes da Pastoral */}
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={closePastoralDetails}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {selectedPastoral && (
                  <>
                    <View style={styles.modalHeader}>
                      <View style={styles.modalTitleContainer}>
                        <Text style={styles.modalTitle}>{selectedPastoral.name}</Text>
                      </View>
                      <TouchableOpacity onPress={closePastoralDetails} style={styles.closeButton}>
                        <Text style={styles.closeButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>

                    {selectedPastoral.description && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>📝 Sobre</Text>
                        <Text style={styles.modalDescription}>{selectedPastoral.description}</Text>
                      </View>
                    )}

                    {selectedPastoral.coordinator && (
                      <View style={styles.modalSection}>
                        <Text style={styles.modalSectionTitle}>👤 Coordenação</Text>
                        {renderMemberItem(selectedPastoral.coordinator, true)}
                      </View>
                    )}

                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>
                        👥 Membros ({selectedPastoral.members.length})
                      </Text>
                      {selectedPastoral.members
                        .filter((m) => m.id !== selectedPastoral.coordinator?.id)
                        .map((member) => renderMemberItem(member))}
                    </View>

                    <TouchableOpacity style={styles.modalCloseButton} onPress={closePastoralDetails}>
                      <Text style={styles.modalCloseButtonText}>Fechar</Text>
                    </TouchableOpacity>
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centered: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    message: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 20,
    },
    loadingText: {
      marginTop: 10,
      color: colors.textSecondary,
    },
    header: {
      padding: 20,
      paddingBottom: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    listContent: {
      padding: 15,
    },
    pastoralCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 15,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    pastoralIcon: {
      width: 50,
      height: 50,
      borderRadius: 25,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 15,
    },
    pastoralIconText: {
      color: '#fff',
      fontSize: 22,
      fontWeight: 'bold',
    },
    pastoralInfo: {
      flex: 1,
    },
    pastoralName: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 4,
    },
    pastoralDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 6,
    },
    pastoralMeta: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    pastoralMetaText: {
      fontSize: 12,
      color: colors.textTertiary,
      marginRight: 5,
    },
    chevron: {
      fontSize: 24,
      color: colors.textTertiary,
      marginLeft: 10,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 50,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.textTertiary,
    },
    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.modalBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '85%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 20,
    },
    modalTitleContainer: {
      flex: 1,
      marginRight: 15,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
    },
    closeButton: {
      padding: 5,
    },
    closeButtonText: {
      fontSize: 20,
      color: colors.textTertiary,
    },
    modalSection: {
      marginBottom: 20,
    },
    modalSectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 12,
    },
    modalDescription: {
      fontSize: 15,
      color: colors.text,
      lineHeight: 22,
    },
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
    },
    memberAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    coordinatorAvatar: {
      backgroundColor: colors.highlight,
    },
    memberAvatarText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 16,
    },
    memberInfo: {
      flex: 1,
    },
    memberNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
    },
    memberName: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
      marginRight: 8,
    },
    coordinatorBadge: {
      backgroundColor: colors.highlightLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.highlight,
    },
    coordinatorBadgeText: {
      fontSize: 10,
      color: colors.highlight,
      fontWeight: '600',
    },
    memberRole: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    memberPhone: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    modalCloseButton: {
      backgroundColor: colors.primary,
      padding: 15,
      borderRadius: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    modalCloseButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
