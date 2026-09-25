import React, { useMemo } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Colors';
import type { MapCommunity } from '../../services/publicMapService';
import { cityLine, formatDistance, formatMassTime, isCancelled, isOnSearchedDay, SearchedDay, typeLabel } from './format';

interface Props {
  community: MapCommunity;
  distanceKm: number | null;
  favorite: boolean;
  colors: ThemeColors;
  bottomInset: number;
  onClose: () => void;
  onToggleFavorite: () => void;
  onDirections: () => void;
  onOpen: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** Dia pesquisado no mapa: os horários desse dia ficam em verde */
  day?: SearchedDay;
}

/** Cartão nativo que sobe ao tocar num pino. */
export default function CommunityCard({
  community: c,
  distanceKm,
  favorite,
  colors,
  bottomInset,
  onClose,
  onToggleFavorite,
  onDirections,
  onOpen,
  onLayout,
  day = 'all',
}: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const now = new Date();
  // Até 3 que vão acontecer; as suspensas no meio aparecem riscadas (máx. 4 linhas)
  const masses = useMemo(() => {
    const out: MapCommunity['nextMasses'] = [];
    let active = 0;
    for (const m of c.nextMasses) {
      if (active >= 3 || out.length >= 4) break;
      out.push(m);
      if (!isCancelled(m)) active += 1;
    }
    return out;
  }, [c.nextMasses]);
  const dist = formatDistance(distanceKm);
  const sub = [c.parish?.name, cityLine(c)].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, { paddingBottom: 14 + bottomInset }]} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <View style={styles.pinIcon}>
          <FontAwesome5 name="church" size={15} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={2}>
            {c.name}
          </Text>
          {!!sub && (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={onToggleFavorite}
          hitSlop={10}
          style={styles.iconBtn}
          accessibilityLabel={favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        >
          <FontAwesome5 name="star" solid={favorite} size={17} color={favorite ? colors.gold : colors.textTertiary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Fechar">
          <FontAwesome5 name="times" size={17} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.badges}>
        {!!dist && (
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <FontAwesome5 name="location-arrow" size={9} color="#fff" />
            <Text style={[styles.badgeText, { color: '#fff' }]}>{dist}</Text>
          </View>
        )}
        {c.verified && !c.approximate && (
          <View style={[styles.badge, { backgroundColor: colors.highlightLight }]}>
            <FontAwesome5 name="check-circle" size={10} color={colors.success} solid />
            <Text style={[styles.badgeText, { color: colors.success }]}>pino conferido</Text>
          </View>
        )}
      </View>

      {c.approximate && (
        <View style={styles.approxBox}>
          <FontAwesome5 name="exclamation-triangle" size={11} color={colors.warning} />
          <Text style={styles.approxText}>Localização aproximada — pode estar a quilômetros.</Text>
        </View>
      )}

      <View style={styles.masses}>
        {masses.length > 0 ? (
          masses.map((m) => {
            const off = isCancelled(m);
            const soon = !off && isOnSearchedDay(m, day, now);
            const reason = (m.cancelReason || '').trim();
            return (
              <View key={m.id}>
                <View style={styles.massRow}>
                  <View style={[styles.dot, { backgroundColor: soon ? colors.success : colors.border }]} />
                  <Text
                    style={[
                      styles.massText,
                      soon && { color: colors.success, fontWeight: '800' },
                      off && styles.massTextOff,
                    ]}
                  >
                    {formatMassTime(m.start, now)}
                  </Text>
                  {m.type !== 'MASS' && <Text style={[styles.tag, off && { opacity: 0.55 }]}>{typeLabel(m.type)}</Text>}
                  {m.source === 'event' && <Text style={styles.tag}>especial</Text>}
                  {off && (
                    <View style={styles.offBadge}>
                      <Text style={styles.offBadgeText}>Não haverá</Text>
                    </View>
                  )}
                </View>
                {off && !!reason && (
                  <Text style={styles.offReason} numberOfLines={1}>
                    {reason}
                  </Text>
                )}
              </View>
            );
          })
        ) : (
          <Text style={styles.noMass}>Sem horários cadastrados para os próximos dias.</Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={onDirections} activeOpacity={0.85}>
          <FontAwesome5 name="directions" size={14} color="#fff" />
          <Text style={[styles.btnText, { color: '#fff' }]}>Como chegar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={onOpen} activeOpacity={0.85}>
          <FontAwesome5 name="info-circle" size={14} color={colors.primary} />
          <Text style={[styles.btnText, { color: colors.primary }]}>Ver comunidade</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    pinIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: { fontSize: 17, fontWeight: '800', color: colors.text, lineHeight: 22 },
    sub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    iconBtn: { padding: 4 },
    badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 20,
    },
    badgeText: { fontSize: 12, fontWeight: '800' },
    approxBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.goldSoft,
    },
    approxText: { flex: 1, fontSize: 12.5, color: colors.text, fontWeight: '600' },
    masses: { marginTop: 12, gap: 7 },
    massRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4 },
    massText: { fontSize: 14, color: colors.text, fontWeight: '600' },
    massTextOff: { color: colors.textTertiary, textDecorationLine: 'line-through', fontWeight: '600' },
    offBadge: {
      backgroundColor: colors.error + '1F',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
    },
    offBadgeText: { fontSize: 11, fontWeight: '800', color: colors.error },
    offReason: { fontSize: 12.5, color: colors.textSecondary, marginLeft: 16, marginTop: 1 },
    tag: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      backgroundColor: colors.highlightLight,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: 'hidden',
    },
    noMass: { fontSize: 13, color: colors.textTertiary, fontStyle: 'italic' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    btn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnPrimary: { backgroundColor: colors.primary },
    btnGhost: { backgroundColor: colors.highlightLight },
    btnText: { fontSize: 14.5, fontWeight: '800' },
  });
}
