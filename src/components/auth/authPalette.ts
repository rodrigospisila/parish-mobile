import { useColors, useTheme } from '../../context/ThemeContext';

export type AuthColors = ReturnType<typeof useColors>;

/** Degradê da marca (mesmo azul-marinho do ícone e da splash) */
export const HERO_GRADIENT = ['#0B1C2C', '#17324D', '#0B4A8A'] as const;

/** Site público (termos de uso e política de privacidade) */
export const AUTH_WEB_URL = 'https://parish-web-three.vercel.app';

/** Servidor pode demorar a acordar: depois disso o botão avisa que ainda está conectando */
export const SLOW_REQUEST_MS = 8000;

/**
 * Cores das telas de acesso com contraste conferido (WCAG AA): borda de campo ≥ 3:1,
 * texto e links ≥ 4,5:1 — nos dois temas.
 */
export const authPalette = (colors: AuthColors, isDark: boolean) => ({
  link: isDark ? colors.primaryLight : colors.primary,
  error: isDark ? '#FF8A8F' : colors.error,
  fieldBorder: isDark ? '#6B7480' : '#8A96A3',
  fieldBackground: isDark ? '#1A1D22' : colors.inputBackground,
  placeholder: isDark ? colors.placeholder : '#6B7785',
});
export type AuthPalette = ReturnType<typeof authPalette>;

/** Cores do tema + paleta das telas de acesso */
export function useAuthPalette() {
  const colors = useColors();
  const { isDark } = useTheme();
  return { colors, isDark, palette: authPalette(colors, isDark) };
}
