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
import { Link, useRouter } from 'expo-router';
import { authService } from '../../src/services/authService';
import { useColors } from '../../src/context/ThemeContext';

/**
 * Recuperação de senha por autoatendimento (roadmap 1.4).
 * Etapa 1 solicita o código; etapa 2 redefine a senha com o código recebido.
 */
export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRequest = async () => {
    if (!email.trim()) {
      Alert.alert('Atenção', 'Informe seu e-mail.');
      return;
    }
    setIsLoading(true);
    try {
      const message = await authService.forgotPassword({ email: email.trim() });
      Alert.alert('Solicitação enviada', message);
      setStep('reset');
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível processar a solicitação.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async () => {
    if (!token.trim() || !newPassword) {
      Alert.alert('Atenção', 'Informe o código e a nova senha.');
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert('Atenção', 'A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Atenção', 'As senhas não coincidem.');
      return;
    }
    setIsLoading(true);
    try {
      const message = await authService.resetPassword(token.trim(), newPassword);
      Alert.alert('Pronto', message, [
        { text: 'Ir para o login', onPress: () => router.replace('/(auth)/login') },
      ]);
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Token inválido ou expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Recuperar Senha</Text>
          <Text style={styles.subtitle}>
            {step === 'request'
              ? 'Informe seu e-mail para receber o código'
              : 'Informe o código recebido e a nova senha'}
          </Text>
        </View>

        <View style={styles.form}>
          {step === 'request' ? (
            <>
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
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleRequest}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>Enviar código</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Código de redefinição</Text>
                <TextInput
                  style={styles.input}
                  placeholder="cole o código recebido"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  value={token}
                  onChangeText={setToken}
                  editable={!isLoading}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Nova senha</Text>
                <TextInput
                  style={styles.input}
                  placeholder="mínimo 8 caracteres"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  value={newPassword}
                  onChangeText={setNewPassword}
                  editable={!isLoading}
                />
              </View>
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Confirmar nova senha</Text>
                <TextInput
                  style={styles.input}
                  placeholder="repita a nova senha"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  editable={!isLoading}
                />
              </View>
              <TouchableOpacity
                style={[styles.button, isLoading && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.buttonText}>Redefinir senha</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep('request')} disabled={isLoading}>
                <Text style={[styles.link, { textAlign: 'center', marginTop: 12 }]}>
                  Solicitar outro código
                </Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.footer}>
            <Link href="/(auth)/login" style={styles.link}>
              Voltar ao login
            </Link>
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
    title: { fontSize: 28, fontWeight: 'bold', color: colors.text },
    subtitle: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
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
      fontSize: 16,
      color: colors.text,
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
    link: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  });
