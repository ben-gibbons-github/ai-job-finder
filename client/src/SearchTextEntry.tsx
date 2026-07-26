import React, { useState } from 'react';
import { socket } from './socket';

interface SearchTextEntryProps {
  onSearch?: (query: string) => void;
  className?: string;
  resultCount?: number;
  highlight?: boolean;
  initialQuery?: string;
}

const SearchTextEntry: React.FC<SearchTextEntryProps> = ({ onSearch, className = '', resultCount = 0, highlight = false, initialQuery = '' }) => {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsOpen, setIsSuggestionsOpen] = useState(false);
  const [isSuggestionLoading, setIsSuggestionLoading] = useState(false);
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState<number>(-1);
  const debounceTimerRef = React.useRef<number | null>(null);
  const requestIdRef = React.useRef(0);
  const skipNextSuggestionLookupRef = React.useRef(false);

  React.useEffect(() => {
    skipNextSuggestionLookupRef.current = true;
    setSearchQuery(initialQuery);
    setIsSuggestionsOpen(false);
  }, [initialQuery]);

  React.useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (skipNextSuggestionLookupRef.current) {
      skipNextSuggestionLookupRef.current = false;
      setIsSuggestionLoading(false);
      return;
    }

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSuggestions([]);
      setHighlightedSuggestionIndex(-1);
      setIsSuggestionLoading(false);
      return;
    }

    setIsSuggestionLoading(true);
    debounceTimerRef.current = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;
      socket.emit(
        'search:suggestions',
        { query: trimmedQuery, limit: 8 },
        (response: { suggestions?: string[]; error?: string }) => {
          if (requestId !== requestIdRef.current) {
            return;
          }

          if (response?.error) {
            console.error('Failed to load search suggestions:', response.error);
            setSuggestions([]);
            setHighlightedSuggestionIndex(-1);
            setIsSuggestionLoading(false);
            return;
          }

          const nextSuggestions = Array.isArray(response?.suggestions) ? response.suggestions : [];
          setSuggestions(nextSuggestions);
          setHighlightedSuggestionIndex(nextSuggestions.length > 0 ? 0 : -1);
          setIsSuggestionsOpen(true);
          setIsSuggestionLoading(false);
        },
      );
    }, 220);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      onSearch?.(searchQuery);
      setIsSuggestionsOpen(false);
    }
  };

  const selectSuggestion = (suggestion: string) => {
    skipNextSuggestionLookupRef.current = true;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    requestIdRef.current += 1;

    setSearchQuery(suggestion);
    setSuggestions([]);
    setHighlightedSuggestionIndex(-1);
    setIsSuggestionLoading(false);
    setIsSuggestionsOpen(false);
    onSearch?.(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (suggestions.length === 0) {
        return;
      }
      setIsSuggestionsOpen(true);
      setHighlightedSuggestionIndex((prev) => (prev + 1) % suggestions.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length === 0) {
        return;
      }
      setIsSuggestionsOpen(true);
      setHighlightedSuggestionIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }

    if (e.key === 'Escape') {
      setIsSuggestionsOpen(false);
      return;
    }

    if (e.key === 'Enter') {
      if (isSuggestionsOpen && highlightedSuggestionIndex >= 0 && highlightedSuggestionIndex < suggestions.length) {
        e.preventDefault();
        selectSuggestion(suggestions[highlightedSuggestionIndex]);
        return;
      }

      handleSearch();
    }
  };

  const handleInputFocus = () => {
    if (searchQuery.trim().length >= 2) {
      setIsSuggestionsOpen(true);
    }
  };

  const handleInputBlur = () => {
    window.setTimeout(() => setIsSuggestionsOpen(false), 180);
  };

  return (
    <div className={['search-text-entry', className, highlight ? 'search-text-entry--highlight' : ''].filter(Boolean).join(' ')}>
      <div className="search-input-shell">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsSuggestionsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="Search jobs..."
          className="search-input"
          autoComplete="off"
          role="combobox"
          aria-expanded={isSuggestionsOpen}
          aria-autocomplete="list"
        />

        {isSuggestionsOpen && (
          <div className="search-suggestions-panel">
            {searchQuery.trim().length < 2 && (
              <div className="search-suggestions-state-message search-suggestions-state-message-emphasis">Type at least 2 characters</div>
            )}

            {searchQuery.trim().length >= 2 && isSuggestionLoading && (
              <div className="search-suggestions-state-message search-suggestions-state-message-emphasis">Searching suggestions...</div>
            )}

            {searchQuery.trim().length >= 2 && !isSuggestionLoading && suggestions.length > 0 && (
              <ul className="search-suggestions-menu">
                {suggestions.map((suggestion, index) => (
                  <li
                    key={`${suggestion}-${index}`}
                    className={`search-suggestion-option ${highlightedSuggestionIndex === index ? 'search-suggestion-option--active' : ''}`}
                    onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    {suggestion}
                  </li>
                ))}
              </ul>
            )}

            {searchQuery.trim().length >= 2 && !isSuggestionLoading && suggestions.length === 0 && (
              <div className="search-suggestions-state-message">No suggestions</div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSearch}
        className="search-button"
        onMouseEnter={() => setIsSearchHovered(true)}
        onMouseLeave={() => setIsSearchHovered(false)}
      >
        Search
      </button>
      {isSearchHovered && resultCount > 0 && (
        <div className="search-button-results-popover" role="status" aria-live="polite">
          {resultCount} results in search
        </div>
      )}
    </div>
  );
};

export default SearchTextEntry;
