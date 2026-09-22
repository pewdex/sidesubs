import { useEffect, useMemo, useState } from 'react';
import fallbackSubtitleLanguagesConfig from '../../../subtitleLanguages.json';
import { formatSubtitleSearchQuery, normalizeSubtitleLanguages } from './helpers';
import type {
  PlaybackSession,
  SubtitleSearchResult,
  SubtitleSearchState,
} from './types';

const fallbackSubtitleLanguages = normalizeSubtitleLanguages(
  fallbackSubtitleLanguagesConfig,
);

export function useSubtitleSearch(
  selectedSession: PlaybackSession | null,
  onLoadSubtitle: (contents: string, name: string) => void,
) {
  const [isSubtitleSearchOpen, setIsSubtitleSearchOpen] = useState(false);
  const [subtitleSearchQuery, setSubtitleSearchQuery] = useState('');
  const [subtitleSearchLanguage, setSubtitleSearchLanguage] = useState('en');
  const [subtitleLanguageFilter, setSubtitleLanguageFilter] = useState('');
  const [subtitleLanguages, setSubtitleLanguages] = useState(
    fallbackSubtitleLanguages,
  );
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const [subtitleSearchResults, setSubtitleSearchResults] = useState<
    SubtitleSearchResult[]
  >([]);
  const [subtitleSearchError, setSubtitleSearchError] = useState<string | null>(
    null,
  );
  const [subtitleSearchState, setSubtitleSearchState] =
    useState<SubtitleSearchState>('idle');

  const filteredSubtitleLanguages = useMemo(() => {
    const query = subtitleLanguageFilter.trim().toLowerCase();

    if (!query) {
      return subtitleLanguages;
    }

    return subtitleLanguages.filter(
      (language) =>
        language.code.includes(query) ||
        language.name.toLowerCase().includes(query),
    );
  }, [subtitleLanguageFilter, subtitleLanguages]);

  useEffect(() => {
    let isMounted = true;

    async function loadRuntimeSubtitleLanguages(): Promise<void> {
      try {
        const response = await fetch('/api/subtitle-languages');

        if (!response.ok) {
          return;
        }

        const languages = normalizeSubtitleLanguages(await response.json());

        if (isMounted && languages.length > 0) {
          setSubtitleLanguages(languages);
        }
      } catch {
        // Keep the bundled fallback list if the runtime config is unavailable.
      }
    }

    void loadRuntimeSubtitleLanguages();

    return () => {
      isMounted = false;
    };
  }, []);

  async function searchSubtitles(query: string): Promise<void> {
    const trimmedQuery = query.trim();
    const trimmedLanguage = subtitleSearchLanguage.trim().toLowerCase();

    if (!trimmedQuery) {
      setSubtitleSearchError(
        selectedSession
          ? 'Enter a title to search.'
          : 'Select a Jellyfin session or type a movie title.',
      );
      setSubtitleSearchResults([]);
      return;
    }

    setSubtitleSearchState('searching');
    setSubtitleSearchError(null);

    try {
      const params = new URLSearchParams({ query: trimmedQuery });

      if (trimmedLanguage) {
        params.set('language', trimmedLanguage);
      }

      const response = await fetch(`/api/subtitles/search?${params.toString()}`);
      const payload = (await response.json()) as {
        message?: string;
        results?: SubtitleSearchResult[];
      };

      if (!response.ok) {
        throw new Error(payload.message || 'Subtitle search failed.');
      }

      const results = payload.results || [];
      setSubtitleSearchResults(results);

      if (results.length === 0) {
        setSubtitleSearchError('No subtitles found for that search.');
      }
    } catch (caughtError) {
      setSubtitleSearchResults([]);
      setSubtitleSearchError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Subtitle search failed.',
      );
    } finally {
      setSubtitleSearchState('idle');
    }
  }

  function openSubtitleSearch(): void {
    const initialQuery = formatSubtitleSearchQuery(selectedSession);

    setSubtitleSearchQuery(initialQuery);
    setSubtitleSearchResults([]);
    setSubtitleSearchError(null);
    setIsSubtitleSearchOpen(true);

    if (initialQuery) {
      void searchSubtitles(initialQuery);
    } else {
      setSubtitleSearchError(
        'Select a Jellyfin session or type a movie title.',
      );
    }
  }

  function closeSubtitleSearch(): void {
    if (subtitleSearchState === 'downloading') {
      return;
    }

    setIsLanguageMenuOpen(false);
    setIsSubtitleSearchOpen(false);
  }

  async function downloadSubtitle(result: SubtitleSearchResult): Promise<void> {
    setSubtitleSearchState('downloading');
    setSubtitleSearchError(null);

    try {
      const response = await fetch('/api/subtitles/download', {
        body: JSON.stringify({ fileId: result.fileId }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      const payload = (await response.json()) as {
        content?: string;
        fileName?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || 'Subtitle download failed.');
      }

      if (!payload.content) {
        throw new Error('The downloaded subtitle file was empty.');
      }

      onLoadSubtitle(payload.content, payload.fileName || result.title);
      setIsSubtitleSearchOpen(false);
    } catch (caughtError) {
      setSubtitleSearchError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Subtitle download failed.',
      );
    } finally {
      setSubtitleSearchState('idle');
    }
  }

  return {
    closeSubtitleSearch,
    downloadSubtitle,
    filteredSubtitleLanguages,
    isLanguageMenuOpen,
    isSubtitleSearchOpen,
    openSubtitleSearch,
    searchSubtitles,
    setIsLanguageMenuOpen,
    setSubtitleLanguageFilter,
    setSubtitleSearchLanguage,
    setSubtitleSearchQuery,
    subtitleSearchError,
    subtitleSearchLanguage,
    subtitleSearchQuery,
    subtitleSearchResults,
    subtitleSearchState,
  };
}
