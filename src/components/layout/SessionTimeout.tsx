'use client';

import { useEffect, useRef } from 'react';
import { logoutIdle } from '@/modules/auth/actions';

export default function SessionTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 10 minutos de inactividad
  const TIMEOUT_MS = 10 * 60 * 1000;

  useEffect(() => {
    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        // Ejecutar Server Action para limpiar las cookies y cerrar sesión en Supabase
        logoutIdle();
      }, TIMEOUT_MS);
    };

    // Escuchar eventos globales que indican actividad del usuario
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Iniciar el temporizador por primera vez
    resetTimer();

    // Limpieza cuando el componente se desmonte
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, []);

  return null; // El componente es completamente invisible
}
