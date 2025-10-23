import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();

  function handleLogout() {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: signOut,
        },
      ]
    );
  }

  function getRoleLabel(role: string): string {
    const labels: { [key: string]: string } = {
      SUPER_ADMIN: 'Super Administrador',
      DIOCESAN_ADMIN: 'Administrador Diocesano',
      PARISH_ADMIN: 'Administrador Paroquial',
      COMMUNITY_LEADER: 'Líder Comunitário',
      MINISTER: 'Ministro',
      FAITHFUL: 'Fiel',
    };
    return labels[role] || role;
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.fullName?.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{user?.fullName}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {getRoleLabel(user?.role || '')}
          </Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações da Conta</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nome Completo</Text>
            <Text style={styles.infoValue}>{user?.fullName}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Perfil</Text>
            <Text style={styles.infoValue}>
              {getRoleLabel(user?.role || '')}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sobre o App</Text>
          
          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>Versão</Text>
            <Text style={styles.menuItemValue}>1.0.0</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>Termos de Uso</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <Text style={styles.menuItemText}>Política de Privacidade</Text>
            <Text style={styles.menuItemIcon}>›</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Sair da Conta</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>
          Parish App v1.0.0{'\n'}
          Desenvolvido para a comunidade católica
        </Text>
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
    padding: 32,
    alignItems: 'center',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: '#E9D5FF',
    marginBottom: 12,
  },
  roleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
  },
  menuItemValue: {
    fontSize: 14,
    color: '#666',
  },
  menuItemIcon: {
    fontSize: 20,
    color: '#999',
  },
  logoutButton: {
    backgroundColor: '#EF4444',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 24,
    marginBottom: 32,
    lineHeight: 18,
  },
});

