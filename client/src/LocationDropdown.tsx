import React, { useState, useEffect, useRef } from 'react';
import { socket } from './socket';

interface LocationOption {
  value: string;
  label: string;
  country?: string;
  state?: string;
  displayLabel: string;
  lat: number;
  lng: number;
}

interface LocationDropdownProps {
  onSelectLocation: (location: LocationOption) => void;
  placeholder?: string;
  className?: string;
  initialQuery?: string;
}

const LocationDropdown: React.FC<LocationDropdownProps> = ({
  onSelectLocation,
  placeholder = "Enter location...",
  className = "",
  initialQuery = "",
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [options, setOptions] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const skipNextSearchRef = useRef(false);

  useEffect(() => {
    skipNextSearchRef.current = true;
    setQuery(initialQuery);
    setIsOpen(false);
  }, [initialQuery]);

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      setIsLoading(false);
      return;
    }

    if (query.trim().length < 2) {
      setOptions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    debounceTimerRef.current = window.setTimeout(() => {
      const requestId = ++requestIdRef.current;

      socket.emit(
        'locations:search',
        { query },
        (response: { options?: LocationOption[]; error?: string }) => {
          if (requestId !== requestIdRef.current) {
            return;
          }

          if (response?.error) {
            console.error('Error fetching locations:', response.error);
            setOptions([]);
            setIsOpen(true);
            setIsLoading(false);
            return;
          }

          const nextOptions = response?.options || [];
          setOptions(nextOptions);
          setIsOpen(true);
          setIsLoading(false);
        },
      );
    }, 300);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [query]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  const handleSelectOption = (option: LocationOption) => {
    skipNextSearchRef.current = true;

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Invalidate any in-flight response so stale callbacks are ignored.
    requestIdRef.current += 1;

    setQuery(option.displayLabel);
    setIsOpen(false);
    setIsLoading(false);
    setOptions([]);
    onSelectLocation(option);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleInputBlur = () => {
    // Delay closing to allow click on option
    setTimeout(() => setIsOpen(false), 200);
  };

  return (
    <div className={`location-dropdown ${className}`}>
      <div className="location-input-wrapper">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={placeholder}
          className="location-input"
          autoComplete="off"
        />
        {isLoading && <span className="loading-spinner">⟳</span>}
      </div>

      {isOpen && (
        <div className="location-dropdown-panel">
          {query.trim().length < 2 && !isLoading && (
            <div className="location-state-message location-state-message-emphasis">Enter location</div>
          )}

          {query.trim().length >= 2 && isLoading && (
            <div className="location-state-message location-state-message-emphasis">Searching...</div>
          )}

          {query.trim().length >= 2 && !isLoading && options.length > 0 && (
            <ul className="location-dropdown-menu">
              {options.map((option) => (
                <li
                  key={option.value}
                  onClick={() => handleSelectOption(option)}
                  className="location-option"
                >
                  <div className="option-label">{option.displayLabel}</div>
                  {option.country && (
                    <div className="option-meta">
                      {option.state ? `${option.state}, ` : ''}{option.country}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {query.trim().length >= 2 && !isLoading && options.length === 0 && (
            <div className="location-state-message">No results</div>
          )}
        </div>
      )}

      <style>{`
        .location-dropdown {
          position: relative;
          width: 100%;
        }

        .location-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }

        .location-input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
        }

        .location-input:focus {
          border-color: #0066cc;
        }

        .loading-spinner {
          position: absolute;
          right: 12px;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .location-dropdown-panel {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin: 4px 0 0 0;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          z-index: 1000;
          overflow: hidden;
        }

        .location-dropdown-menu {
          margin: 0;
          padding: 0;
          list-style: none;
          max-height: 300px;
          overflow-y: auto;
        }

        .location-option {
          padding: 10px 12px;
          cursor: pointer;
          transition: background-color 0.15s;
        }

        .location-option:hover {
          background-color: #f5f5f5;
        }

        .option-label {
          font-weight: 500;
          color: #333;
        }

        .option-meta {
          font-size: 12px;
          color: #666;
          margin-top: 2px;
        }

        .location-state-message {
          padding: 12px;
          text-align: center;
          color: #999;
          font-size: 14px;
        }

        .location-state-message-emphasis {
          color: #444;
          font-weight: 500;
        }
      `}</style>
    </div>
  );
};

export default LocationDropdown;
