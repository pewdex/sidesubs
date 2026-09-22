import { formatMetadataValue } from './helpers';
import { Icon } from './Icon';
import type { SubtitleLanguageOption, SubtitleSearchResult, SubtitleSearchState } from './types';

type SubtitleSearchModalProps = {
  filteredSubtitleLanguages: SubtitleLanguageOption[];
  isLanguageMenuOpen: boolean;
  onClose: () => void;
  onDownload: (result: SubtitleSearchResult) => void;
  onLanguageChange: (language: string) => void;
  onLanguageFilterChange: (filter: string) => void;
  onLanguageMenuOpenChange: (isOpen: boolean) => void;
  onQueryChange: (query: string) => void;
  onSearch: (query: string) => void;
  query: string;
  searchError: string | null;
  searchLanguage: string;
  searchResults: SubtitleSearchResult[];
  searchState: SubtitleSearchState;
};

export function SubtitleSearchModal({
  filteredSubtitleLanguages,
  isLanguageMenuOpen,
  onClose,
  onDownload,
  onLanguageChange,
  onLanguageFilterChange,
  onLanguageMenuOpenChange,
  onQueryChange,
  onSearch,
  query,
  searchError,
  searchLanguage,
  searchResults,
  searchState,
}: SubtitleSearchModalProps) {
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-labelledby="subtitle-search-title"
        aria-modal="true"
        className="subtitle-search-modal"
        role="dialog"
      >
        <div className="modal-header">
          <h2 id="subtitle-search-title">Search Subtitles</h2>
          <button
            aria-label="Close subtitle search"
            className="modal-close-button"
            type="button"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <form
          className="subtitle-search-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onSearch(query);
          }}
        >
          <label className="subtitle-search-field subtitle-query-field">
            <span>Movie title</span>
            <input
              autoFocus
              className="subtitle-query-input"
              placeholder="Back to the Future"
              type="search"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </label>
          <label className="subtitle-search-field subtitle-language-field">
            <span>Language Code</span>
            <div className="subtitle-language-combobox">
              <input
                aria-autocomplete="list"
                aria-controls="subtitle-language-menu"
                aria-expanded={isLanguageMenuOpen}
                className="subtitle-language-input"
                inputMode="text"
                maxLength={8}
                placeholder="en"
                role="combobox"
                type="text"
                value={searchLanguage}
                onBlur={() => {
                  window.setTimeout(() => onLanguageMenuOpenChange(false), 120);
                }}
                onChange={(event) => {
                  const nextLanguage = event.target.value
                    .replace(/\s/g, '')
                    .toLowerCase();

                  onLanguageChange(nextLanguage);
                  onLanguageFilterChange(nextLanguage);
                  onLanguageMenuOpenChange(true);
                }}
                onClick={() => {
                  onLanguageFilterChange('');
                  onLanguageMenuOpenChange(true);
                }}
                onFocus={() => {
                  onLanguageFilterChange('');
                  onLanguageMenuOpenChange(true);
                }}
              />
              {isLanguageMenuOpen ? (
                <div
                  className="subtitle-language-menu"
                  id="subtitle-language-menu"
                  role="listbox"
                >
                  {filteredSubtitleLanguages.length === 0 ? (
                    <div className="subtitle-language-empty">
                      No matching languages
                    </div>
                  ) : (
                    filteredSubtitleLanguages.map((language) => (
                      <button
                        className="subtitle-language-option"
                        key={language.code}
                        role="option"
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          onLanguageChange(language.code);
                          onLanguageFilterChange('');
                          onLanguageMenuOpenChange(false);
                        }}
                      >
                        <span>{language.name}</span>
                        <strong>{language.code}</strong>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </label>
          <button
            aria-label={
              searchState === 'searching'
                ? 'Searching subtitles'
                : 'Search subtitles'
            }
            className="subtitle-search-submit"
            disabled={searchState !== 'idle' || !query.trim()}
            type="submit"
          >
            <Icon name="search" />
          </button>
        </form>

        {searchError ? <p className="modal-error">{searchError}</p> : null}

        <div className="subtitle-results" role="list">
          {searchResults.map((result) => {
            const downloadCount = formatMetadataValue(result.downloadCount);
            const rating = formatMetadataValue(result.rating);

            return (
              <button
                className="subtitle-result"
                disabled={searchState !== 'idle'}
                key={`${result.id}-${result.fileId}`}
                role="listitem"
                type="button"
                onClick={() => {
                  void onDownload(result);
                }}
              >
                <span className="subtitle-cover" aria-hidden="true">
                  {result.coverUrl ? (
                    <img src={result.coverUrl} alt="" loading="lazy" />
                  ) : (
                    <span>No cover</span>
                  )}
                </span>
                <span className="subtitle-result-details">
                  <strong>{result.title}</strong>
                  <span>
                    {[
                      result.language ? result.language.toUpperCase() : null,
                      result.releaseName,
                    ]
                      .filter(Boolean)
                      .join(' - ') || 'Subtitle'}
                  </span>
                  <small>
                    {[
                      downloadCount ? `${downloadCount} downloads` : null,
                      rating ? `${rating} rating` : null,
                    ]
                      .filter(Boolean)
                      .join(' - ')}
                  </small>
                </span>
              </button>
            );
          })}

          {searchState === 'downloading' ? (
            <p className="empty-results">Downloading selected subtitle...</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
