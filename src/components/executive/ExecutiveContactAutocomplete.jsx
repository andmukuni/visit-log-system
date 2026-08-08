import { useEffect, useId, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { executiveApi } from '../../utils/visitorApi';

function contactSubtitle(contact) {
  return [contact.company, contact.phone, contact.email].filter(Boolean).join(' · ');
}

export default function ExecutiveContactAutocomplete({
  value,
  onChange,
  onSelectContact,
  placeholder = 'Visitor name',
  required = false,
  className = '',
  inputClassName = '',
}) {
  const listboxId = useId();
  const rootRef = useRef(null);
  const debounceRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const query = value?.trim() || '';
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      return undefined;
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows = await executiveApi.searchContacts({ q: query, limit: 8 });
        setSuggestions(rows);
        setOpen(rows.length > 0);
        setActiveIndex(rows.length ? 0 : -1);
      } catch {
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const selectContact = (contact) => {
    onChange?.(contact.full_name || '');
    onSelectContact?.({
      visitorName: contact.full_name || '',
      company: contact.company || '',
      phone: contact.phone || '',
      email: contact.email || '',
    });
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event) => {
    if (!open || !suggestions.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectContact(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        className={inputClassName || 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm'}
      />

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            My contacts
          </p>
          {loading ? (
            <p className="px-3 py-2 text-sm text-gray-500">Searching…</p>
          ) : (
            suggestions.map((contact, index) => {
              const subtitle = contactSubtitle(contact);
              const active = index === activeIndex;
              return (
                <button
                  key={contact.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectContact(contact)}
                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                    active ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    active ? 'bg-[#1a73e8]/10 text-[#1a73e8]' : 'bg-gray-100 text-gray-500'
                  }`}>
                    <UserRound size={14} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{contact.full_name}</span>
                    {subtitle && (
                      <span className={`block truncate text-xs ${active ? 'text-[#1a73e8]/80' : 'text-gray-500'}`}>
                        {subtitle}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
