import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../context/ThemeContext';

interface Item {
  label: string;
  value: string;
}

interface SelectModalProps {
  label: string;
  selectedValue?: string;
  onValueChange: (itemValue: string) => void;
  items: Item[];
  placeholder: string;
  disabled?: boolean;
  /** Ícone (Ionicons) exibido à esquerda do campo. */
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

const SelectModal: React.FC<SelectModalProps> = ({
  label,
  selectedValue,
  onValueChange,
  items,
  placeholder,
  disabled = false,
  icon,
}) => {
  const colors = useColors();
  const [modalVisible, setModalVisible] = useState(false);
  const [query, setQuery] = useState('');

  const selectedItem = items.find((item) => item.value === selectedValue);
  const displayValue = selectedItem ? selectedItem.label : placeholder;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, query]);

  const showSearch = items.length > 6;

  const open = () => {
    setQuery('');
    setModalVisible(true);
  };

  const handleSelect = (value: string) => {
    onValueChange(value);
    setModalVisible(false);
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, !!selectedItem && styles.inputActive, disabled && styles.disabledInput]}
        onPress={open}
        disabled={disabled}
        activeOpacity={0.7}
      >
        {icon && (
          <Ionicons
            name={icon}
            size={18}
            color={selectedItem ? colors.primary : colors.textTertiary}
            style={styles.leftIcon}
          />
        )}
        <Text style={[styles.text, !selectedItem && styles.placeholderText]} numberOfLines={1}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{label}</Text>
              <Text style={styles.modalSubtitle}>
                {items.length} {items.length === 1 ? 'opção' : 'opções'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)} hitSlop={8}>
              <Ionicons name="close" size={26} color={colors.text} />
            </TouchableOpacity>
          </View>

          {showSearch && (
            <View style={styles.searchBox}>
              <Ionicons name="search" size={16} color={colors.textTertiary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar…"
                placeholderTextColor={colors.placeholder}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.empty}>Nenhum resultado para “{query}”.</Text>}
            renderItem={({ item }) => {
              const isSel = item.value === selectedValue;
              return (
                <TouchableOpacity
                  style={[styles.itemContainer, isSel && styles.itemSelected]}
                  onPress={() => handleSelect(item.value)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.itemDot, isSel && styles.itemDotSel]} />
                  <Text style={[styles.itemText, isSel && styles.itemTextSel]} numberOfLines={2}>
                    {item.label}
                  </Text>
                  {isSel && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const createStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    container: {
      marginBottom: 16,
    },
    label: {
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 7,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    input: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 52,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.inputBackground,
    },
    inputActive: {
      borderColor: colors.primary,
      backgroundColor: colors.highlightLight,
    },
    leftIcon: { marginRight: 0 },
    disabledInput: {
      backgroundColor: colors.disabled,
      opacity: 0.55,
    },
    text: {
      flex: 1,
      fontSize: 15.5,
      color: colors.text,
      fontWeight: '500',
    },
    placeholderText: {
      color: colors.placeholder,
      fontWeight: '400',
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    modalTitle: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text,
    },
    modalSubtitle: {
      fontSize: 12.5,
      color: colors.textTertiary,
      marginTop: 2,
    },
    closeBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 4,
      paddingHorizontal: 12,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    empty: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 14,
      paddingVertical: 40,
    },
    itemContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderLight,
      backgroundColor: colors.surface,
    },
    itemSelected: {
      backgroundColor: colors.highlightLight,
    },
    itemDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    itemDotSel: {
      backgroundColor: colors.primary,
    },
    itemText: {
      flex: 1,
      fontSize: 15.5,
      color: colors.text,
    },
    itemTextSel: {
      fontWeight: '700',
      color: colors.primary,
    },
  });

export default SelectModal;
