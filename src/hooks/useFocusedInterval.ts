import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

/**
 * Temporizador que só roda com a tela EM FOCO e o app em primeiro plano
 * (ex.: renovar o "Acontecendo agora" a cada 60 s). Para ao sair da tela e ao
 * ir para segundo plano; volta a contar do zero ao retornar.
 */
export function useFocusedInterval(callback: () => void, ms: number): void {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useFocusEffect(
    useCallback(() => {
      let timer: ReturnType<typeof setInterval> | null = null;
      const start = () => {
        if (!timer) timer = setInterval(() => callbackRef.current(), ms);
      };
      const stop = () => {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      };
      if (AppState.currentState === 'active') start();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') start();
        else stop();
      });
      return () => {
        stop();
        subscription.remove();
      };
    }, [ms]),
  );
}
