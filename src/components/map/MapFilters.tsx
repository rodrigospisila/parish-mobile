import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Colors';

export type DayFilter = 'all' | 'today' | 'sunday';

export const TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: 'MASS', label: 'Missa' },
  { key: 'CONFESSION', label: 'Confissão' },
  { key: 'ADORATION', label: 'Adoração' },
];

export const DAY_OPTIONS: { key: DayFilter; label: string }[] = [
  { key: 'all', label: 'Próximos dias' },
  { key: 'today', label: 'Hoje' },
  { key: 'sunday', label: 'Domingo' },
];

interface Props {
  colors: ThemeColors;
  types: string[];
  day: DayFilter;
  approx: boolean;
  onToggleType: (key: string) => void;
  onDay: (d: DayFilter) => void;
  onToggleApprox: () => void;
}

/** Chips de filtro sobre o mapa (tipo · dia · localização aproximada). */
export default function MapFilters({ colors, types, day, approx, onToggleType, onDay, onToggleApprox }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);

  const chip = (key: string, label: string, active: boolean, onPress: () => void, icon?: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityState={{ selected: active }}
    >
      {icon && <FontAwesome5 name={icon as never} size={11} color={active ? '#fff' : colors.textSecondary} />}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {TYPE_OPTIONS.map((t) => chip(t.key, t.label, types.includes(t.key), () => onToggleType(t.key)))}
      <View style={styles.divider} />
      {DAY_OPTIONS.map((d) => chip(d.key, d.label, day === d.key, () => onDay(d.key)))}
      <View style={styles.divider} />
      {chip('approx', 'Mostrar localização aproximada', approx, onToggleApprox, 'map-marker-alt')}
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    scroll: { flexGrow: 0, flexShrink: 0 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    divider: { width: 1, height: 20, backgroundColor: colors.border, marginHorizontal: 2 },
  });
}
