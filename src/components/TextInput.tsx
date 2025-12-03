import React from 'react';
import { View, Text, TextInput as RNTextInput, StyleSheet, TextInputProps } from 'react-native';

interface CustomTextInputProps extends TextInputProps {
  label: string;
  error?: string;
}

const TextInput: React.FC<CustomTextInputProps> = ({ label, error, style, ...rest }) => {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <RNTextInput
        style={[styles.input, error && styles.inputError, style]}
        placeholderTextColor="#999"
        {...rest}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
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
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 5,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  inputError: {
    borderColor: 'red',
  },
  errorText: {
    color: 'red',
    fontSize: 12,
    marginTop: 5,
  },
});

export default TextInput;
