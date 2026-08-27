import React, { useState } from 'react';
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
} from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { useColors } from '../../src/context/ThemeContext';
import { Link } from 'expo-router';

type LoginStep = 'credentials' | 'twoFactor';

/** Aviso curto de primeiro acesso neste aparelho (D4.7) */
const showNewDeviceAlert = () => {
  Alert.alert(
    'Novo aparelho',
    'Primeiro acesso neste aparelho — se não foi você, troque a senha.',
    [{ text: 'OK' }],
  );
};

export default function LoginScreen() {
  const { signIn, completeTwoFactorSignIn } = useAuth();
  const colors = useColors();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Segunda etapa (2FA)
  const [step, setStep] = useState<LoginStep>('credentials');
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Erro', 'Por favor, preencha todos os campos.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn({ email: email.trim(), password });

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
      Alert.alert('Erro de Login', error.message || 'Não foi possível fazer login.');
    } finally {
      setIsLoading(false);
    }
  };

  const backToCredentials = () => {
    setStep('credentials');
    setChallengeToken(null);
    setCode('');
    setUseRecoveryCode(false);
  };

  const handleTwoFactor = async () => {
    const cleanCode = code.trim();
    if (!cleanCode) {
      Alert.alert('Erro', 'Digite o código do autenticador ou um código de recuperação.');
      return;
    }
    if (!challengeToken) {
      backToCredentials();
      return;
    }

    setIsLoading(true);
    try {
      const result = await completeTwoFactorSignIn(challengeToken, cleanCode);
      // Sessão aberta — navegação é feita automaticamente pelo AuthContext
      if (!result.requiresTwoFactor && result.newDevice) {
        showNewDeviceAlert();
      }
    } catch (error: any) {
      const message: string = error?.message || 'Código inválido. Tente novamente.';
      Alert.alert('Código não aceito', message);
      // Desafio vale 5 minutos — se expirou, volta para e-mail e senha
      if (/expirad/i.test(message)) {
        backToCredentials();
      } else {
        setCode('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  const renderTwoFactorStep = () => (
    <View style={styles.form}>
      <Text style={styles.stepTitle}>Verificação em duas etapas</Text>
      <Text style={styles.stepDescription}>
        {useRecoveryCode
          ? 'Digite um dos códigos de recuperação que você guardou ao ativar a verificação.'
          : 'Abra o app autenticador e digite o código de 6 dígitos da sua conta Parish.'}
      </Text>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>
          {useRecoveryCode ? 'Código de recuperação' : 'Código do autenticador'}
        </Text>
        <TextInput
          style={[styles.input, styles.codeInput]}
          placeholder={useRecoveryCode ? 'XXXXX-XXXXX' : '000000'}
          placeholderTextColor={colors.placeholder}
          keyboardType={useRecoveryCode ? 'default' : 'number-pad'}
          autoCapitalize={useRecoveryCode ? 'characters' : 'none'}
          autoCorrect={false}
          autoComplete={useRecoveryCode ? 'off' : 'one-time-code'}
          textContentType={useRecoveryCode ? 'none' : 'oneTimeCode'}
          maxLength={useRecoveryCode ? 16 : 6}
          value={code}
          onChangeText={setCode}
          onSubmitEditing={handleTwoFactor}
          returnKeyType="done"
          editable={!isLoading}
          autoFocus
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleTwoFactor}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={backToCredentials}
        disabled={isLoading}
      >
        <Text style={styles.secondaryButtonText}>Voltar</Text>
      </TouchableOpacity>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={() => {
            setUseRecoveryCode((value) => !value);
            setCode('');
          }}
          disabled={isLoading}
        >
          <Text style={styles.link}>
            {useRecoveryCode ? 'Usar código do autenticador' : 'Usar código de recuperação'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderCredentialsStep = () => (
    <View style={styles.form}>
      <View style={styles.inputContainer}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor={colors.placeholder}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />
      </View>

      <View style={styles.inputContainer}>
        <Text style={styles.label}>Senha</Text>
        <TextInput
          style={styles.input}
          placeholder="Sua senha"
          placeholderTextColor={colors.placeholder}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
        />
      </View>

      <TouchableOpacity
        style={[styles.button, isLoading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color={colors.textInverse} />
        ) : (
          <Text style={styles.buttonText}>Entrar</Text>
        )}
      </TouchableOpacity>

      <View style={[styles.footer, { marginTop: 16 }]}>
        <Link href="/(auth)/forgot-password" style={styles.link}>
          Esqueci minha senha
        </Link>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Ainda não tem conta? </Text>
        <Link href="/(auth)/phone-verify" style={styles.link}>
          Registre-se
        </Link>
      </View>

      {__DEV__ && (
        <View style={styles.testCredentials}>
          <Text style={styles.testTitle}>Credenciais de Teste:</Text>
          <Text style={styles.testText}>Com comunidade: adm@santarita.com.br / 12345678</Text>
          <Text style={styles.testText}>Sem comunidade: user@test.com / 123456</Text>
        </View>
      )}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Parish</Text>
          <Text style={styles.subtitle}>
            {step === 'twoFactor' ? 'Só mais um passo' : 'Bem-vindo de volta!'}
          </Text>
        </View>

        {step === 'twoFactor' ? renderTwoFactorStep() : renderCredentialsStep()}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      padding: 20,
    },
    header: {
      alignItems: 'center',
      marginBottom: 40,
    },
    title: {
      fontSize: 36,
      fontWeight: 'bold',
      color: colors.text,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginTop: 8,
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
    stepTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    stepDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
      marginBottom: 16,
    },
    inputContainer: {
      marginBottom: 16,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
    },
    codeInput: {
      fontSize: 22,
      letterSpacing: 4,
      textAlign: 'center',
      fontWeight: '700',
    },
    button: {
      backgroundColor: colors.primary,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      backgroundColor: colors.disabled,
    },
    buttonText: {
      color: colors.textInverse,
      fontSize: 16,
      fontWeight: '600',
    },
    secondaryButton: {
      borderRadius: 8,
      padding: 14,
      alignItems: 'center',
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 20,
    },
    footerText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    link: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    testCredentials: {
      marginTop: 24,
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
