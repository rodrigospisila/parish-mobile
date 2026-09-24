import React, { useRef, useState } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { authService } from '../../src/services/authService';
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthLink,
  AuthScreen,
  authErrorMessage,
  useAnnouncedError,
} from '../../src/components/auth';

/**
 * Recuperação de senha por autoatendimento (roadmap 1.4).
 * Etapa 1 solicita o código; etapa 2 redefine a senha com o código recebido.
 */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  // Vem preenchido quando a pessoa já digitou o e-mail na tela de login
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  // Resposta do servidor ao pedir o código / ao salvar a nova senha
  const [notice, setNotice] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  // Volta para o login que já está na pilha (sem empilhar um login duplicado)
  const goToLogin = () => router.dismissTo('/(auth)/login');

  const onEdit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (errorMessage) clearError();
  };

  const handleRequest = async () => {
    if (!email.trim()) {
      showError('Digite o e-mail da sua conta.');
      return;
    }
    Keyboard.dismiss();
    clearError();
    setIsLoading(true);
    try {
      const message = await authService.forgotPassword({ email: email.trim() });
      setNotice(message);
      setToken('');
      setStep('reset');
    } catch (error: any) {
      showError(authErrorMessage(error, 'Não foi possível processar a solicitação. Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!token.trim()) {
      showError('Cole ou digite o código que você recebeu.');
      return;
    }
    if (!newPassword) {
      showError('Digite a nova senha.');
      passwordRef.current?.focus();
      return;
    }
    if (newPassword.length < 8) {
      showError('A nova senha precisa ter pelo menos 8 caracteres.');
      passwordRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('As duas senhas não são iguais. Digite a mesma senha nos dois campos.');
      confirmRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    clearError();
    setIsLoading(true);
    try {
      const message = await authService.resetPassword(token.trim(), newPassword);
      setNotice(message);
      setStep('done');
    } catch (error: any) {
      const raw: string = error?.message || '';
      showError(
        /token/i.test(raw)
          ? 'O código está errado ou já venceu. Confira o código ou peça outro.'
          : authErrorMessage(error, 'Não foi possível salvar a nova senha. Tente novamente.'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const backToRequest = () => {
    clearError();
    setNotice('');
    setStep('request');
  };

  const footer = (
    <View style={styles.footer}>
      <AuthLink label="Voltar para o login" onPress={goToLogin} disabled={isLoading} />
    </View>
  );

  return (
    <AuthScreen
      subtitle="Vamos criar uma nova senha"
      onBack={() => (step === 'reset' && !isLoading ? backToRequest() : goToLogin())}
    >
      {step === 'request' && (
        <AuthCard
          icon="key"
          title="Esqueceu a senha?"
          subtitle="Digite o e-mail da sua conta. Vamos mandar um código para você criar uma senha nova."
        >
          <AuthErrorBox message={errorMessage} />

          <AuthField
            label="E-mail"
            icon="envelope"
            placeholder="seu@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            returnKeyType="send"
            onSubmitEditing={handleRequest}
            value={email}
            onChangeText={onEdit(setEmail)}
            editable={!isLoading}
          />

          <AuthButton label="Enviar código" busyLabel="Enviando…" onPress={handleRequest} loading={isLoading} />
          {footer}
        </AuthCard>
      )}

      {step === 'reset' && (
        <AuthCard
          icon="lock"
          title="Crie a nova senha"
          subtitle="Digite o código que você recebeu e escolha uma senha nova."
        >
          <AuthErrorBox message={errorMessage} />
          <AuthErrorBox message={errorMessage ? '' : notice} tone="info" />

          <AuthField
            label="Código recebido"
            icon="hashtag"
            placeholder="Cole ou digite o código"
            hint="O código chega por SMS ou e-mail. Você pode copiar e colar aqui."
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
            value={token}
            onChangeText={onEdit(setToken)}
            editable={!isLoading}
          />
          <AuthField
            inputRef={passwordRef}
            label="Nova senha"
            icon="lock"
            placeholder="Mínimo 8 caracteres"
            hint="Pelo menos 8 letras, números ou símbolos."
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => confirmRef.current?.focus()}
            value={newPassword}
            onChangeText={onEdit(setNewPassword)}
            editable={!isLoading}
          />
          <AuthField
            inputRef={confirmRef}
            label="Repita a nova senha"
            icon="lock"
            placeholder="Digite a mesma senha"
            secureToggle
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={handleReset}
            value={confirmPassword}
            onChangeText={onEdit(setConfirmPassword)}
            editable={!isLoading}
          />

          <AuthButton label="Salvar nova senha" busyLabel="Salvando…" onPress={handleReset} loading={isLoading} />
          <AuthLink
            label="Não recebi — pedir outro código"
            onPress={backToRequest}
            disabled={isLoading}
            accessibilityRole="button"
            style={styles.centerLink}
          />
          {footer}
        </AuthCard>
      )}

      {step === 'done' && (
        <AuthCard
          icon="check"
          title="Senha alterada!"
          subtitle={notice || 'Senha redefinida com sucesso. Faça login com a nova senha.'}
        >
          <AuthButton label="Ir para o login" onPress={goToLogin} />
        </AuthCard>
      )}
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  centerLink: { alignSelf: 'center', marginTop: 8 },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
});
