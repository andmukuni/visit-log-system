import { useId, useState } from 'react';

export default function Tooltip({ content, children, side = 'right' }) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  if (!content) return children;

  const sideClasses = {
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  };

  return (
    <span
      className="inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span className="relative inline-flex" aria-describedby={visible ? id : undefined}>
        {children}
        {visible && (
          <span
            id={id}
            role="tooltip"
            className={`pointer-events-none absolute z-[100] whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg ${sideClasses[side] || sideClasses.right}`}
          >
            {content}
          </span>
        )}
      </span>
    </span>
  );
}
