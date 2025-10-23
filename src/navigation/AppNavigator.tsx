import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TouchableOpacity, Text } from 'react-native';

import { useAuth } from '../contexts/AuthContext';

// Auth Screens
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';

// Main Screens
import HomeScreen from '../screens/HomeScreen';
import LiturgyScreen from '../screens/LiturgyScreen';
import EventsScreen from '../screens/EventsScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';
import SchedulesScreen from '../screens/SchedulesScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}

function EventsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: {
          backgroundColor: '#6B46C1',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen
        name="EventsList"
        component={EventsScreen}
        options={{ title: 'Eventos' }}
      />
      <Stack.Screen
        name="EventDetails"
        component={EventDetailsScreen}
        options={{ title: 'Detalhes do Evento' }}
      />
    </Stack.Navigator>
  );
}

function HomeTabs() {
  const { signOut } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#6B46C1',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          paddingBottom: 8,
          paddingTop: 8,
          height: 60,
        },
        headerStyle: {
          backgroundColor: '#6B46C1',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Início',
          tabBarLabel: 'Início',
          headerRight: () => (
            <TouchableOpacity
              onPress={signOut}
              style={{ marginRight: 16 }}
            >
              <Text style={{ color: '#fff', fontSize: 14 }}>Sair</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen
        name="Liturgy"
        component={LiturgyScreen}
        options={{
          title: 'Liturgia Diária',
          tabBarLabel: 'Liturgia',
        }}
      />
      <Tab.Screen
        name="Events"
        component={EventsStack}
        options={{
          title: 'Eventos',
          tabBarLabel: 'Eventos',
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Schedules"
        component={SchedulesScreen}
        options={{
          title: 'Minhas Escalas',
          tabBarLabel: 'Escalas',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Perfil',
          tabBarLabel: 'Perfil',
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer>
      {user ? <HomeTabs /> : <AuthStack />}
    </NavigationContainer>
  );
}

