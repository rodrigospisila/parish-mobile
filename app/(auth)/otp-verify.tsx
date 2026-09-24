import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Keyboard, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import authService from '../../src/services/authService';
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthLink,
  AuthScreen,
  authErrorMessage,
  useAnnouncedError,
  useAuthPalette,
  type AuthColors,
  type AuthPalette,
} from '../../src/components/auth';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

function maskPhone(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Traduz a falha da conferência do código para uma frase simples */
const verifyErrorMessage = (error: any): string => {
  const raw: string = error?.message || '';
  if (/muitas tentativas/i.test(raw)) return 'Muitas tentativas erradas. Peça um novo código abaixo.';
  if (/expirad/i.test(raw)) return 'Este código venceu. Peça um novo código abaixo.';
  if (/incorret|inv[aá]lid/i.test(raw)) return 'Código incorreto. Confira a mensagem (SMS) e digite de novo.';
  return authErrorMessage(error, 'Não foi possível conferir o código. Tente novamente.');
};

/** Passo 2 do cadastro: código de 6 números recebido por SMS */
export default function OtpVerifyScreen() {
  const { colors, palette } = useAuthPalette();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  const [notice, setNotice] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);
  // Código já enviado automaticamente — evita reenviar o mesmo código se a
  // tela voltar a ficar ativa (ex.: voltando do cadastro)
  const autoSubmittedCode = useRef('');

  // Countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleDigitChange = (index: number, value: string) => {
    if (errorMessage) clearError();
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
    if (!phone) return;
    if (!isComplete) {
      showError('Digite os 6 números do código que chegou por SMS.');
      return;
    }
    autoSubmittedCode.current = code;
    Keyboard.dismiss();
    clearError();
    setNotice('');
    setLoading(true);
    try {
      const verifiedPhoneToken = await authService.verifyOtp(phone, code);
      router.push({
        pathname: '/(auth)/register',
        params: { phone, verifiedPhoneToken },
      });
    } catch (error: any) {
      showError(verifyErrorMessage(error));
      setDigits(Array(CODE_LENGTH).fill(''));
      autoSubmittedCode.current = '';
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }, [isComplete, phone, code, router, showError, clearError]);

  // Auto-verify when all digits filled
  useEffect(() => {
    if (isComplete && !loading && autoSubmittedCode.current !== code) handleVerify();
  }, [isComplete, loading, code, handleVerify]);

  const handleResend = async () => {
    if (!phone || cooldown > 0) return;
    clearError();
    setNotice('');
    setResendLoading(true);
    try {
      await authService.sendOtp(phone);
      setCooldown(RESEND_COOLDOWN);
      setDigits(Array(CODE_LENGTH).fill(''));
      autoSubmittedCode.current = '';
      setNotice(`Enviamos um novo código para ${maskPhone(phone)}.`);
      inputRefs.current[0]?.focus();
    } catch (error: any) {
      showError(authErrorMessage(error, 'Não foi possível reenviar o código. Tente novamente.'));
    } finally {
      setResendLoading(false);
    }
  };

  const styles = createStyles(colors, palette);

  return (
    <AuthScreen subtitle="Crie sua conta" onBack={() => router.back()}>
      <Stack.Screen options={{ title: 'Código de Verificação', headerShown: false }} />

      <AuthCard
        eyebrow="Passo 2 de 3"
        icon="sms"
        title="Digite o código"
        subtitle="Mandamos um código de 6 números por mensagem de texto (SMS) para o celular:"
      >
        {/* Linha própria (e não Text aninhado): mais fácil de ler e sem o erro de Text aninhado no web */}
        <View style={styles.phoneRow}>
          <FontAwesome5 name="mobile-alt" size={15} color={palette.link} solid />
          <Text style={styles.phoneHighlight}>{maskPhone(phone ?? '')}</Text>
        </View>

        <AuthErrorBox message={errorMessage} />
        <AuthErrorBox message={errorMessage ? '' : notice} tone="info" />

        <View style={styles.boxes}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(ref) => {
                inputRefs.current[i] = ref;
              }}
              style={[
                styles.box,
                d ? styles.boxFilled : null,
                focusedIndex === i && styles.boxFocused,
                loading && styles.boxDisabled,
              ]}
              value={d}
              onChangeText={(v) => handleDigitChange(i, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex((current) => (current === i ? null : current))}
              keyboardType="number-pad"
              // O preenchimento automático do SMS entra no primeiro quadrado e é distribuído
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              textContentType={i === 0 ? 'oneTimeCode' : 'none'}
              maxLength={CODE_LENGTH}
              selectTextOnFocus
              editable={!loading}
              autoFocus={i === 0}
              accessibilityLabel={`Número ${i + 1} de ${CODE_LENGTH} do código`}
            />
          ))}
        </View>

        <AuthButton label="Confirmar código" busyLabel="Verificando…" onPress={handleVerify} loading={loading} />

        <View style={styles.resendRow}>
          {cooldown > 0 ? (
            <Text style={styles.cooldownText}>
              {`Não chegou? Você pode pedir outro código em ${cooldown} s.`}
            </Text>
          ) : resendLoading ? (
            <View style={styles.resendBusy}>
              <ActivityIndicator color={palette.link} />
              <Text style={styles.cooldownText}>Enviando outro código…</Text>
            </View>
          ) : (
            <AuthLink
              label="Não chegou? Enviar o código de novo"
              onPress={handleResend}
              disabled={loading}
              accessibilityRole="button"
            />
          )}
        </View>

        <AuthButton
          variant="secondary"
          icon="pen"
          label="Corrigir o número"
          onPress={() => router.back()}
          disabled={loading}
        />
      </AuthCard>
    </AuthScreen>
  );
}

const createStyles = (colors: AuthColors, palette: AuthPalette) =>
  StyleSheet.create({
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: -6,
      marginBottom: 18,
    },
    phoneHighlight: { fontSize: 18, fontWeight: '700', letterSpacing: 0.5, color: colors.text },
    boxes: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 18,
    },
    box: {
      flex: 1,
      // minWidth 0: sem isso o campo não encolhe no web e os 6 quadrados vazam do cartão
      minWidth: 0,
      maxWidth: 50,
      height: 58,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
      borderRadius: 12,
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      backgroundColor: palette.fieldBackground,
    },
    boxFilled: {
      borderColor: palette.link,
      backgroundColor: colors.card,
    },
    boxFocused: {
      borderColor: palette.link,
      borderWidth: 2,
      backgroundColor: colors.card,
    },
    boxDisabled: {
      opacity: 0.6,
    },
    resendRow: {
      marginTop: 8,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resendBusy: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cooldownText: { color: colors.textSecondary, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  });
