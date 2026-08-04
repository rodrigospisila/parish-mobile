/**
 * Paleta de cores do aplicativo Parish — Identidade Visual v2.0
 * Suporte para modo claro (light) e modo escuro (dark).
 *
 * Diretriz da marca:
 *  - No modo escuro, ação = Azul Parish (#0A84FF).
 *  - No modo claro, ação = Azul Santuário (#075AA9).
 *  - Dourado Altar (#D8A83E) só na marca e em destaques especiais.
 */

export const Colors = {
  light: {
    // Cores primárias (ação no claro = Azul Santuário)
    primary: '#075AA9',
    primaryLight: '#0A84FF',
    primaryDark: '#17324D',

    // Marca
    gold: '#D8A83E',
    goldSoft: '#F4E2B3',

    // Cores de fundo
    background: '#F5F7FA',
    surface: '#FFFFFF',
    card: '#FFFFFF',

    // Cores de texto
    text: '#151A20',
    textSecondary: '#52606D',
    textTertiary: '#8B97A4',
    textInverse: '#FFFFFF',

    // Cores de borda
    border: '#D8DEE6',
    borderLight: '#E9EDF2',

    // Cores de status/feedback
    success: '#2E9D62',
    warning: '#C78216',
    error: '#C53B42',
    info: '#2979C8',

    // Cores específicas de eventos
    eventMissa: '#C53B42',
    eventReuniao: '#2979C8',
    eventAtividade: '#2E9D62',

    // Cores de UI
    tabBar: '#FFFFFF',
    tabBarInactive: '#8B97A4',
    inputBackground: '#F1F4F8',
    placeholder: '#8B97A4',
    disabled: '#C3CBD4',

    // Overlay e Modal
    overlay: 'rgba(11, 28, 44, 0.5)',
    modalBackground: '#FFFFFF',

    // Cores de destaque (Azul Parish + Azul suave)
    highlight: '#0A84FF',
    highlightLight: '#EAF4FF',
  },

  dark: {
    // Cores primárias (ação no escuro = Azul Parish)
    primary: '#0A84FF',
    primaryLight: '#4DA3FF',
    primaryDark: '#075AA9',

    // Marca
    gold: '#D8A83E',
    goldSoft: '#3A2F14',

    // Cores de fundo
    background: '#090B0E',
    surface: '#171A1F',
    card: '#24282E',

    // Cores de texto
    text: '#F7F9FB',
    textSecondary: '#AEB6C1',
    textTertiary: '#8A929E',
    textInverse: '#000000',

    // Cores de borda
    border: '#2C333B',
    borderLight: '#24282E',

    // Cores de status/feedback
    success: '#35C36E',
    warning: '#E3B24A',
    error: '#E1565C',
    info: '#5AA9EC',

    // Cores específicas de eventos
    eventMissa: '#E1565C',
    eventReuniao: '#5AA9EC',
    eventAtividade: '#35C36E',

    // Cores de UI
    tabBar: '#171A1F',
    tabBarInactive: '#8A929E',
    inputBackground: '#24282E',
    placeholder: '#8A929E',
    disabled: '#3A4048',

    // Overlay e Modal
    overlay: 'rgba(0, 0, 0, 0.7)',
    modalBackground: '#24282E',

    // Cores de destaque
    highlight: '#0A84FF',
    highlightLight: '#12324E',
  },
};

// Tipo para as cores do tema
export type ThemeColors = typeof Colors.light;

// Tipo para o nome do tema
export type ThemeName = 'light' | 'dark' | 'system';
