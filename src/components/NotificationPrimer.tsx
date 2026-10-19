import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

/** Quando a pessoa tocou em "Agora não" (o convite volta depois de alguns dias). */
const DISMISSED_KEY = '@parish:pushPrimer:dismissedAt';
const ASK_AGAIN_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
/** Espera a tela de destino aparecer antes do convite (não "pula" na cara). */
const SHOW_DELAY_MS = 1200;

/** Convite já mostrado nesta execução do app (uma vez por abertura, no máximo). */
let shownThisSession = false;

/**
 * Pré-permissão de notificações (ux-acesso-08 / ux-app-17): explica para que
 * servem os avisos ANTES do diálogo do sistema. Só "Ativar avisos" chama o
 * diálogo; "Agora não" guarda a data e o convite volta em 14 dias. Aparece
 * depois do login, já dentro do app, e só quando o sistema ainda não foi
 * perguntado (quem negou vê o atalho para os Ajustes no Perfil).
 */
export default function NotificationPrimer({ enabled }: { enabled: boolean }) {
  const colors = useColors();
  const styles = createStyles(colors);
  const { permissionChecked, permissionStatus, requestPermission } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const eligible = enabled && permissionChecked && permissionStatus === 'undetermined';

  useEffect(() => {
    if (!eligible || shownThisSession) {
      if (!eligible) setVisible(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      let dismissedAt = 0;
      try {
        dismissedAt = Number((await AsyncStorage.getItem(DISMISSED_KEY)) ?? 0) || 0;
      } catch {
        dismissedAt = 0;
      }
      if (cancelled || shownThisSession) return;
      if (dismissedAt && Date.now() - dismissedAt < ASK_AGAIN_AFTER_MS) return;
      shownThisSession = true;
      setVisible(true);
    }, SHOW_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eligible]);

  const accept = async () => {
    setBusy(true);
    try {
      await requestPermission();
    } finally {
      setBusy(false);
      setVisible(false);
    }
  };

  const later = () => {
    AsyncStorage.setItem(DISMISSED_KEY, String(Date.now())).catch(() => undefined);
    setVisible(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.iconWrap}>
            <Ionicons name="notifications-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Avisos de escala, catequese e da sua paróquia
          </Text>
          <Text style={styles.body}>
            Quer ser avisado(a) quando for escalado(a), quando a catequese mandar recado e quando a paróquia
            publicar um aviso ou mudar um horário? Você pode desligar quando quiser no Perfil.
          </Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void accept()}
            disabled={busy}
            accessibilityRole="button"
          >
            {busy ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.primaryBtnText}>Ativar avisos</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={later} disabled={busy} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Agora não</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(11, 28, 44, 0.72)',
      justifyContent: 'center',
      padding: 20,
    },
    card: { backgroundColor: colors.card, borderRadius: 16, padding: 20 },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary + '1A',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: 12,
    },
    title: { fontSize: 19, fontWeight: '800', color: colors.text, marginBottom: 10, textAlign: 'center' },
    body: { fontSize: 15, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: '800' },
    secondaryBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
    secondaryBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  });
