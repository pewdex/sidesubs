import { useEffect, useMemo, useRef, useState } from 'react';
import { createSyncClock, type SyncStatus } from './syncClock';
import { selectSessionId } from './helpers';
import type {
  ConnectionState,
  PlaybackSession,
  PlaybackSnapshot,
} from './types';

export function usePlaybackSession() {
  const [sessions, setSessions] = useState<PlaybackSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [connectionState, setConnectionState] =
    useState<ConnectionState>('connecting');
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('disconnected');
  const syncClockRef = useRef(createSyncClock());
  const hadConnectionErrorRef = useRef(false);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === selectedSessionId) ?? null,
    [sessions, selectedSessionId],
  );

  useEffect(() => {
    syncClockRef.current.applyAnchor(selectedSession);
  }, [selectedSession]);

  useEffect(() => {
    let animationFrame = window.requestAnimationFrame(function tick() {
      const nowMs = performance.now();

      setCurrentTimeMs(syncClockRef.current.getPosition(nowMs));
      setSyncStatus(syncClockRef.current.getStatus(nowMs));
      animationFrame = window.requestAnimationFrame(tick);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/playback-events');

    eventSource.addEventListener('open', () => {
      if (hadConnectionErrorRef.current) {
        syncClockRef.current.markResynced();
        hadConnectionErrorRef.current = false;
      }

      setConnectionState('connected');
    });

    eventSource.addEventListener('error', () => {
      hadConnectionErrorRef.current = true;
      syncClockRef.current.markDisconnected();
      setConnectionState('error');
    });

    eventSource.addEventListener('playback-snapshot', (event) => {
      const snapshot = JSON.parse(
        (event as MessageEvent).data,
      ) as PlaybackSnapshot;

      setConnectionState('connected');
      setSessions(snapshot.sessions);
      setSelectedSessionId((currentSessionId) =>
        selectSessionId(snapshot.sessions, currentSessionId),
      );
    });

    return () => eventSource.close();
  }, []);

  async function refreshSessions(): Promise<void> {
    setConnectionState('connecting');

    try {
      const response = await fetch('/api/playback-sessions');
      const snapshot = (await response.json()) as PlaybackSnapshot;

      if (!response.ok) {
        throw new Error('Could not refresh Jellyfin sessions.');
      }

      setConnectionState('connected');
      setSessions(snapshot.sessions);
      setSelectedSessionId((currentSessionId) =>
        selectSessionId(snapshot.sessions, currentSessionId),
      );
    } catch {
      setConnectionState('error');
    }
  }

  return {
    connectionState,
    currentTimeMs,
    refreshSessions,
    selectedSession,
    selectedSessionId,
    sessions,
    setSelectedSessionId,
    syncStatus,
  };
}
