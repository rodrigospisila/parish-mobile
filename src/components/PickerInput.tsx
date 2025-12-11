import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

interface ChurchPickerProps {
  label: string;
  selectedValue: number | string | undefined;
  onValueChange: (itemValue: any, itemIndex: number) => void;
  items: { label: string; value: number | string }[];
  placeholder: string;
  disabled?: boolean;
}

const ChurchPicker: React.FC<ChurchPickerProps> = ({
  label,
  selectedValue,
  onValueChange,
  items,
  placeholder,
  disabled = false,
}) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.pickerContainer, disabled && styles.disabled]}>
        <Picker
          selectedValue={selectedValue}
          onValueChange={onValueChange}
          enabled={!disabled}
          style={styles.picker}
        >
          <Picker.Item label={placeholder} value="" />
          {items.map((item) => (
            <Picker.Item key={item.value} label={item.label} value={item.value} />
          ))}
        </Picker>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 15,
    width: '100%',
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
    fontWeight: 'bold',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  disabled: {
    backgroundColor: '#f0f0f0',
  },
});

export default ChurchPicker;
