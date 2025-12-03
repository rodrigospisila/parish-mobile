import { View, Text, Button } from 'react-native';
import { useAuth } from '../../src/context/AuthContext';

export default function HomeScreen() {
  const { signOut } = useAuth();

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, marginBottom: 20 }}>Tela Inicial (Home)</Text>
      <Text>Próxima Missa: [Implementar aqui]</Text>
      <Button title="Sair" onPress={signOut} />
    </View>
  );
}
