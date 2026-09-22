import { useEffect, useRef, useState } from 'react';
import { chromeIdleDelayMs } from './helpers';

export function useChromeIdle(
  isSettingsOpen: boolean,
  isSubtitleSearchOpen: boolean,
) {
  const [isChromeVisible, setIsChromeVisible] = useState(true);
  const chromeIdleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearChromeIdleTimer(): void {
      if (chromeIdleTimerRef.current !== null) {
        window.clearTimeout(chromeIdleTimerRef.current);
        chromeIdleTimerRef.current = null;
      }
    }

    function hasFocusedChromeControl(): boolean {
      const activeElement = document.activeElement;

      return Boolean(
        activeElement &&
          activeElement.closest?.(
            '.top-bar, .bottom-bar, .settings-panel, .subtitle-search-modal',
          ),
      );
    }

    function scheduleChromeHide(): void {
      clearChromeIdleTimer();

      if (isSettingsOpen || isSubtitleSearchOpen) {
        setIsChromeVisible(true);
        return;
      }

      chromeIdleTimerRef.current = window.setTimeout(() => {
        if (!hasFocusedChromeControl()) {
          setIsChromeVisible(false);
        }
      }, chromeIdleDelayMs);
    }

    function revealChrome(): void {
      setIsChromeVisible(true);
      scheduleChromeHide();
    }

    const activityEvents = [
      'mousemove',
      'mousedown',
      'pointermove',
      'pointerdown',
      'touchstart',
      'touchmove',
      'wheel',
      'keydown',
      'focusin',
    ] as const;

    for (const eventName of activityEvents) {
      window.addEventListener(eventName, revealChrome, { passive: true });
    }

    scheduleChromeHide();

    return () => {
      clearChromeIdleTimer();

      for (const eventName of activityEvents) {
        window.removeEventListener(eventName, revealChrome);
      }
    };
  }, [isSettingsOpen, isSubtitleSearchOpen]);

  return isChromeVisible;
}
