import React, { useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';
import {
  AuthButton,
  AuthCard,
  AuthErrorBox,
  AuthField,
  AuthLink,
  AuthScreen,
  authErrorMessage,
  useAnnouncedError,
} from '../src/components/auth';

const MIN_LENGTH = 8;

/**
 * Trocar a senha (M18). Duas entradas:
 * - obrigatória: conta criada ou senha redefinida pela secretaria
 *   (`forcePasswordChange`) — o layout só libera o app depois da troca;
 * - voluntária: pela tela Segurança.
 * Ao trocar, as sessões dos outros aparelhos são encerradas no servidor; a
 * senha guardada para o Face ID/digital é atualizada (AuthContext).
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { user, changePassword, signOut } = useAuth();
  const forced = !!user?.forcePasswordChange;

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, showError, clearError] = useAnnouncedError();
  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const onEdit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (errorMessage) clearError();
  };

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const handleSave = async () => {
    if (!currentPassword) {
      showError(forced ? 'Digite a senha que você recebeu da secretaria.' : 'Digite a sua senha atual.');
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      showError(`A nova senha precisa ter pelo menos ${MIN_LENGTH} caracteres.`);
      newRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('As duas senhas não são iguais. Digite a mesma senha nos dois campos.');
      confirmRef.current?.focus();
      return;
    }
    if (newPassword === currentPassword) {
      showError('A nova senha precisa ser diferente da atual.');
      newRef.current?.focus();
      return;
    }
    Keyboard.dismiss();
    clearError();
    setIsLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      Alert.alert('Senha alterada', 'Pronto! Nos outros aparelhos será preciso entrar de novo com a senha nova.');
      // Troca obrigatória: segue para o app (o layout leva ao assistente de comunidade se faltar)
      if (forced) router.replace('/(tabs)');
      else leave();
    } catch (error: any) {
      showError(authErrorMessage(error, 'Não foi possível trocar a senha. Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthScreen subtitle="Trocar a senha" onBack={forced || isLoading ? undefined : leave}>
      <AuthCard
        icon="lock"
        title={forced ? 'Crie a sua senha' : 'Trocar a senha'}
        subtitle={
          forced
            ? 'Sua conta foi criada (ou a senha foi redefinida) pela secretaria. Para continuar, escolha uma senha nova — só você vai conhecê-la.'
            : 'Digite a senha atual e escolha uma nova.'
        }
      >
        <AuthErrorBox message={errorMessage} />

        <AuthField
          label={forced ? 'Senha recebida da secretaria' : 'Senha atual'}
          icon="key"
          secureToggle
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => newRef.current?.focus()}
          value={currentPassword}
          onChangeText={onEdit(setCurrentPassword)}
          editable={!isLoading}
        />
        <AuthField
          inputRef={newRef}
          label="Nova senha"
          icon="lock"
          placeholder={`Mínimo ${MIN_LENGTH} caracteres`}
          hint={`Pelo menos ${MIN_LENGTH} letras, números ou símbolos.`}
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
          onSubmitEditing={handleSave}
          value={confirmPassword}
          onChangeText={onEdit(setConfirmPassword)}
          editable={!isLoading}
        />

        <AuthButton label="Salvar a nova senha" busyLabel="Salvando…" onPress={handleSave} loading={isLoading} />
        <View style={styles.footer}>
          {forced ? (
            <AuthLink label="Sair" onPress={() => void signOut()} disabled={isLoading} accessibilityRole="button" />
          ) : (
            <AuthLink label="Cancelar" onPress={leave} disabled={isLoading} accessibilityRole="button" />
          )}
        </View>
      </AuthCard>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
});
