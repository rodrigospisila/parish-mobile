import React from 'react';
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
}

const PickerInput: React.FC<PickerInputProps> = (props) => {
  // O componente SelectModal já implementa toda a lógica de visualização e seleção.
  // Apenas repassamos as props.
  return <SelectModal {...props} />;
};

export default PickerInput;
