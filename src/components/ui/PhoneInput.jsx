import { ChevronDown, Phone } from 'lucide-react';
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  formatPhoneNational,
  getPhoneCountry,
} from '../../utils/helpers';

export default function PhoneInput({
  country = DEFAULT_PHONE_COUNTRY,
  value = '',
  onCountryChange,
  onChange,
  className = '',
  id,
  name,
}) {
  const selected = getPhoneCountry(country);

  return (
    <div
      className={`flex overflow-hidden rounded-xl border border-navy-200 bg-navy-50 transition-colors focus-within:border-transparent focus-within:ring-2 focus-within:ring-cyan-500 ${className}`}
    >
      <div className="relative shrink-0 border-r border-navy-200">
        <Phone size={18} className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-navy-400" aria-hidden="true" />
        <select
          id={id ? `${id}-country` : undefined}
          name={name ? `${name}Country` : undefined}
          value={country}
          onChange={(e) => onCountryChange?.(e.target.value)}
          className="h-full min-h-[3rem] w-[8.25rem] cursor-pointer appearance-none bg-transparent py-3 pl-10 pr-8 text-sm font-semibold text-navy-900 focus:outline-none sm:w-[8.75rem]"
          aria-label="Country code"
        >
          {PHONE_COUNTRIES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.flag} {item.dial}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-navy-400"
          aria-hidden="true"
        />
      </div>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={value}
        onChange={(e) => onChange?.(formatPhoneNational(e.target.value))}
        placeholder={selected.placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent px-3 py-3 text-base text-navy-900 placeholder:text-navy-400 focus:outline-none"
        aria-label="Phone number"
      />
    </div>
  );
}
