import { View, Text, Button } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';
import { Link } from 'expo-router';

export default function LoginScreen() {
  const { signIn } = useAuth();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, marginBottom: 20 }}>Tela de Login</Text>
      <Button title="Entrar (Placeholder)" onPress={() => signIn('fake-token')} />
      <Link href="/(auth)/register" style={{ marginTop: 20, color: 'blue' }}>
        Ainda não tem conta? Registre-se
      </Link>
    </View>
  );
}
