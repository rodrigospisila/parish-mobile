import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useColors } from '../context/ThemeContext';
import { ThemeColors } from '../constants/Colors';

/**
 * Hook para criar estilos dinâmicos baseados no tema atual.
 * 
 * @example
 * const styles = useThemedStyles((colors) => ({
 *   container: {
 *     backgroundColor: colors.background,
 *   },
 *   text: {
 *     color: colors.text,
 *   },
 * }));
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  styleFactory: (colors: ThemeColors) => T
): T {
  const colors = useColors();
  
  return useMemo(() => {
    return StyleSheet.create(styleFactory(colors));
  }, [colors, styleFactory]);
}

/**
 * Hook para obter cores de eventos baseadas no tema atual.
 */
export function useEventColors() {
  const colors = useColors();
  
  return useMemo(() => ({
    MISSA: colors.eventMissa,
    REUNIAO: colors.eventReuniao,
    ATIVIDADE: colors.eventAtividade,
  }), [colors]);
}
