/**
 * Paleta de cores do aplicativo Parish
 * Suporte para modo claro (light) e modo escuro (dark)
 */

export const Colors = {
  light: {
    // Cores primárias
    primary: '#007AFF',
    primaryLight: '#4DA3FF',
    primaryDark: '#0056B3',

    // Cores de fundo
    background: '#F5F5F5',
    surface: '#FFFFFF',
    card: '#FFFFFF',

    // Cores de texto
    text: '#333333',
    textSecondary: '#666666',
    textTertiary: '#999999',
    textInverse: '#FFFFFF',

    // Cores de borda
    border: '#DDDDDD',
    borderLight: '#EEEEEE',

    // Cores de status/feedback
    success: '#27AE60',
    warning: '#F39C12',
    error: '#E74C3C',
    info: '#3498DB',

    // Cores específicas de eventos
    eventMissa: '#E74C3C',
    eventReuniao: '#3498DB',
    eventAtividade: '#27AE60',

    // Cores de UI
    tabBar: '#FFFFFF',
    tabBarInactive: '#8E8E93',
    inputBackground: '#F9F9F9',
    placeholder: '#999999',
    disabled: '#CCCCCC',

    // Overlay e Modal
    overlay: 'rgba(0, 0, 0, 0.5)',
    modalBackground: '#FFFFFF',

    // Cores de destaque
    highlight: '#00ADF5',
    highlightLight: '#E6F7FF',
  },

  dark: {
    // Cores primárias
    primary: '#0A84FF',
    primaryLight: '#4DA3FF',
    primaryDark: '#0056B3',

    // Cores de fundo
    background: '#000000',
    surface: '#1C1C1E',
    card: '#2C2C2E',

    // Cores de texto
    text: '#FFFFFF',
    textSecondary: '#ABABAB',
    textTertiary: '#8E8E93',
    textInverse: '#000000',

    // Cores de borda
    border: '#38383A',
    borderLight: '#2C2C2E',

    // Cores de status/feedback
    success: '#30D158',
    warning: '#FFD60A',
    error: '#FF453A',
    info: '#64D2FF',

    // Cores específicas de eventos
    eventMissa: '#FF453A',
    eventReuniao: '#64D2FF',
    eventAtividade: '#30D158',

    // Cores de UI
    tabBar: '#1C1C1E',
    tabBarInactive: '#8E8E93',
    inputBackground: '#2C2C2E',
    placeholder: '#8E8E93',
    disabled: '#48484A',

    // Overlay e Modal
    overlay: 'rgba(0, 0, 0, 0.7)',
    modalBackground: '#2C2C2E',

    // Cores de destaque
    highlight: '#0A84FF',
    highlightLight: '#1C3A5E',
  },
};

// Tipo para as cores do tema
export type ThemeColors = typeof Colors.light;

// Tipo para o nome do tema
export type ThemeName = 'light' | 'dark' | 'system';
