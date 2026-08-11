import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

function normalizeOptions(options = []) {
  return options.map((opt) => {
    if (typeof opt === 'string') return { value: opt, label: opt };
    return {
      value: opt?.value ?? '',
      label: String(opt?.label ?? opt?.value ?? ''),
    };
  });
}

export default function SearchableSelect({
  id,
  name,
  value = '',
  onChange,
  options = [],
  placeholder = 'Search…',
  disabled = false,
  required = false,
  className = '',
  emptyMessage = 'No matching options',
}) {
  const listboxId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const normalized = useMemo(() => normalizeOptions(options), [options]);
  const selected = useMemo(
    () => normalized.find((opt) => String(opt.value) === String(value ?? '')) || null,
    [normalized, value],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return normalized;
    return normalized.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [normalized, query]);

  useEffect(() => {
    if (!open) {
      setQuery(selected?.label || '');
      setActiveIndex(-1);
    }
  }, [open, selected]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const emitChange = (nextValue) => {
    onChange?.({
      target: {
        name,
        value: nextValue,
      },
    });
  };

  const selectOption = (opt) => {
    emitChange(opt.value);
    setQuery(opt.label);
    setOpen(false);
    setActiveIndex(-1);
  };

  const clearValue = (event) => {
    event.preventDefault();
    event.stopPropagation();
    emitChange('');
    setQuery('');
    setOpen(true);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length ? 0 : -1);
        return;
      }
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        return current < 0 ? 0 : (current + 1) % filtered.length;
      });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length ? filtered.length - 1 : -1);
        return;
      }
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        return current <= 0 ? filtered.length - 1 : current - 1;
      });
    } else if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        event.preventDefault();
        selectOption(filtered[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
    }
  };

  const baseClass = `w-full rounded-xl border px-4 py-2.5 pr-16 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent ${
    disabled
      ? 'cursor-not-allowed opacity-50 border-navy-200 bg-navy-50 text-navy-900'
      : 'border-navy-200 bg-navy-50 text-navy-900 placeholder-navy-400'
  } ${className}`;

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-400"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={id || name}
          name={name}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-required={required || undefined}
          autoComplete="off"
          disabled={disabled}
          required={required && !value}
          placeholder={placeholder}
          value={open ? query : (selected?.label || query)}
          onFocus={() => {
            setOpen(true);
            setQuery('');
            setActiveIndex(filtered.length ? 0 : -1);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={`${baseClass} pl-10`}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {value ? (
            <button
              type="button"
              disabled={disabled}
              onClick={clearValue}
              className="rounded-md p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700 disabled:opacity-40"
              aria-label="Clear selection"
            >
              <X size={14} />
            </button>
          ) : null}
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (disabled) return;
              setOpen((prev) => !prev);
              inputRef.current?.focus();
            }}
            className="rounded-md p-1 text-navy-400 hover:bg-navy-100 hover:text-navy-700 disabled:opacity-40"
            aria-label={open ? 'Close options' : 'Open options'}
            tabIndex={-1}
          >
            <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        </div>
      </div>

      {open && !disabled ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-40 max-h-56 overflow-y-auto rounded-xl border border-navy-100 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-navy-500">{emptyMessage}</p>
          ) : (
            filtered.map((opt, index) => {
              const active = index === activeIndex;
              const isSelected = String(opt.value) === String(value ?? '');
              return (
                <button
                  key={`${opt.value}-${opt.label}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(opt)}
                  className={`flex w-full px-3 py-2 text-left text-sm transition-colors ${
                    active || isSelected
                      ? 'bg-cyan-50 text-cyan-900'
                      : 'text-navy-800 hover:bg-navy-50'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
