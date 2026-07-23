import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import authService from '../../src/services/authService';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function maskPhone(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function OtpVerifyScreen() {
  const colors = useColors();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleDigitChange = (index: number, value: string) => {
    // Accept paste of full code
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
      const next = [...digits];
      for (let i = 0; i < CODE_LENGTH; i++) next[i] = pasted[i] ?? '';
      setDigits(next);
      const focusIdx = Math.min(pasted.length, CODE_LENGTH - 1);
      inputRefs.current[focusIdx]?.focus();
      return;
    }

    const single = value.replace(/\D/g, '');
    const next = [...digits];
    next[index] = single;
    setDigits(next);
    if (single && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH && digits.every((d) => d !== '');

  const handleVerify = useCallback(async () => {
    if (!isComplete || !phone) return;
    setLoading(true);
    try {
      const verifiedPhoneToken = await authService.verifyOtp(phone, code);
      router.push({
        pathname: '/(auth)/register',
        params: { phone, verifiedPhoneToken },
      });
    } catch (error: any) {
      Alert.alert('Código inválido', error?.message ?? 'Verifique o código e tente novamente');
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [isComplete, phone, code, router]);

  // Auto-verify when all digits filled
  useEffect(() => {
    if (isComplete) handleVerify();
  }, [isComplete, handleVerify]);

  const handleResend = async () => {
    if (!phone || cooldown > 0) return;
    setResendLoading(true);
    try {
      await authService.sendOtp(phone);
      setCooldown(RESEND_COOLDOWN);
      setDigits(Array(CODE_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      Alert.alert('Erro', error?.message ?? 'Não foi possível reenviar o código');
    } finally {
      setResendLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen options={{ title: 'Código de Verificação', headerShown: false }} />

      <View style={styles.inner}>
        <View style={styles.header}>
          <Text style={styles.icon}>💬</Text>
          <Text style={styles.title}>Digite o código</Text>
          <Text style={styles.subtitle}>
            Enviamos um código SMS para{'\n'}
            <Text style={styles.phoneHighlight}>{maskPhone(phone ?? '')}</Text>
          </Text>
        </View>

        <View style={styles.boxes}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(ref) => { inputRefs.current[i] = ref; }}
              style={[styles.box, d ? styles.boxFilled : null, loading && styles.boxDisabled]}
              value={d}
              onChangeText={(v) => handleDigitChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              selectTextOnFocus
              editable={!loading}
              autoFocus={i === 0}
            />
          ))}
        </View>

        {loading && (
          <View style={styles.verifyingRow}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.verifyingText}>Verificando...</Text>
          </View>
        )}

        <View style={styles.resendRow}>
          {cooldown > 0 ? (
            <Text style={styles.cooldownText}>
              Reenviar código em <Text style={styles.cooldownCount}>{cooldown}s</Text>
            </Text>
          ) : resendLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <TouchableOpacity onPress={handleResend}>
              <Text style={styles.resendLink}>Reenviar código</Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>← Corrigir número</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    inner: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    header: { alignItems: 'center', marginBottom: 40 },
    icon: { fontSize: 56, marginBottom: 12 },
    title: { fontSize: 26, fontWeight: 'bold', color: colors.text },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 10,
      textAlign: 'center',
      lineHeight: 22,
    },
    phoneHighlight: { fontWeight: '700', color: colors.text },
    boxes: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 32,
    },
    box: {
      width: 46,
      height: 56,
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: 10,
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      backgroundColor: colors.inputBackground,
    },
    boxFilled: {
      borderColor: colors.primary,
      backgroundColor: colors.card,
    },
    boxDisabled: {
      opacity: 0.6,
    },
    verifyingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
    },
    verifyingText: { color: colors.textSecondary, fontSize: 14 },
    resendRow: {
      marginBottom: 32,
      minHeight: 24,
      alignItems: 'center',
    },
    cooldownText: { color: colors.textSecondary, fontSize: 14 },
    cooldownCount: { fontWeight: '700', color: colors.text },
    resendLink: { color: colors.primary, fontSize: 15, fontWeight: '600' },
    backButton: { marginTop: 8 },
    backText: { color: colors.textSecondary, fontSize: 14 },
  });
