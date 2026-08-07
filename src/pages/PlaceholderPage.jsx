import { PageHeader, Card } from '../components/ui';

export default function PlaceholderPage({ title, subtitle, portalLabel }) {
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle || `${portalLabel} module — coming in next iteration`}
        breadcrumbs={[{ label: portalLabel }, { label: title }]}
      />
      <Card title="Under development">
        <p className="text-sm text-navy-600">
          This screen is registered in the portal navigation and RBAC system. Core station, visitor
          registration, check-in/out and logging features are available now; this module will be
          expanded in subsequent phases.
        </p>
      </Card>
    </div>
  );
}
