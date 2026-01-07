import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { Stack } from 'expo-router';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const colors = useColors();
  const { theme, setTheme, isDark } = useTheme();

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

  const handleThemeChange = (value: boolean) => {
    setTheme(value ? 'dark' : 'light');
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Meu Perfil', headerShown: true }} />

      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <Text style={styles.userName}>{user?.name || 'Usuário'}</Text>
        <Text style={styles.userEmail}>{user?.email || ''}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informações</Text>

        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>{user?.name || 'Não informado'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>E-mail</Text>
            <Text style={styles.infoValue}>{user?.email || 'Não informado'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Comunidade</Text>
            <Text style={styles.infoValue}>{user?.communityId || 'Nenhuma'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferências</Text>

        <View style={styles.card}>
          <View style={styles.preferenceRow}>
            <View>
              <Text style={styles.preferenceLabel}>Modo Escuro</Text>
              <Text style={styles.preferenceDescription}>
                {theme === 'system' ? 'Seguindo o sistema' : isDark ? 'Ativado' : 'Desativado'}
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleThemeChange}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={isDark ? colors.textInverse : colors.card}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.preferenceRow}
            onPress={() => setTheme('system')}
          >
            <View>
              <Text style={styles.preferenceLabel}>Usar tema do sistema</Text>
              <Text style={styles.preferenceDescription}>
                Alternar automaticamente entre claro e escuro
              </Text>
            </View>
            {theme === 'system' && (
              <Text style={styles.checkmark}>✓</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>Sair da Conta</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      alignItems: 'center',
      paddingVertical: 30,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    avatarText: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.textInverse,
    },
    userName: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },
    userEmail: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
    section: {
      marginTop: 20,
      paddingHorizontal: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
      textTransform: 'uppercase',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    infoLabel: {
      fontSize: 16,
      color: colors.text,
    },
    infoValue: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 16,
    },
    preferenceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
    },
    preferenceLabel: {
      fontSize: 16,
      color: colors.text,
    },
    preferenceDescription: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 2,
    },
    checkmark: {
      fontSize: 18,
      color: colors.primary,
      fontWeight: 'bold',
    },
    signOutButton: {
      marginTop: 30,
      marginHorizontal: 16,
      backgroundColor: colors.error,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    signOutText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
