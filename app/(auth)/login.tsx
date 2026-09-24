import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  StatusBar,
  Keyboard,
  Linking,
  BackHandler,
  AccessibilityInfo,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { useColors, useTheme } from '../../src/context/ThemeContext';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

type LoginStep = 'credentials' | 'twoFactor';
type Colors = ReturnType<typeof useColors>;

const LOGO = require('../../assets/images/logo-mark.png');
/** Degradê da marca (mesmo azul-marinho do ícone e da splash) */
const HERO_GRADIENT = ['#0B1C2C', '#17324D', '#0B4A8A'] as const;
const WEB_URL = 'https://parish-web-three.vercel.app';
/** Último e-mail que entrou neste aparelho (só o e-mail, nunca a senha) */
const LAST_EMAIL_KEY = '@parish:lastLoginEmail';
/** Servidor pode demorar a acordar: depois disso o botão avisa que ainda está conectando */
const SLOW_LOGIN_MS = 8000;

/**
 * Cores desta tela com contraste conferido (WCAG AA): borda de campo ≥ 3:1,
 * texto e links ≥ 4,5:1 — nos dois temas.
 */
const screenPalette = (colors: Colors, isDark: boolean) => ({
  link: isDark ? colors.primaryLight : colors.primary,
  error: isDark ? '#FF8A8F' : colors.error,
  fieldBorder: isDark ? '#6B7480' : '#8A96A3',
  fieldBackground: isDark ? '#1A1D22' : colors.inputBackground,
  placeholder: isDark ? colors.placeholder : '#6B7785',
});
type Palette = ReturnType<typeof screenPalette>;

/** Aviso curto de primeiro acesso neste aparelho (D4.7) */
const showNewDeviceAlert = () => {
  Alert.alert(
    'Novo aparelho',
    'Primeiro acesso neste aparelho — se não foi você, troque a senha.',
    [{ text: 'OK' }],
  );
};

/** Traduz a falha do login para uma frase que o fiel entende (o servidor fala em "credenciais", "throttler"…) */
const loginErrorMessage = (error: any): string => {
  const status: number = error?.status ?? 0;
  const raw: string = error?.message || '';
  if (status === 429) return 'Muitas tentativas seguidas. Aguarde 1 minuto e tente de novo.';
  if (status === 0) return 'Sem conexão com o servidor. Confira sua internet e tente de novo.';
  if (status >= 500) return 'O servidor está com um problema agora. Tente de novo em instantes.';
  if (/inativ/i.test(raw)) return 'Esta conta está desativada. Procure a secretaria da sua paróquia.';
  if (status === 400 && /e-?mail/i.test(raw)) return 'Confira se o e-mail foi digitado certo.';
  if (status === 400 || status === 401) return 'E-mail ou senha incorretos.';
  return raw || 'Não foi possível entrar. Tente novamente.';
};

type FieldProps = TextInputProps & {
  label: string;
  icon: string;
  colors: Colors;
  palette: Palette;
  /** Ação à direita do campo (ex.: mostrar senha) */
  right?: React.ReactNode;
  inputRef?: React.Ref<TextInput>;
};

/** Campo com rótulo, ícone à esquerda e borda de foco */
function Field({ label, icon, colors, palette, right, inputRef, style, onFocus, onBlur, ...input }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const styles = fieldStyles(colors, palette);
  return (
    <View style={styles.container}>
      {/* O leitor de tela já lê o rótulo pelo próprio campo */}
      <Text style={styles.label} importantForAccessibility="no" accessibilityElementsHidden>
        {label}
      </Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <FontAwesome5
          name={icon}
          size={15}
          solid
          color={focused ? palette.link : colors.textTertiary}
          style={styles.icon}
        />
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          placeholderTextColor={palette.placeholder}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...input}
        />
        {right}
      </View>
    </View>
  );
}

export default function LoginScreen() {
  const { signIn, completeTwoFactorSignIn } = useAuth();
  const colors = useColors();
  const { isDark } = useTheme();
  const palette = screenPalette(colors, isDark);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // Segunda etapa (2FA)
  const [step, setStep] = useState<LoginStep>('credentials');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  // Cabeçalho compacto com teclado aberto ou fonte grande do sistema, para o
  // campo de senha e o botão não ficarem escondidos em telas pequenas
  const compactHero = keyboardOpen || fontScale > 1.3;

  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY)
      .then((saved) => {
        if (saved) setEmail((current) => current || saved);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Botão "voltar" do Android na etapa do código volta para e-mail e senha
  useEffect(() => {
    if (step !== 'twoFactor') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!isLoading) backToCredentials();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isLoading]);

  // Aviso de "ainda conectando" quando o servidor demora a responder
  useEffect(() => {
    if (!isLoading) {
      setIsSlow(false);
      return;
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_LOGIN_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  const showError = (message: string) => {
    setErrorMessage(message);
    // VoiceOver/TalkBack não leem sozinhos uma caixa que acabou de aparecer
    if (message) AccessibilityInfo.announceForAccessibility(message);
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      showError(!cleanEmail ? 'Digite o seu e-mail.' : 'Digite a sua senha.');
      if (cleanEmail) passwordRef.current?.focus();
      return;
    }

    Keyboard.dismiss();
    setErrorMessage('');
    setIsLoading(true);
    try {
      const result = await signIn({ email: cleanEmail, password });
      setFailedAttempts(0);
      AsyncStorage.setItem(LAST_EMAIL_KEY, cleanEmail).catch(() => {});

      if (result.requiresTwoFactor) {
        // Conta com segundo fator: pede o código antes de abrir a sessão
        setChallengeToken(result.challengeToken);
        setCode('');
        setUseRecoveryCode(false);
        setStep('twoFactor');
        return;
      }

      // Navegação é feita automaticamente pelo AuthContext
      if (result.newDevice) {
        showNewDeviceAlert();
      }
    } catch (error: any) {
      setFailedAttempts((n) => n + 1);
      showError(loginErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const backToCredentials = (message = '') => {
    setStep('credentials');
    setChallengeToken(null);
    setCode('');
    setUseRecoveryCode(false);
    showError(message);
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

    setErrorMessage('');
    setIsLoading(true);
    try {
      const result = await completeTwoFactorSignIn(challengeToken, cleanCode);
      // Sessão aberta — navegação é feita automaticamente pelo AuthContext
      if (!result.requiresTwoFactor && result.newDevice) {
        showNewDeviceAlert();
      }
    } catch (error: any) {
      const message: string = error?.message || 'Código inválido. Tente novamente.';
      // Desafio vale 5 minutos e só uma vez — expirado, usado ou inválido,
      // não adianta insistir no código: volta para e-mail e senha
      if (/expirad/i.test(message)) {
        backToCredentials('O tempo para digitar o código acabou. Entre de novo.');
      } else if (/desafio/i.test(message)) {
        backToCredentials('Por segurança, entre de novo com e-mail e senha.');
      } else if (/muitas tentativas/i.test(message)) {
        showError(message);
      } else if (error?.status === 429) {
        showError('Muitas tentativas seguidas. Aguarde 1 minuto e tente de novo.');
      } else if (error?.status === 0) {
        showError('Sem conexão com o servidor. Confira sua internet e tente de novo.');
      } else {
        showError('Código incorreto. Confira no app autenticador e tente de novo.');
        setCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const openForgotPassword = () => {
    const typed = email.trim();
    router.push({ pathname: '/(auth)/forgot-password', params: typed ? { email: typed } : {} } as never);
  };

  const styles = createStyles(colors, palette);

  const errorBox = errorMessage ? (
    <View style={styles.errorBox}>
      <FontAwesome5 name="exclamation-circle" size={14} color={palette.error} solid />
      <Text style={styles.errorText}>{errorMessage}</Text>
    </View>
  ) : null;

  const primaryButton = (label: string, busyLabel: string, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.button, isLoading && styles.buttonBusy]}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={isLoading ? busyLabel : label}
      accessibilityState={{ disabled: isLoading, busy: isLoading }}
    >
      {isLoading ? (
        <View style={styles.buttonBusyRow}>
          <ActivityIndicator color={colors.textInverse} />
          <Text style={styles.buttonText}>{isSlow ? 'Ainda conectando…' : busyLabel}</Text>
        </View>
      ) : (
        <Text style={styles.buttonText}>{label}</Text>
      )}
    </TouchableOpacity>
  );

  const textLink = (label: string, onPress: () => void, style?: object) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={isLoading}
      accessibilityRole="link"
      hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
      style={[styles.linkTouch, style]}
    >
      <Text style={styles.link}>{label}</Text>
    </TouchableOpacity>
  );

  const renderTwoFactorStep = () => (
    <View style={styles.card}>
      <View style={styles.stepIcon}>
        <FontAwesome5 name="shield-alt" size={18} color={palette.link} solid />
      </View>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Verificação em duas etapas
      </Text>
      <Text style={styles.cardSubtitle}>
        {useRecoveryCode
          ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação.'
          : 'Abra o app autenticador e digite o código de 6 dígitos da sua conta Parish.'}
      </Text>

      {errorBox}

      <Field
        colors={colors}
        palette={palette}
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
          if (errorMessage) setErrorMessage('');
        }}
        onSubmitEditing={handleTwoFactor}
        returnKeyType="done"
        editable={!isLoading}
        autoFocus
      />

      {primaryButton('Confirmar', 'Confirmando…', handleTwoFactor)}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => backToCredentials()}
        disabled={isLoading}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryButtonText}>Voltar</Text>
      </TouchableOpacity>

      {textLink(
        useRecoveryCode ? 'Usar código do autenticador' : 'Usar código de recuperação',
        () => {
          setUseRecoveryCode((value) => !value);
          setCode('');
          setErrorMessage('');
        },
        styles.centerLink,
      )}
    </View>
  );

  const renderCredentialsStep = () => (
    <View style={styles.card}>
      <Text style={styles.cardTitle} accessibilityRole="header">
        Entre na sua conta
      </Text>
      <Text style={styles.cardSubtitle}>Use o e-mail e a senha que você cadastrou.</Text>

      {errorBox}

      <Field
        colors={colors}
        palette={palette}
        label="E-mail"
        icon="envelope"
        placeholder="seu@email.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        value={email}
        onChangeText={(value) => {
          setEmail(value);
          if (errorMessage) setErrorMessage('');
        }}
        editable={!isLoading}
      />

      <Field
        colors={colors}
        palette={palette}
        inputRef={passwordRef}
        label="Senha"
        icon="lock"
        placeholder="Sua senha"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={handleLogin}
        value={password}
        onChangeText={(value) => {
          setPassword(value);
          if (errorMessage) setErrorMessage('');
        }}
        editable={!isLoading}
        right={
          <TouchableOpacity
            onPress={() => setShowPassword((value) => !value)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={styles.eyeButton}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            <FontAwesome5
              name={showPassword ? 'eye-slash' : 'eye'}
              size={17}
              color={colors.textSecondary}
            />
          </TouchableOpacity>
        }
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
        textLink('Esqueci minha senha', openForgotPassword, styles.forgotRow)
      )}

      {primaryButton('Entrar', 'Entrando…', handleLogin)}

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ainda não tem conta?</Text>
        {textLink('Criar conta', () => router.push('/(auth)/phone-verify' as never))}
      </View>

      {__DEV__ && (
        <View style={styles.testCredentials}>
          <Text style={styles.testTitle}>Credenciais de Teste:</Text>
          <Text style={styles.testText}>Com comunidade: adm@santarita.com.br / 12345678</Text>
          <Text style={styles.testText}>Sem comunidade: user@test.com / 12345678</Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <LinearGradient
          colors={HERO_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            compactHero && styles.heroCompact,
            { paddingTop: insets.top + (compactHero ? 16 : 32) },
          ]}
        >
          <Image
            source={LOGO}
            style={compactHero ? styles.logoCompact : styles.logo}
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Text style={[styles.brand, compactHero && styles.brandCompact]} maxFontSizeMultiplier={1.3}>
            Parish
          </Text>
          {!compactHero && (
            <Text style={styles.tagline} maxFontSizeMultiplier={1.5}>
              {step === 'twoFactor' ? 'Só mais um passo' : 'Sua comunidade, mais perto de você'}
            </Text>
          )}
        </LinearGradient>

        <View style={styles.body}>
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
            {textLink('Privacidade', () => Linking.openURL(`${WEB_URL}/privacidade`), styles.legalLink)}
            <Text style={styles.legalDot}>·</Text>
            {textLink('Termos de uso', () => Linking.openURL(`${WEB_URL}/termos`), styles.legalLink)}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const fieldStyles = (colors: Colors, palette: Palette) =>
  StyleSheet.create({
    container: {
      marginBottom: 14,
    },
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    box: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 52,
      backgroundColor: palette.fieldBackground,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
      borderRadius: 12,
      paddingHorizontal: 14,
    },
    boxFocused: {
      borderColor: palette.link,
      borderWidth: 2,
      backgroundColor: colors.card,
    },
    icon: {
      width: 20,
      marginRight: 10,
      textAlign: 'center',
    },
    input: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
  });

const createStyles = (colors: Colors, palette: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    hero: {
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 64,
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
    },
    heroCompact: {
      paddingBottom: 52,
    },
    logo: {
      width: 92,
      height: 92,
    },
    logoCompact: {
      width: 52,
      height: 52,
    },
    brand: {
      fontSize: 32,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.5,
      marginTop: 10,
    },
    brandCompact: {
      fontSize: 22,
      marginTop: 4,
    },
    tagline: {
      fontSize: 15,
      color: 'rgba(255,255,255,0.8)',
      marginTop: 4,
      textAlign: 'center',
    },
    body: {
      paddingHorizontal: 20,
      marginTop: -40,
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 22,
      shadowColor: '#0B1C2C',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 18,
      elevation: 6,
    },
    stepIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.highlightLight,
      marginBottom: 12,
    },
    cardTitle: {
      fontSize: 21,
      fontWeight: '700',
      color: colors.text,
    },
    cardSubtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 21,
      marginTop: 4,
      marginBottom: 18,
    },
    errorBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 12,
      borderRadius: 10,
      marginBottom: 14,
      backgroundColor: palette.error + '14',
      borderWidth: 1,
      borderColor: palette.error + '55',
    },
    errorText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 20,
      color: palette.error,
    },
    codeInput: {
      fontSize: 22,
      letterSpacing: 4,
      textAlign: 'center',
      fontWeight: '700',
    },
    eyeButton: {
      paddingLeft: 12,
      paddingVertical: 10,
    },
    linkTouch: {
      minHeight: 44,
      justifyContent: 'center',
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
    button: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Carregando: mantém a cor da marca (spinner branco sobre cinza some)
    buttonBusy: {
      opacity: 0.85,
    },
    buttonBusyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    buttonText: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: 12,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 10,
      borderWidth: 1.5,
      borderColor: palette.fieldBorder,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
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
    link: {
      color: palette.link,
      fontSize: 15,
      fontWeight: '600',
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
