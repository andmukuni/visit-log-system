import GateEntryCheckInForm from '../../components/gate/GateEntryCheckInForm';

export default function GateEntryPage() {
  return (
    <GateEntryCheckInForm
      layout="kiosk"
      entryContext="gate"
      showCheckout
      initialMode="vehicle"
    />
  );
}
