import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Keyboard,
  Linking,
  BackHandler,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import type { LoginData } from '../../src/services/authService';
import { biometricService, type BiometricSupport } from '../../src/services/biometricService';
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthLink,
  AuthScreen,
  AUTH_WEB_URL,
  NO_CONNECTION_MESSAGE,
  useAnnouncedError,
  useAuthPalette,
  type AuthColors,
  type AuthPalette,
} from '../../src/components/auth';

type LoginStep = 'credentials' | 'twoFactor';

/** Último login (e-mail ou celular) usado neste aparelho — nunca a senha */
const LAST_LOGIN_KEY = '@parish:lastLogin';
/** Chave antiga (só e-mail), lida uma vez para quem já tinha entrado */
const LEGACY_LAST_EMAIL_KEY = '@parish:lastLoginEmail';

/** Aviso curto de primeiro acesso neste aparelho (D4.7) */
const showNewDeviceAlert = () => {
  Alert.alert(
    'Novo aparelho',
    'Primeiro acesso neste aparelho — se não foi você, troque a senha.',
    [{ text: 'OK' }],
  );
};

/**
 * "E-mail ou celular": com @ é e-mail; senão, precisa ter DDD + número
 * (10 ou 11 dígitos, ou 12–13 com o 55). O backend normaliza o celular.
 */
const toLoginData = (typed: string, password: string): LoginData | null => {
  const value = typed.trim();
  if (value.includes('@')) return { email: value, password };
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10 && digits.length <= 13) return { phone: value, password };
  return null;
};

/** Traduz a falha do login para uma frase que o fiel entende */
const loginErrorMessage = (error: any): string => {
  const status: number = error?.status ?? 0;
  const raw: string = error?.message || '';
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde 1 minuto e tente de novo.';
  if (status === 0) return NO_CONNECTION_MESSAGE;
  if (status >= 500) return 'O servidor está com um problema agora. Tente de novo em instantes.';
  if (/inativ|desativad/i.test(raw)) return 'Esta conta está desativada. Procure a secretaria da sua paróquia.';
  if (status === 400 && /e-?mail/i.test(raw)) return 'Confira se o e-mail foi digitado certo.';
  if (status === 400 || status === 401) return 'E-mail, celular ou senha incorretos.';
  return raw || 'Não foi possível entrar. Tente novamente.';
};

export default function LoginScreen() {
  const { signIn, completeTwoFactorSignIn } = useAuth();
  const { colors, palette } = useAuthPalette();
  const router = useRouter();
  const passwordRef = useRef<TextInput>(null);

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  const [failedAttempts, setFailedAttempts] = useState(0);

  // Entrar com Face ID / digital
  const [bioSupport, setBioSupport] = useState<BiometricSupport | null>(null);
  const [bioEnabled, setBioEnabled] = useState(false);
  /** Credenciais do login com senha em andamento — para oferecer a biometria no fim (inclusive depois do 2FA) */
  const pendingCredentials = useRef<{ login: string; password: string; viaBiometric: boolean } | null>(null);

  // Segunda etapa (2FA)
  const [step, setStep] = useState<LoginStep>('credentials');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved =
          (await AsyncStorage.getItem(LAST_LOGIN_KEY)) ?? (await AsyncStorage.getItem(LEGACY_LAST_EMAIL_KEY));
        if (saved) setLogin((current) => current || saved);
      } catch {
        // sem armazenamento: só não pré-preenche
      }
    })();
    biometricService.getSupport().then(setBioSupport);
    biometricService.isEnabled().then(setBioEnabled);
  }, []);

  // Botão "voltar" do Android na etapa do código volta para o login
  useEffect(() => {
    if (step !== 'twoFactor') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isLoading) backToCredentials();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLoading]);

  const bioReady = !!bioSupport?.available && bioEnabled;

  /**
   * Depois de entrar com a senha: mantém as credenciais da biometria em dia
   * (senha trocada, outra conta) ou convida a ativar, uma vez só.
   */
  const afterPasswordLogin = async () => {
    const pending = pendingCredentials.current;
    pendingCredentials.current = null;
    if (!pending || pending.viaBiometric || !bioSupport?.available) return;

    if (bioEnabled) {
      const stored = await biometricService.readCredentials();
      if (stored && stored.login.toLowerCase() === pending.login.toLowerCase()) {
        if (stored.password !== pending.password) await biometricService.enable(pending.login, pending.password);
        return;
      }
      // Outra conta neste aparelho: a biometria não pode abrir a conta anterior
      await biometricService.disable();
    } else if (await biometricService.wasDeclined()) {
      return;
    }

    const label = bioSupport.label;
    Alert.alert(
      `Entrar com ${label}?`,
      `Da próxima vez, entre usando ${label}, sem digitar a senha. A senha fica guardada apenas neste aparelho.`,
      [
        { text: 'Agora não', style: 'cancel', onPress: () => biometricService.setDeclined() },
        { text: 'Ativar', onPress: () => biometricService.enable(pending.login, pending.password) },
      ],
    );
  };

  const doLogin = async (typedLogin: string, typedPassword: string, viaBiometric: boolean) => {
    const data = toLoginData(typedLogin, typedPassword);
    if (!data) {
      showError('Digite o e-mail ou o celular com DDD.');
      return;
    }

    Keyboard.dismiss();
    clearError();
    setIsLoading(true);
    try {
      const result = await signIn(data);
      setFailedAttempts(0);
      AsyncStorage.setItem(LAST_LOGIN_KEY, typedLogin.trim()).catch(() => {});
      pendingCredentials.current = { login: typedLogin.trim(), password: typedPassword, viaBiometric };

      if (result.requiresTwoFactor) {
        // Conta com segundo fator: pede o código antes de abrir a sessão
        setChallengeToken(result.challengeToken);
        setCode('');
        setUseRecoveryCode(false);
        setStep('twoFactor');
        return;
      }

      // Navegação é feita automaticamente pelo AuthContext
      if (result.newDevice) showNewDeviceAlert();
      afterPasswordLogin();
    } catch (error: any) {
      if (viaBiometric && (error?.status === 401 || error?.status === 403)) {
        // Senha guardada não vale mais (trocou a senha, conta desativada…)
        await biometricService.disable();
        setBioEnabled(false);
        showError(
          error?.status === 403
            ? loginErrorMessage(error)
            : `Sua senha mudou desde que você ativou a entrada com ${bioSupport?.label ?? 'biometria'}. Entre com a senha para ativar de novo.`,
        );
        return;
      }
      setFailedAttempts((n) => n + 1);
      showError(loginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => {
    if (!login.trim()) {
      showError('Digite o seu e-mail ou celular.');
      return;
    }
    if (!password.trim()) {
      showError('Digite a sua senha.');
      passwordRef.current?.focus();
      return;
    }
    doLogin(login, password, false);
  };

  const handleBiometricLogin = async () => {
    if (!bioSupport?.available) return;
    clearError();
    const credentials = await biometricService.unlock(bioSupport.label);
    if (!credentials) {
      // Cancelou, falhou ou as credenciais sumiram (unlock já desativa nesse caso)
      setBioEnabled(await biometricService.isEnabled());
      return;
    }
    setLogin(credentials.login);
    doLogin(credentials.login, credentials.password, true);
  };

  const backToCredentials = (message = '') => {
    setStep('credentials');
    setChallengeToken(null);
    setCode('');
    setUseRecoveryCode(false);
    pendingCredentials.current = null;
    if (message) showError(message);
    else clearError();
  };

  const handleTwoFactor = async () => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      showError('Digite o código do autenticador ou um código de recuperação.');
      return;
    }
    if (!challengeToken) {
      backToCredentials();
      return;
    }

    clearError();
    setIsLoading(true);
    try {
      const result = await completeTwoFactorSignIn(challengeToken, cleanCode);
      // Sessão aberta — navegação é feita automaticamente pelo AuthContext
      if (!result.requiresTwoFactor && result.newDevice) showNewDeviceAlert();
      afterPasswordLogin();
    } catch (error: any) {
      const message: string = error?.message || 'Código inválido. Tente novamente.';
      // Desafio vale 5 minutos e só uma vez — expirado, usado ou inválido,
      // não adianta insistir no código: volta para o login
      if (/expirad/i.test(message)) {
        backToCredentials('O tempo para digitar o código acabou. Entre de novo.');
      } else if (/desafio/i.test(message)) {
        backToCredentials('Por segurança, entre de novo com e-mail ou celular e senha.');
      } else if (/muitas tentativas/i.test(message)) {
        showError(message);
      } else if (error?.status === 429) {
        showError('Muitas tentativas seguidas. Aguarde 1 minuto e tente de novo.');
      } else if (error?.status === 0) {
        showError(NO_CONNECTION_MESSAGE);
      } else {
        showError('Código incorreto. Confira no app autenticador e tente de novo.');
        setCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openForgotPassword = () => {
    const typed = login.trim();
    router.push({
      pathname: '/(auth)/forgot-password',
      params: typed.includes('@') ? { email: typed } : {},
    } as never);
  };

  const styles = createStyles(colors, palette);

  const renderTwoFactorStep = () => (
    <AuthCard
      icon="shield-alt"
      title="Verificação em duas etapas"
      subtitle={
        useRecoveryCode
          ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação.'
          : 'Abra o app autenticador e digite o código de 6 dígitos da sua conta Parish.'
      }
    >
      <AuthErrorBox message={errorMessage} />

      <AuthField
        label={useRecoveryCode ? 'Código de recuperação' : 'Código do autenticador'}
        icon="key"
        style={styles.codeInput}
        placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '000000'}
        keyboardType={useRecoveryCode ? 'default' : 'number-pad'}
        autoCapitalize={useRecoveryCode ? 'characters' : 'none'}
        autoCorrect={false}
        autoComplete={useRecoveryCode ? 'off' : 'one-time-code'}
        textContentType={useRecoveryCode ? 'none' : 'oneTimeCode'}
        maxLength={useRecoveryCode ? 16 : 6}
        value={code}
        onChangeText={(value) => {
          setCode(value);
          if (errorMessage) clearError();
        }}
        onSubmitEditing={handleTwoFactor}
        returnKeyType="done"
        editable={!isLoading}
        autoFocus
      />

      <AuthButton label="Confirmar" busyLabel="Confirmando…" loading={isLoading} onPress={handleTwoFactor} />
      <AuthButton label="Voltar" variant="secondary" disabled={isLoading} onPress={() => backToCredentials()} />

      <AuthLink
        label={useRecoveryCode ? 'Usar código do autenticador' : 'Usar código de recuperação'}
        accessibilityRole="button"
        disabled={isLoading}
        style={styles.centerLink}
        onPress={() => {
          setUseRecoveryCode((value) => !value);
          setCode('');
          clearError();
        }}
      />
    </AuthCard>
  );

  const renderCredentialsStep = () => (
    <AuthCard title="Entre na sua conta" subtitle="Use o e-mail ou o celular e a senha que você cadastrou.">
      <AuthErrorBox message={errorMessage} />

      <AuthField
        label="E-mail ou celular"
        icon="user"
        placeholder="seu@email.com ou celular"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={login}
        onChangeText={(value) => {
          setLogin(value);
          if (errorMessage) clearError();
        }}
        editable={!isLoading}
      />

      <AuthField
        inputRef={passwordRef}
        label="Senha"
        icon="lock"
        placeholder="Sua senha"
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (errorMessage) clearError();
        }}
        editable={!isLoading}
      />

      {/* Depois de dois erros, a recuperação de senha ganha destaque */}
      {failedAttempts >= 2 ? (
        <TouchableOpacity
          style={styles.forgotHighlight}
          onPress={openForgotPassword}
          disabled={isLoading}
          accessibilityRole="link"
        >
          <FontAwesome5 name="key" size={13} color={palette.link} solid />
          <Text style={styles.forgotHighlightText}>Esqueceu a senha? Crie uma nova</Text>
        </TouchableOpacity>
      ) : (
        <AuthLink label="Esqueci minha senha" onPress={openForgotPassword} disabled={isLoading} style={styles.forgotRow} />
      )}

      <AuthButton label="Entrar" busyLabel="Entrando…" loading={isLoading} onPress={handleLogin} />

      {bioReady && (
        <AuthButton
          label={`Entrar com ${bioSupport!.label}`}
          variant="secondary"
          icon={bioSupport!.icon}
          disabled={isLoading}
          onPress={handleBiometricLogin}
        />
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ainda não tem conta?</Text>
        <AuthLink label="Criar conta" disabled={isLoading} onPress={() => router.push('/(auth)/phone-verify' as never)} />
      </View>

      {__DEV__ && (
        <View style={styles.testCredentials}>
          <Text style={styles.testTitle}>Credenciais de Teste:</Text>
          <Text style={styles.testText}>Com comunidade: adm@santarita.com.br / 12345678</Text>
          <Text style={styles.testText}>Sem comunidade: user@test.com / 12345678</Text>
        </View>
      )}
    </AuthCard>
  );

  return (
    <AuthScreen subtitle={step === 'twoFactor' ? 'Só mais um passo' : 'Sua comunidade, mais perto de você'}>
      {step === 'twoFactor' ? renderTwoFactorStep() : renderCredentialsStep()}

      {/* Mapa das igrejas: aberto a quem ainda não tem conta */}
      {step === 'credentials' && (
        <TouchableOpacity
          style={styles.nearbyButton}
          activeOpacity={0.85}
          onPress={() => router.push('/nearby-masses' as never)}
          accessibilityRole="button"
        >
          <View style={styles.nearbyIcon}>
            <FontAwesome5 name="church" size={16} color={palette.link} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.nearbyTitle}>Encontrar missas perto</Text>
            <Text style={styles.nearbySub}>Veja igrejas e horários no mapa, sem precisar entrar</Text>
          </View>
          <FontAwesome5 name="chevron-right" size={13} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      <View style={styles.legal}>
        <AuthLink label="Privacidade" onPress={() => Linking.openURL(`${AUTH_WEB_URL}/privacidade`)} style={styles.legalLink} />
        <Text style={styles.legalDot}>·</Text>
        <AuthLink label="Termos de uso" onPress={() => Linking.openURL(`${AUTH_WEB_URL}/termos`)} style={styles.legalLink} />
      </View>
    </AuthScreen>
  );
}

const createStyles = (colors: AuthColors, palette: AuthPalette) =>
  StyleSheet.create({
    codeInput: {
      fontSize: 22,
      letterSpacing: 4,
      textAlign: 'center',
      fontWeight: '700',
    },
    forgotRow: {
      alignSelf: 'flex-end',
      marginTop: -8,
      marginBottom: 8,
    },
    forgotHighlight: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      marginBottom: 12,
      borderRadius: 10,
      backgroundColor: colors.highlightLight,
    },
    forgotHighlightText: {
      color: palette.link,
      fontSize: 15,
      fontWeight: '700',
    },
    centerLink: {
      alignSelf: 'center',
      marginTop: 8,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 12,
    },
    footerText: {
      color: colors.textSecondary,
      fontSize: 15,
    },
    nearbyButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 16,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    nearbyIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlightLight,
    },
    nearbyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    nearbySub: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    legal: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      marginTop: 12,
    },
    legalLink: {
      paddingHorizontal: 6,
    },
    legalDot: {
      color: colors.textTertiary,
    },
    testCredentials: {
      marginTop: 16,
      padding: 12,
      backgroundColor: colors.highlightLight,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.highlight,
    },
    testTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    testText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
  });
