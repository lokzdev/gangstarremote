import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import type { Cliente } from '@/types/dashboard';

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  cliente: Cliente | null;
}

const INITIAL: ContextMenuState = {
  visible: false,
  x: 0,
  y: 0,
  cliente: null,
};

export function useContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState>(INITIAL);

  const openMenu = useCallback((event: MouseEvent, cliente: Cliente) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      cliente,
    });
  }, []);

  const closeMenu = useCallback(() => {
    setMenu(INITIAL);
  }, []);

  useEffect(() => {
    if (!menu.visible) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    const onScroll = () => closeMenu();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menu.visible, closeMenu]);

  return { menu, openMenu, closeMenu };
}
