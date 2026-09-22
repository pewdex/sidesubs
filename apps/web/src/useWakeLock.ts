import { useEffect } from 'react';
import type { PlaybackSession, ScreenWakeLockNavigator, ScreenWakeLockSentinel } from './types';

export function useWakeLock(selectedSession: PlaybackSession | null) {
  useEffect(() => {
    const wakeLockApi = (navigator as ScreenWakeLockNavigator).wakeLock;

    if (!wakeLockApi || !selectedSession || selectedSession.isPaused) {
      return;
    }

    let wakeLock: ScreenWakeLockSentinel | null = null;
    let isCancelled = false;

    async function requestWakeLock(): Promise<void> {
      if (document.visibilityState !== 'visible' || wakeLock) {
        return;
      }

      try {
        const nextWakeLock = await wakeLockApi.request('screen');

        if (isCancelled) {
          if (!nextWakeLock.released) {
            await nextWakeLock.release();
          }
          return;
        }

        wakeLock = nextWakeLock;
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        wakeLock = null;
      }
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      }
    }

    void requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isCancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (wakeLock && !wakeLock.released) {
        void wakeLock.release().catch(() => undefined);
      }
    };
  }, [selectedSession?.id, selectedSession?.isPaused]);
}
