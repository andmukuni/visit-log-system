/**
 * Hover tooltips are disabled app-wide. Keep the component as a passthrough
 * so call sites remain valid and aria-labels still provide accessibility.
 */
export default function Tooltip({ children }) {
  return children;
}
