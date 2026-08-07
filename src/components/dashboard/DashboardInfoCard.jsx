export default function DashboardInfoCard({ title, children, variant = 'dark' }) {
  const styles = {
    dark: 'bg-gray-900 text-white',
    amber: 'bg-amber-500 text-white',
    blue: 'bg-blue-500 text-white',
  };
  return (
    <div className={`rounded-3xl p-4 shadow-sm ${styles[variant] || styles.dark}`}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="text-xs mt-1 leading-relaxed opacity-90">{children}</div>
    </div>
  );
}
