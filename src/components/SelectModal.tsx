import React, { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Item {
  label: string;
  value: string;
}

interface SelectModalProps {
  label: string;
  selectedValue: string;
  onValueChange: (itemValue: string) => void;
  items: Item[];
  placeholder: string;
  disabled?: boolean;
}

const SelectModal: React.FC<SelectModalProps> = ({
  label,
  selectedValue,
  onValueChange,
  items,
  placeholder,
  disabled = false,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  const selectedItem = items.find(item => item.value === selectedValue);
  const displayValue = selectedItem ? selectedItem.label : placeholder;

  const handleSelect = (value: string) => {
    onValueChange(value);
    setModalVisible(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.input, disabled && styles.disabledInput]}
        onPress={() => setModalVisible(true)}
        disabled={disabled}
      >
        <Text style={[styles.text, !selectedItem && styles.placeholderText]}>
          {displayValue}
        </Text>
        <Ionicons name="chevron-down" size={18} color="#666" />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={30} color="#000" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={items}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.itemContainer}
                onPress={() => handleSelect(item.value)}
              >
                <Text style={styles.itemText}>{item.label}</Text>
                {item.value === selectedValue && (
                  <Ionicons name="checkmark" size={20} color="green" />
                )}
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  input: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  disabledInput: {
    backgroundColor: '#eee',
  },
  text: {
    fontSize: 16,
    color: '#000',
  },
  placeholderText: {
    color: '#999',
  },
  modalContainer: {
    flex: 1,
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  itemText: {
    fontSize: 16,
  },
});

export default SelectModal;
