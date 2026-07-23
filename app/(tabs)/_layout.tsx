import { Tabs } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { useAuth } from '../../src/context/AuthContext';

function TabBarIcon(props: { name: React.ComponentProps<typeof FontAwesome>['name']; color: string }) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colors = useColors();
  const { user } = useAuth();
  const COORDINATOR_ROLES = new Set(['COORDINATOR', 'Coordenador', 'Vice-Coordenador']);
  const canCoordinate =
    (!!user?.role &&
      ['SYSTEM_ADMIN', 'DIOCESAN_ADMIN', 'PARISH_ADMIN', 'COMMUNITY_COORDINATOR', 'PASTORAL_COORDINATOR'].includes(
        user.role,
      )) ||
    !!user?.pastorals?.some((p) => !!p.role && COORDINATOR_ROLES.has(p.role));
  const isPastoralMember = !!user?.pastoralIds?.length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.border,
        },
        headerStyle: {
          backgroundColor: colors.surface,
        },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Início',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: 'Calendário',
          tabBarIcon: ({ color }) => <TabBarIcon name="calendar" color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="pastorals"
        options={{
          title: 'Pastorais',
          tabBarIcon: ({ color }) => <TabBarIcon name="users" color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Minha Escala',
          tabBarIcon: ({ color }) => <TabBarIcon name="check-square-o" color={color} />,
          headerShown: false,
          href: isPastoralMember ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="coordination"
        options={{
          title: 'Coordenação',
          tabBarIcon: ({ color }) => <TabBarIcon name="list-ul" color={color} />,
          headerShown: false,
          href: canCoordinate ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}
