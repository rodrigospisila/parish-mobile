import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Colors';
import type { MapCommunity } from '../../services/publicMapService';
import { cityLine, firstActiveMass, formatDistance, formatMassTime, isCancelled, isSoon, typeLabel } from './format';

export interface ListItem {
  community: MapCommunity;
  distanceKm: number | null;
  favorite: boolean;
}

interface Props {
  colors: ThemeColors;
  items: ListItem[];
  open: boolean;
  openHeight: number;
  collapsedHeight: number;
  bottomInset: number;
  title: string;
  subtitle?: string | null;
  loading: boolean;
  emptyText: string;
  onToggle: () => void;
  onPressItem: (c: MapCommunity) => void;
  onToggleFavorite: (id: string) => void;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * Painel inferior com a lista das igrejas visíveis. Alterna entre recolhido
 * (só o resumo) e aberto (lista) com uma animação simples — sem biblioteca de
 * bottom sheet.
 */
export default function ChurchListPanel({
  colors,
  items,
  open,
  openHeight,
  collapsedHeight,
  bottomInset,
  title,
  subtitle,
  loading,
  emptyText,
  onToggle,
  onPressItem,
  onToggleFavorite,
  onLayout,
}: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const total = openHeight + bottomInset;
  const closedOffset = Math.max(0, openHeight - collapsedHeight);
  const translate = useRef(new Animated.Value(open ? 0 : closedOffset)).current;

  useEffect(() => {
    Animated.spring(translate, {
      toValue: open ? 0 : closedOffset,
      useNativeDriver: true,
      bounciness: 2,
      speed: 16,
    }).start();
  }, [open, closedOffset, translate]);

  const now = new Date();

  const renderItem = ({ item }: { item: ListItem }) => {
    const c = item.community;
    // Próximo horário que vai mesmo acontecer; uma suspensão antes dele vira aviso
    const next = firstActiveMass(c.nextMasses);
    const soon = next ? isSoon(next, now) : false;
    const skipped = c.nextMasses.find((m) => isCancelled(m) && (!next || m.start < next.start));
    const dist = formatDistance(item.distanceKm);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => onPressItem(c)}>
        <View
          style={[
            styles.rowIcon,
            {
              backgroundColor: item.favorite ? colors.gold : c.approximate ? colors.textTertiary : colors.primary,
            },
          ]}
        >
          <FontAwesome5 name="church" size={12} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {c.name}
          </Text>
          <Text style={styles.rowSub} numberOfLines={1}>
            {[dist, c.parish?.name, cityLine(c)].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.rowMass}>
            {next ? (
              <>
                {soon && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
                <Text style={[styles.rowMassText, soon && { color: colors.success, fontWeight: '800' }]} numberOfLines={1}>
                  {formatMassTime(next.start, now)}
                  {next.type !== 'MASS' ? ` · ${typeLabel(next.type)}` : ''}
                </Text>
              </>
            ) : (
              <Text style={styles.rowNoMass}>Sem horários nos próximos dias</Text>
            )}
            {c.approximate && <Text style={styles.approxTag}>aproximada</Text>}
          </View>
          {!!skipped && (
            <View style={styles.rowMass}>
              <Text style={styles.offTag}>Não haverá</Text>
              <Text style={styles.rowOffText} numberOfLines={1}>
                {formatMassTime(skipped.start, now)}
                {skipped.type !== 'MASS' ? ` · ${typeLabel(skipped.type)}` : ''}
              </Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          onPress={() => onToggleFavorite(c.id)}
          hitSlop={10}
          style={{ padding: 4 }}
          accessibilityLabel={item.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <FontAwesome5
            name="star"
            solid={item.favorite}
            size={15}
            color={item.favorite ? colors.gold : colors.textTertiary}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Animated.View
      style={[styles.panel, { height: total, transform: [{ translateY: translate }] }]}
      onLayout={onLayout}
    >
      <TouchableOpacity style={styles.header} activeOpacity={0.9} onPress={onToggle}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {!!subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <FontAwesome5 name={open ? 'chevron-down' : 'chevron-up'} size={14} color={colors.textSecondary} />
          )}
        </View>
      </TouchableOpacity>
      <FlatList
        data={items}
        keyExtractor={(it) => it.community.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: bottomInset + 16 }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        ListEmptyComponent={<Text style={styles.empty}>{emptyText}</Text>}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
      />
    </Animated.View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    panel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 12,
      overflow: 'hidden',
    },
    header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    title: { fontSize: 16, fontWeight: '800', color: colors.text },
    subtitle: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
    rowIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    rowName: { fontSize: 15, fontWeight: '800', color: colors.text },
    rowSub: { fontSize: 12.5, color: colors.textSecondary, marginTop: 1 },
    rowMass: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
    rowMassText: { fontSize: 13, color: colors.text, fontWeight: '600', flexShrink: 1 },
    rowOffText: {
      fontSize: 12.5,
      color: colors.textTertiary,
      textDecorationLine: 'line-through',
      flexShrink: 1,
    },
    offTag: {
      fontSize: 10.5,
      fontWeight: '800',
      color: colors.error,
      backgroundColor: colors.error + '1F',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      overflow: 'hidden',
    },
    rowNoMass: { fontSize: 12.5, color: colors.textTertiary, fontStyle: 'italic' },
    approxTag: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.warning,
      backgroundColor: colors.goldSoft,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 6,
      overflow: 'hidden',
    },
    dot: { width: 7, height: 7, borderRadius: 4 },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 58 },
    empty: {
      fontSize: 13.5,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 24,
      paddingVertical: 24,
      lineHeight: 20,
    },
  });
}
