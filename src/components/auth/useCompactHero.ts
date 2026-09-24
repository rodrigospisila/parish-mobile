import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';

/** true enquanto o teclado está aberto */
export function useKeyboardOpen(): boolean {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardOpen;
}

/**
 * Cabeçalho compacto com teclado aberto ou fonte grande do sistema, para os
 * campos e o botão não ficarem escondidos em telas pequenas.
 */
export function useCompactHero(): boolean {
  const keyboardOpen = useKeyboardOpen();
  const { fontScale } = useWindowDimensions();
  return keyboardOpen || fontScale > 1.3;
}
