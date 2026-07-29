import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import SelectModal from './SelectModal';

interface Item {
  label: string;
  value: string;
}

interface PickerInputProps {
  label: string;
  selectedValue: string;
  onValueChange: (itemValue: string) => void;
  items: Item[];
  placeholder: string;
  disabled?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

const PickerInput: React.FC<PickerInputProps> = (props) => {
  // O componente SelectModal já implementa toda a lógica de visualização e seleção.
  // Apenas repassamos as props.
  return <SelectModal {...props} />;
};

export default PickerInput;
