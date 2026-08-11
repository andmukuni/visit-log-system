import { Card } from '../ui';

export default function VisitSignatureCard({ signature, visitorName }) {
  if (!signature) return null;

  return (
    <Card title="Check-in signature" subtitle="Captured at gate or reception desk">
      <div className="rounded-xl border border-navy-100 bg-navy-50/50 p-3">
        <img
          src={signature}
          alt={visitorName ? `Signature for ${visitorName}` : 'Check-in signature'}
          className="mx-auto max-h-28 w-full max-w-md object-contain"
        />
      </div>
    </Card>
  );
}
