import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityActionEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import type { ThemeColors } from '../../constants/Colors';
import {
  FULL_TIME_RANGE,
  TIME_STEPS,
  TimeRange,
  isFullTimeRange,
  spokenStep,
  timeRangeLong,
  timeRangeShort,
} from './format';

/** Área de toque de cada ponto (≥ 44pt) e margem da barra para os pontos das pontas caberem. */
const THUMB_HIT = 44;
const PAD = THUMB_HIT / 2;
const TICKS = [0, 12, 24, 36, 48]; // 0h, 6h, 12h, 18h, 24h

interface Props {
  colors: ThemeColors;
  /** Intervalo aplicado (em posições da barra) */
  range: TimeRange;
  /** Chamado só ao soltar o ponto (ou ao ajustar pelo leitor de tela) */
  onChange: (r: TimeRange) => void;
  open: boolean;
  onToggleOpen: () => void;
}

/**
 * Filtro de horário do mapa: um chip compacto numa linha própria abaixo dos
 * chips de filtro ("Qualquer horário" / "06:00–12:00" com botão de limpar) que
 * abre a barra de 00:00 a 23:59 com dois pontos.
 */
export default function TimeFilter({ colors, range, onChange, open, onToggleOpen }: Props) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const active = !isFullTimeRange(range);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.chipRow} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.chip, active && styles.chipActive]}
          onPress={onToggleOpen}
          activeOpacity={0.85}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open, selected: active }}
          accessibilityLabel={
            active
              ? `Filtro de horário: das ${spokenStep(range[0])} às ${spokenStep(range[1])}`
              : 'Filtro de horário: qualquer horário'
          }
          accessibilityHint={open ? 'Fecha a barra de horário' : 'Abre a barra para escolher o horário'}
        >
          <FontAwesome5 name="clock" size={12} color={active ? '#fff' : colors.textSecondary} />
          <Text style={[styles.chipText, active && styles.chipTextActive]}>
            {active ? timeRangeShort(range) : 'Qualquer horário'}
          </Text>
          <FontAwesome5
            name={open ? 'chevron-up' : 'chevron-down'}
            size={10}
            color={active ? '#fff' : colors.textSecondary}
          />
        </TouchableOpacity>
        {active && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => onChange(FULL_TIME_RANGE)}
            hitSlop={8}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Limpar filtro de horário"
          >
            <FontAwesome5 name="times" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {open && (
        <RangePanel colors={colors} styles={styles} range={range} onChange={onChange} onDone={onToggleOpen} />
      )}
    </View>
  );
}

function RangePanel({
  colors,
  styles,
  range,
  onChange,
  onDone,
}: {
  colors: ThemeColors;
  styles: ReturnType<typeof createStyles>;
  range: TimeRange;
  onChange: (r: TimeRange) => void;
  onDone: () => void;
}) {
  // Estado local durante o arrasto; o mapa só é filtrado ao soltar
  const [draft, setDraft] = useState<TimeRange>(range);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);
  const [trackW, setTrackW] = useState(0);

  const draftRef = useRef<TimeRange>(range);
  const trackWRef = useRef(0);
  const originX = useRef(0); // x da barra na janela
  const boxRef = useRef<View>(null);
  const drag = useRef<{ thumb: 0 | 1; pos: number } | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mudou por fora (ex.: botão de limpar): acompanha
  useEffect(() => {
    if (drag.current) return;
    draftRef.current = range;
    setDraft(range);
  }, [range]);

  const setDraftBoth = (r: TimeRange) => {
    const cur = draftRef.current;
    if (cur[0] === r[0] && cur[1] === r[1]) return;
    draftRef.current = r;
    setDraft(r);
  };

  /** Posição (px dentro da barra) → ponto mais próximo da escala. */
  const stepAt = (pos: number) => {
    const w = trackWRef.current;
    if (w <= 0) return 0;
    return Math.round((Math.min(w, Math.max(0, pos)) / w) * TIME_STEPS);
  };

  const moveThumb = (thumb: 0 | 1, step: number) => {
    const [a, b] = draftRef.current;
    if (thumb === 0) setDraftBoth([Math.min(Math.max(0, step), b - 1), b]);
    else setDraftBoth([a, Math.max(Math.min(TIME_STEPS, step), a + 1)]);
  };

  const commit = () => {
    drag.current = null;
    setDragging(null);
    onChangeRef.current(draftRef.current);
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (_e, g) => {
        const w = trackWRef.current;
        const pos = g.x0 - originX.current - PAD;
        const [a, b] = draftRef.current;
        const xa = (a / TIME_STEPS) * w;
        const xb = (b / TIME_STEPS) * w;
        const da = Math.abs(pos - xa);
        const db = Math.abs(pos - xb);
        // Ponto mais próximo; empate (pontos juntos) decide pelo lado do toque
        const thumb: 0 | 1 = da < db ? 0 : db < da ? 1 : pos < xa ? 0 : 1;
        // Tocou em cima do ponto: arrasta de onde ele está (sem pular)
        const onThumb = Math.min(da, db) <= PAD;
        const startPos = onThumb ? (thumb === 0 ? xa : xb) : pos;
        drag.current = { thumb, pos: startPos };
        setDragging(thumb);
        if (!onThumb) moveThumb(thumb, stepAt(startPos));
      },
      onPanResponderMove: (_e, g) => {
        const d = drag.current;
        if (!d) return;
        moveThumb(d.thumb, stepAt(d.pos + g.dx));
      },
      onPanResponderRelease: commit,
      onPanResponderTerminate: commit,
    }),
  ).current;

  const measure = () => {
    boxRef.current?.measureInWindow((x) => {
      if (Number.isFinite(x)) originX.current = x;
    });
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.max(0, e.nativeEvent.layout.width - PAD * 2);
    trackWRef.current = w;
    setTrackW(w);
    measure();
  };

  const a11yAction = (thumb: 0 | 1) => (e: AccessibilityActionEvent) => {
    const cur = draftRef.current[thumb];
    if (e.nativeEvent.actionName === 'increment') moveThumb(thumb, cur + 1);
    else if (e.nativeEvent.actionName === 'decrement') moveThumb(thumb, cur - 1);
    else return;
    onChangeRef.current(draftRef.current);
  };

  const x = (step: number) => PAD + (step / TIME_STEPS) * trackW;
  const full = isFullTimeRange(draft);

  const thumb = (i: 0 | 1) => (
    <View
      key={i}
      style={[styles.thumbHit, { left: x(draft[i]) - THUMB_HIT / 2 }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={i === 0 ? 'Início do horário' : 'Fim do horário'}
      accessibilityValue={{ min: 0, max: TIME_STEPS, now: draft[i], text: spokenStep(draft[i]) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={a11yAction(i)}
    >
      <View style={[styles.thumb, dragging === i && styles.thumbActive]} />
    </View>
  );

  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.panelTitle} accessibilityLiveRegion="polite">
            {full ? 'Qualquer horário' : timeRangeLong(draft)}
          </Text>
          <Text style={styles.panelHint}>Arraste as bolinhas. Vale a hora em que a celebração começa.</Text>
        </View>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={onDone}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Fechar a barra de horário"
        >
          <Text style={styles.doneText}>Pronto</Text>
        </TouchableOpacity>
      </View>

      <View ref={boxRef} style={styles.slider} onLayout={onLayout} {...responder.panHandlers}>
        <View style={styles.track} pointerEvents="none" />
        {trackW > 0 && (
          <>
            <View
              pointerEvents="none"
              style={[styles.fill, { left: x(draft[0]), width: Math.max(0, x(draft[1]) - x(draft[0])) }]}
            />
            {TICKS.map((t) => (
              <View key={t} pointerEvents="none" style={[styles.tick, { left: x(t) - 0.5 }]} />
            ))}
            {thumb(0)}
            {thumb(1)}
          </>
        )}
      </View>

      <View style={styles.ticksRow} pointerEvents="none">
        {trackW > 0 &&
          TICKS.map((t) => (
            <Text key={t} style={[styles.tickLabel, { left: x(t) - 20 }]}>
              {t === TIME_STEPS ? '24h' : `${t / 2}h`}
            </Text>
          ))}
      </View>
    </View>
  );
}

function createStyles(colors: ThemeColors) {
  const shadow = {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 2,
  };
  return StyleSheet.create({
    wrap: { paddingHorizontal: 12 },
    chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadow,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    clearBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      ...shadow,
    },
    panel: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingTop: 12,
      paddingBottom: 8,
      marginBottom: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.18,
      shadowRadius: 4,
      elevation: 4,
    },
    panelHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
    panelTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
    panelHint: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
    doneBtn: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.highlightLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneText: { fontSize: 14.5, fontWeight: '800', color: colors.primary },
    slider: { height: THUMB_HIT + 4, marginTop: 6, justifyContent: 'center' },
    track: {
      position: 'absolute',
      left: PAD,
      right: PAD,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    fill: { position: 'absolute', height: 6, borderRadius: 3, backgroundColor: colors.primary },
    tick: {
      position: 'absolute',
      width: 1,
      height: 14,
      backgroundColor: colors.textTertiary,
      opacity: 0.6,
    },
    thumbHit: {
      position: 'absolute',
      width: THUMB_HIT,
      height: THUMB_HIT,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumb: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#fff',
      borderWidth: 3,
      borderColor: colors.primary,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.25,
      shadowRadius: 2,
      elevation: 3,
    },
    thumbActive: { width: 32, height: 32, borderRadius: 16 },
    ticksRow: { height: 16 },
    tickLabel: {
      position: 'absolute',
      width: 40,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '600',
      color: colors.textTertiary,
    },
  });
}
