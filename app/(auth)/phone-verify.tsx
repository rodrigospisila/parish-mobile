import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import authService from '../../src/services/authService';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function PhoneVerifyScreen() {
  const colors = useColors();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const rawDigits = phone.replace(/\D/g, '');
  const isValid = rawDigits.length === 11;

  const handleSend = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await authService.sendOtp(rawDigits);
      router.push({ pathname: '/(auth)/otp-verify', params: { phone: rawDigits } });
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível enviar o código');
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Stack.Screen options={{ title: 'Verificar Celular', headerShown: false }} />

        <View style={styles.header}>
          <Text style={styles.icon}>📱</Text>
          <Text style={styles.title}>Verificar Celular</Text>
          <Text style={styles.subtitle}>
            Digite seu número de celular com DDD. Enviaremos um código de verificação por SMS.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Celular</Text>
            <TextInput
              style={styles.input}
              placeholder="(11) 99999-9999"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={(v) => setPhone(formatPhone(v))}
              editable={!loading}
              maxLength={15}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, (!isValid || loading) && styles.buttonDisabled]}
            onPress={handleSend}
            disabled={!isValid || loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Enviar código</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Já tem conta? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}>
              <Text style={styles.link}>Faça Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
    header: { alignItems: 'center', marginBottom: 40 },
    icon: { fontSize: 56, marginBottom: 12 },
    title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 10,
      textAlign: 'center',
      lineHeight: 22,
    },
    form: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    inputContainer: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: 8 },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 18,
      color: colors.text,
      letterSpacing: 1,
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: { backgroundColor: colors.disabled },
    buttonText: { color: colors.textInverse, fontSize: 16, fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
    footerText: { color: colors.textSecondary, fontSize: 14 },
    link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  });
