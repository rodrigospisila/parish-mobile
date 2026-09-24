import { Stack, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Keyboard, StyleSheet, Text, View } from 'react-native';
import authService from '../../src/services/authService';
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthLink,
  AuthScreen,
  authErrorMessage,
  useAnnouncedError,
  useAuthPalette,
} from '../../src/components/auth';

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Passo 1 do cadastro: confirma o celular por SMS antes de pedir os dados */
export default function PhoneVerifyScreen() {
  const { colors } = useAuthPalette();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  // Número já cadastrado: oferece entrar em vez de criar outra conta
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const rawDigits = phone.replace(/\D/g, '');
  const isValid = rawDigits.length === 11;

  // Volta para o login que já está na pilha (sem empilhar um login duplicado);
  // se não houver login atrás, troca esta tela por ele
  const goToLogin = () => router.dismissTo('/(auth)/login');

  const handleSend = async () => {
    if (!isValid) {
      setAlreadyRegistered(false);
      showError(
        rawDigits.length === 0
          ? 'Digite o número do seu celular com DDD.'
          : 'O número está incompleto. São 11 números contando o DDD, por exemplo (42) 99999-9999.',
      );
      return;
    }
    Keyboard.dismiss();
    clearError();
    setAlreadyRegistered(false);
    setLoading(true);
    try {
      await authService.sendOtp(rawDigits);
      router.push({ pathname: '/(auth)/otp-verify', params: { phone: rawDigits } });
    } catch (error: any) {
      setAlreadyRegistered(error?.status === 409);
      showError(authErrorMessage(error, 'Não foi possível enviar o código. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <AuthScreen
      subtitle="Crie sua conta"
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
    >
      <Stack.Screen options={{ title: 'Verificar Celular', headerShown: false }} />

      <AuthCard
        eyebrow="Passo 1 de 3"
        icon="mobile-alt"
        title="Qual é o seu celular?"
        subtitle="Vamos mandar um código por mensagem de texto (SMS) para confirmar que o número é seu."
      >
        <AuthErrorBox message={errorMessage}>
          {alreadyRegistered && (
            <AuthLink label="Entrar na minha conta" onPress={goToLogin} style={styles.errorAction} />
          )}
        </AuthErrorBox>

        <AuthField
          label="Celular com DDD"
          icon="mobile-alt"
          placeholder="(42) 99999-9999"
          hint="São 11 números, contando o DDD."
          style={styles.phoneInput}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={handleSend}
          value={phone}
          onChangeText={(v) => {
            setPhone(formatPhone(v));
            if (errorMessage) clearError();
          }}
          editable={!loading}
          maxLength={15}
        />

        <AuthButton label="Enviar código" busyLabel="Enviando…" onPress={handleSend} loading={loading} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta?</Text>
          <AuthLink label="Entrar" onPress={goToLogin} disabled={loading} />
        </View>
      </AuthCard>
    </AuthScreen>
  );
}

const createStyles = (colors: ReturnType<typeof useAuthPalette>['colors']) =>
  StyleSheet.create({
    phoneInput: { fontSize: 18, letterSpacing: 1 },
    errorAction: { alignSelf: 'flex-start', marginTop: 2, marginBottom: -8 },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    footerText: { color: colors.textSecondary, fontSize: 15 },
  });
