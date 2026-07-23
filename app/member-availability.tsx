import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useColors } from '../src/context/ThemeContext';
import {
  MemberAvailabilityResponse,
  getMyAvailability,
  updateMyAvailability,
} from '../src/services/memberAvailabilityService';

type RuleForm = {
  id: string;
  dayOfWeek: number;
  start: string;
  end: string;
  notes: string;
};

type ExceptionForm = {
  id: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  notes: string;
};

const weekdayLabels = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mins = Math.floor(minutes % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${mins}`;
};

const toRuleForm = (data: MemberAvailabilityResponse): RuleForm[] =>
  data.rules.map((rule, index) => ({
    id: rule.id || `rule-${index}`,
    dayOfWeek: rule.dayOfWeek,
    start: minutesToTime(rule.startMinutes),
    end: minutesToTime(rule.endMinutes),
    notes: rule.notes || '',
  }));

const toExceptionForm = (data: MemberAvailabilityResponse): ExceptionForm[] =>
  data.exceptions.map((item, index) => {
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    return {
      id: item.id || `exception-${index}`,
      startDate: `${start.getFullYear()}-${(start.getMonth() + 1).toString().padStart(2, '0')}-${start
        .getDate()
        .toString()
        .padStart(2, '0')}`,
      startTime: `${start.getHours().toString().padStart(2, '0')}:${start
        .getMinutes()
        .toString()
        .padStart(2, '0')}`,
      endDate: `${end.getFullYear()}-${(end.getMonth() + 1).toString().padStart(2, '0')}-${end
        .getDate()
        .toString()
        .padStart(2, '0')}`,
      endTime: `${end.getHours().toString().padStart(2, '0')}:${end
        .getMinutes()
        .toString()
        .padStart(2, '0')}`,
      notes: item.notes || '',
    };
  });

export default function MemberAvailabilityScreen() {
  const colors = useColors();
  const router = useRouter();
  const [availability, setAvailability] = useState<MemberAvailabilityResponse | null>(null);
  const [rules, setRules] = useState<RuleForm[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionForm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const styles = createStyles(colors);

  const loadAvailability = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getMyAvailability();
      setAvailability(data);
      setRules(toRuleForm(data));
      setExceptions(toExceptionForm(data));
    } catch (error) {
      console.error('Erro ao carregar disponibilidade:', error);
      Alert.alert('Erro', 'Não foi possível carregar sua disponibilidade.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAvailability();
    }, [loadAvailability]),
  );

  const groupedRules = useMemo(() => {
    return weekdayLabels.map((label, dayOfWeek) => ({
      label,
      dayOfWeek,
      items: rules.filter((rule) => rule.dayOfWeek === dayOfWeek),
    }));
  }, [rules]);

  const updateRule = (id: string, key: keyof RuleForm, value: string | number) => {
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, [key]: value } : rule)),
    );
  };

  const updateException = (id: string, key: keyof ExceptionForm, value: string) => {
    setExceptions((current) =>
      current.map((item) => (item.id === id ? { ...item, [key]: value } : item)),
    );
  };

  const addRule = (dayOfWeek: number) => {
    setRules((current) => [
      ...current,
      {
        id: `${dayOfWeek}-${Date.now()}-${current.length}`,
        dayOfWeek,
        start: '19:00',
        end: '21:00',
        notes: '',
      },
    ]);
  };

  const addException = () => {
    setExceptions((current) => [
      ...current,
      {
        id: `exception-${Date.now()}-${current.length}`,
        startDate: '',
        startTime: '00:00',
        endDate: '',
        endTime: '23:59',
        notes: '',
      },
    ]);
  };

  const removeRule = (id: string) => {
    setRules((current) => current.filter((rule) => rule.id !== id));
  };

  const removeException = (id: string) => {
    setExceptions((current) => current.filter((item) => item.id !== id));
  };

  const parseTime = (value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) {
      return null;
    }

    const [hoursText, minutesText] = value.split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (
      Number.isNaN(hours) ||
      Number.isNaN(minutes) ||
      hours < 0 ||
      hours > 23 ||
      minutes < 0 ||
      minutes > 59
    ) {
      return null;
    }

    return hours * 60 + minutes;
  };

  const saveAvailability = async () => {
    if (!availability?.hasMember) {
      return;
    }

    const normalizedRules = [];
    for (const rule of rules) {
      const startMinutes = parseTime(rule.start.trim());
      const endMinutes = parseTime(rule.end.trim());

      if (startMinutes === null || endMinutes === null) {
        Alert.alert('Horário inválido', `Use HH:MM em ${weekdayLabels[rule.dayOfWeek]}.`);
        return;
      }

      if (endMinutes <= startMinutes) {
        Alert.alert('Janela inválida', `O horário final precisa ser maior que o inicial em ${weekdayLabels[rule.dayOfWeek]}.`);
        return;
      }

      normalizedRules.push({
        dayOfWeek: rule.dayOfWeek,
        startMinutes,
        endMinutes,
        isActive: true,
        notes: rule.notes.trim() || undefined,
      });
    }

    const normalizedExceptions = [];
    for (const item of exceptions) {
      if (!item.startDate || !item.endDate) {
        Alert.alert('Período incompleto', 'Preencha a data inicial e final dos bloqueios.');
        return;
      }

      const start = new Date(`${item.startDate}T${item.startTime || '00:00'}:00`);
      const end = new Date(`${item.endDate}T${item.endTime || '23:59'}:00`);

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        Alert.alert('Período inválido', 'Revise as datas e horários dos bloqueios.');
        return;
      }

      if (end.getTime() <= start.getTime()) {
        Alert.alert('Período inválido', 'O fim do bloqueio precisa ser depois do início.');
        return;
      }

      normalizedExceptions.push({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        notes: item.notes.trim() || undefined,
      });
    }

    setIsSaving(true);
    try {
      const updated = await updateMyAvailability({
        rules: normalizedRules,
        exceptions: normalizedExceptions,
      });
      setAvailability(updated);
      setRules(toRuleForm(updated));
      setExceptions(toExceptionForm(updated));
      Alert.alert('Disponibilidade salva', 'Suas janelas de atendimento foram atualizadas.');
    } catch (error) {
      console.error('Erro ao salvar disponibilidade:', error);
      Alert.alert('Erro', 'Não foi possível salvar sua disponibilidade.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.centerText}>Carregando disponibilidade...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backLink}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Minha disponibilidade</Text>
          <Text style={styles.subtitle}>
            Informe dias, horários recorrentes e períodos em que você ficará indisponível.
          </Text>
        </View>

        {!availability?.hasMember ? (
          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>Sem cadastro de membro</Text>
            <Text style={styles.centerText}>
              Seu usuário ainda não está vinculado a um membro. Peça ao administrador para concluir esse vínculo.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Janelas semanais</Text>
              <Text style={styles.sectionSubtitle}>
                Você pode cadastrar mais de um horário no mesmo dia. Use o formato HH:MM.
              </Text>
              <View style={styles.card}>
                {groupedRules.map((day) => (
                  <View key={day.dayOfWeek} style={styles.dayBlock}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayTitle}>{day.label}</Text>
                      <TouchableOpacity onPress={() => addRule(day.dayOfWeek)}>
                        <Text style={styles.addLink}>Adicionar horário</Text>
                      </TouchableOpacity>
                    </View>

                    {day.items.length === 0 ? (
                      <Text style={styles.emptyInline}>Nenhum horário cadastrado.</Text>
                    ) : (
                      day.items.map((rule) => (
                        <View key={rule.id} style={styles.formRow}>
                          <TextInput
                            value={rule.start}
                            onChangeText={(value) => updateRule(rule.id, 'start', value)}
                            placeholder="19:00"
                            placeholderTextColor={colors.placeholder}
                            style={[styles.input, styles.timeInput]}
                          />
                          <Text style={styles.inlineDivider}>até</Text>
                          <TextInput
                            value={rule.end}
                            onChangeText={(value) => updateRule(rule.id, 'end', value)}
                            placeholder="21:00"
                            placeholderTextColor={colors.placeholder}
                            style={[styles.input, styles.timeInput]}
                          />
                          <TouchableOpacity onPress={() => removeRule(rule.id)}>
                            <Text style={styles.removeLink}>Remover</Text>
                          </TouchableOpacity>
                          <TextInput
                            value={rule.notes}
                            onChangeText={(value) => updateRule(rule.id, 'notes', value)}
                            placeholder="Observação opcional"
                            placeholderTextColor={colors.placeholder}
                            style={styles.input}
                          />
                        </View>
                      ))
                    )}
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionHeaderText}>
                  <Text style={styles.sectionTitle}>Bloqueios por período</Text>
                  <Text style={styles.sectionSubtitle}>
                    Use para férias, viagens, retiros ou afastamentos temporários.
                  </Text>
                </View>
                <TouchableOpacity onPress={addException}>
                  <Text style={styles.addLink}>Adicionar bloqueio</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.card}>
                {exceptions.length === 0 ? (
                  <Text style={styles.emptyInline}>Nenhum bloqueio cadastrado.</Text>
                ) : (
                  exceptions.map((item) => (
                    <View key={item.id} style={styles.exceptionCard}>
                      <View style={styles.exceptionGrid}>
                        <TextInput
                          value={item.startDate}
                          onChangeText={(value) => updateException(item.id, 'startDate', value)}
                          placeholder="2026-03-20"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.halfInput]}
                        />
                        <TextInput
                          value={item.startTime}
                          onChangeText={(value) => updateException(item.id, 'startTime', value)}
                          placeholder="00:00"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.halfInput]}
                        />
                        <TextInput
                          value={item.endDate}
                          onChangeText={(value) => updateException(item.id, 'endDate', value)}
                          placeholder="2026-03-22"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.halfInput]}
                        />
                        <TextInput
                          value={item.endTime}
                          onChangeText={(value) => updateException(item.id, 'endTime', value)}
                          placeholder="23:59"
                          placeholderTextColor={colors.placeholder}
                          style={[styles.input, styles.halfInput]}
                        />
                      </View>

                      <TextInput
                        value={item.notes}
                        onChangeText={(value) => updateException(item.id, 'notes', value)}
                        placeholder="Motivo opcional"
                        placeholderTextColor={colors.placeholder}
                        style={styles.input}
                      />

                      <TouchableOpacity onPress={() => removeException(item.id)}>
                        <Text style={styles.removeLink}>Remover bloqueio</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={saveAvailability}
                disabled={isSaving}
              >
                <Text style={styles.saveButtonText}>
                  {isSaving ? 'Salvando...' : 'Salvar disponibilidade'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 18,
      paddingTop: 18,
      gap: 6,
    },
    backLink: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '700',
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    section: {
      paddingHorizontal: 18,
      marginTop: 20,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'flex-start',
    },
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 13,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 10,
      gap: 18,
    },
    dayBlock: {
      gap: 10,
    },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    dayTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    formRow: {
      gap: 10,
      backgroundColor: colors.background,
      padding: 12,
      borderRadius: 14,
    },
    input: {
      backgroundColor: colors.inputBackground,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 14,
    },
    timeInput: {
      width: 110,
    },
    inlineDivider: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    addLink: {
      fontSize: 13,
      color: colors.primary,
      fontWeight: '700',
    },
    removeLink: {
      fontSize: 13,
      color: colors.error,
      fontWeight: '700',
    },
    emptyInline: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    exceptionCard: {
      gap: 10,
      backgroundColor: colors.background,
      padding: 12,
      borderRadius: 14,
    },
    exceptionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    halfInput: {
      minWidth: '47%',
      flexGrow: 1,
    },
    footer: {
      paddingHorizontal: 18,
      paddingVertical: 24,
    },
    saveButton: {
      backgroundColor: colors.primary,
      paddingVertical: 15,
      borderRadius: 14,
      alignItems: 'center',
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      color: colors.textInverse,
      fontSize: 15,
      fontWeight: '700',
    },
    centerState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 10,
      padding: 24,
    },
    centerCard: {
      margin: 18,
      padding: 20,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    centerTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    centerText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
  });
