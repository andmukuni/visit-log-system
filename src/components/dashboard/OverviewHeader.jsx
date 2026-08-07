import { useAuth } from '../../context/AuthContext';
import { useRegisterPageHeader } from '../../context/PageHeaderContext';

export default function OverviewHeader({
  title = 'Overview',
  subtitle,
  actions,
}) {
  const { user } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const greeting = subtitle || `Hi ${firstName}, welcome back.`;

  useRegisterPageHeader({ title, actions });

  return (
    <p className="mb-6 text-sm text-gray-500">{greeting}</p>
  );
}
