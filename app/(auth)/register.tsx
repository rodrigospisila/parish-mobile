import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Keyboard, Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import {
  AUTH_WEB_URL,
  AuthButton,
  AuthCard,
  AuthCheckbox,
  AuthErrorBox,
  AuthField,
  AuthLink,
  AuthScreen,
  authErrorMessage,
  useAnnouncedError,
  useAuthPalette,
  type AuthColors,
} from '../../src/components/auth';

function maskPhone(digits: string): string {
  if (digits.length !== 11) return digits;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Passo 3 do cadastro: nome, e-mail, senha e aceite dos termos (LGPD) */
export default function RegisterScreen() {
  const { register } = useAuth();
  const { colors, isDark } = useAuthPalette();
  const router = useRouter();
  const { phone, verifiedPhoneToken } = useLocalSearchParams<{
    phone: string;
    verifiedPhoneToken: string;
  }>();
  const nameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsMissing, setTermsMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  // E-mail já cadastrado: oferece recuperar a senha em vez de criar outra conta
  const [emailTaken, setEmailTaken] = useState(false);

  const goToLogin = () => router.dismissTo('/(auth)/login');

  const onEdit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    if (errorMessage) clearError();
  };

  const handleRegister = async () => {
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    setEmailTaken(false);

    if (!cleanName) {
      showError('Digite o seu nome completo.');
      nameRef.current?.focus();
      return;
    }
    if (!cleanEmail) {
      showError('Digite o seu e-mail.');
      emailRef.current?.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      showError('Confira o e-mail: ele precisa ter @ e ponto, por exemplo maria@gmail.com.');
      emailRef.current?.focus();
      return;
    }
    if (password.length < 8) {
      showError('A senha precisa ter pelo menos 8 caracteres.');
      passwordRef.current?.focus();
      return;
    }
    if (!acceptedTerms) {
      setTermsMissing(true);
      showError('Para criar a conta, marque que você leu e aceita os Termos de uso e a Política de Privacidade.');
      Keyboard.dismiss();
      return;
    }

    Keyboard.dismiss();
    clearError();
    setLoading(true);
    try {
      await register({
        name: cleanName,
        email: cleanEmail,
        password,
        phone,
        verifiedPhoneToken,
        // Aceite dos termos/política (LGPD): o servidor grava acceptedTermsAt e a versão
        consentGiven: true,
      });
      // Navegação é feita automaticamente pelo AuthContext
    } catch (error: any) {
      // Mostra a mensagem real do servidor (ex.: "Email já cadastrado");
      // a frase de conexão fica só para quando o servidor não respondeu
      setEmailTaken(error?.status === 409);
      showError(authErrorMessage(error, 'Não foi possível completar o cadastro. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const styles = createStyles(colors, isDark);

  return (
    <AuthScreen subtitle="Crie sua conta" onBack={() => router.back()}>
      <Stack.Screen options={{ title: 'Criar Conta', headerShown: false }} />

      <AuthCard
        eyebrow="Passo 3 de 3"
        icon="user-plus"
        title="Seus dados"
        subtitle="Falta pouco! Preencha para terminar o cadastro."
      >
        {!!phone && (
          <View style={styles.verifiedBadge}>
            <FontAwesome5 name="check-circle" size={16} color={styles.verifiedText.color} solid />
            <Text style={styles.verifiedText}>Celular confirmado: {maskPhone(phone)}</Text>
          </View>
        )}

        <AuthField
          inputRef={nameRef}
          label="Nome completo"
          icon="user"
          placeholder="Ex.: Maria da Silva"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
          value={name}
          onChangeText={onEdit(setName)}
          editable={!loading}
        />

        <AuthField
          inputRef={emailRef}
          label="E-mail"
          icon="envelope"
          placeholder="seu@email.com"
          hint="Você vai usar este e-mail para entrar no app."
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={onEdit(setEmail)}
          editable={!loading}
        />

        <AuthField
          inputRef={passwordRef}
          label="Crie uma senha"
          icon="lock"
          placeholder="Mínimo 8 caracteres"
          hint="Pelo menos 8 letras, números ou símbolos. Toque no olho para ver o que digitou."
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          value={password}
          onChangeText={onEdit(setPassword)}
          editable={!loading}
        />

        {/* Links antes da caixa: primeiro ler, depois aceitar */}
        <View style={styles.legalLinks}>
          <AuthLink
            label="Termos de uso"
            onPress={() => Linking.openURL(`${AUTH_WEB_URL}/termos`)}
            textStyle={styles.legalLinkText}
          />
          <Text style={styles.legalDot}>·</Text>
          <AuthLink
            label="Política de Privacidade"
            onPress={() => Linking.openURL(`${AUTH_WEB_URL}/privacidade`)}
            textStyle={styles.legalLinkText}
          />
        </View>
        <AuthCheckbox
          checked={acceptedTerms}
          onChange={(value) => {
            setAcceptedTerms(value);
            if (value) {
              setTermsMissing(false);
              if (errorMessage) clearError();
            }
          }}
          invalid={termsMissing}
          disabled={loading}
          label="Li e aceito os Termos de uso e a Política de Privacidade"
          style={styles.checkbox}
        />

        {/* Erro perto do botão: num formulário longo, a caixa no topo ficaria fora da tela */}
        <AuthErrorBox message={errorMessage}>
          {emailTaken && (
            <AuthLink
              label="Esqueci a senha deste e-mail"
              onPress={() =>
                router.push({ pathname: '/(auth)/forgot-password', params: { email: email.trim() } } as never)
              }
              style={styles.errorAction}
            />
          )}
        </AuthErrorBox>
        <AuthButton label="Criar minha conta" busyLabel="Criando conta…" onPress={handleRegister} loading={loading} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Já tem conta?</Text>
          <AuthLink label="Entrar" onPress={goToLogin} disabled={loading} />
        </View>
      </AuthCard>
    </AuthScreen>
  );
}

const createStyles = (colors: AuthColors, isDark: boolean) =>
  StyleSheet.create({
    verifiedBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.success + '22' : '#f0fdf4',
      borderWidth: 1,
      borderColor: isDark ? colors.success + '66' : '#86efac',
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 16,
      gap: 8,
    },
    verifiedText: { color: isDark ? '#7DDBA3' : '#15803d', fontSize: 15, fontWeight: '600', flex: 1 },
    errorAction: { alignSelf: 'flex-start', marginTop: 2, marginBottom: -8 },
    legalLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      columnGap: 8,
      marginTop: 2,
    },
    legalLinkText: { textDecorationLine: 'underline' },
    legalDot: { color: colors.textTertiary },
    checkbox: { marginBottom: 14 },
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
