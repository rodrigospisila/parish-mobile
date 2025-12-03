import { View, Text } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24 }}>Tela de Perfil</Text>
      <Text>Informações do Usuário</Text>
    </View>
  );
}
