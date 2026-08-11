import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Car,
  Bus,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Footprints,
  Hash,
  IdCard,
  LogIn,
  LogOut,
  PenLine,
  ShieldCheck,
  Truck,
  User,
  Users,
  Bike,
} from 'lucide-react';
import { LoadingButton, PhoneInput, SegmentedControl, Spinner } from '../../components/ui';
import CameraCapture from '../../components/ui/CameraCapture';
import SignaturePad from '../../components/ui/SignaturePad';
import { useToast } from '../../context/ToastContext';
import {
  DEFAULT_PHONE_COUNTRY,
  buildFullPhone,
  formatNrcInput,
  formatPhoneDisplay,
  isCompleteNrc,
  NRC_INPUT_MAX_LENGTH,
  NRC_PLACEHOLDER,
} from '../../utils/helpers';
import { visitorApi } from '../../utils/visitorApi';
import GateCheckOutPanel from '../../pages/station/GateCheckOutPanel';
import { LOGO_PATH } from '../../../shared/branding.js';

const DEFAULT_GATE_API = {
  getReferenceData: () => visitorApi.getReferenceData(),
  nrcLookup: (nrc) => visitorApi.gateEntryNrcLookup(nrc),
  searchVehicleByPlate: (plate) => visitorApi.searchVehicleByPlate(plate),
  submitWalkIn: (body) => visitorApi.gateEntryWalkIn(body),
  submitVehicle: (body) => visitorApi.gateEntryVehicle(body),
};

const COPY = {
  gate: {
    signatureHint: 'This signature confirms check-in at the gate.',
    finishLabel: 'Log & allow entry',
    finishLoadingLabel: 'Logging entry…',
    successWalkIn: (visit) => `Entry logged. Pass code: ${visit?.pass_code || '—'}`,
    successVehicle: (result) => `Vehicle ${result?.vehicle?.plate_number || ''} allowed entry.`,
  },
  reception: {
    signatureHint: 'This signature confirms check-in at the reception desk.',
    finishLabel: 'Check in visitor',
    finishLoadingLabel: 'Checking in…',
    successWalkIn: (visit) => `Visitor checked in. Pass code: ${visit?.pass_code || '—'}`,
    successVehicle: () => 'Vehicle and driver checked in at reception.',
  },
};

const VEHICLE_TYPES = [
  { value: 'car', label: 'Car', icon: Car },
  { value: 'truck', label: 'Truck', icon: Truck },
  { value: 'bus', label: 'Bus', icon: Bus },
  { value: 'motorbike', label: 'Motorbike', icon: Bike },
];

const ID_TYPES = [
  { value: 'nrc', label: 'NRC', icon: IdCard },
  { value: 'passport', label: 'Passport', icon: CreditCard },
];

const VEHICLE_STEPS = [
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'driver', label: 'Driver' },
  { key: 'visit', label: 'Visit & confirm' },
  { key: 'signature', label: 'Check-in signature' },
];

const WALKIN_STEPS = [
  { key: 'visitor', label: 'Visitor & NRC' },
  { key: 'identity', label: 'Company' },
  { key: 'visit', label: 'Visit & confirm' },
  { key: 'signature', label: 'Check-in signature' },
];

const emptyWalkIn = () => ({
  fullName: '',
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  phone: '',
  idType: 'nrc',
  idNumber: '',
  tpin: '',
  company: '',
  hostId: '',
  purpose: '',
});

const emptyNrcLookup = () => ({
  status: 'idle',
  taxpayerName: '',
  tpin: '',
  message: '',
});

const emptyVehicle = () => ({
  plateNumber: '',
  vehicleType: 'car',
  driverName: '',
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  phone: '',
  company: '',
  hostId: '',
  purpose: '',
  occupantCount: '1',
});

const INPUT_BASE = 'w-full rounded-xl border border-navy-200 bg-navy-50 text-navy-900 placeholder:text-navy-400 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500';
const INPUT_LG = `${INPUT_BASE} py-4 pl-12 pr-4 text-xl font-semibold tracking-wide`;
const INPUT_MD = `${INPUT_BASE} py-3 pl-10 pr-3 text-base`;

const PURPOSE_OPTIONS = [
  { value: 'Business', label: 'Business' },
  { value: 'Work', label: 'Work' },
  { value: 'Maintenance', label: 'Maintenance' },
  { value: 'General Visit', label: 'General Visit' },
];

function FieldLabel({ children, hint, optional = false }) {
  return (
    <div className="mb-2">
      <label className="block text-sm font-semibold text-navy-800">
        {children}
        {optional ? <span className="ml-1.5 text-xs font-medium text-navy-400">(optional)</span> : null}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-navy-400">{hint}</p> : null}
    </div>
  );
}

function PurposeSelect({ value, onChange }) {
  return (
    <div className="relative">
      <ClipboardList size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden="true" />
      <select
        value={value}
        onChange={onChange}
        className={`${INPUT_MD} appearance-none pr-10`}
      >
        <option value="">Select purpose…</option>
        {PURPOSE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FormSection({ title, subtitle, children }) {
  return (
    <section className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
      {(title || subtitle) && (
        <div className="mb-4 border-b border-navy-100 pb-3">
          {title ? <h3 className="text-sm font-semibold text-navy-900">{title}</h3> : null}
          {subtitle ? <p className="mt-0.5 text-xs text-navy-500">{subtitle}</p> : null}
        </div>
      )}
      {children}
    </section>
  );
}

function IconInput({ icon: Icon, large = false, ...props }) {
  return (
    <div className="relative">
      <Icon
        size={large ? 22 : 18}
        className={`pointer-events-none absolute text-navy-400 ${large ? 'left-4 top-1/2 -translate-y-1/2' : 'left-3 top-1/2 -translate-y-1/2'}`}
        aria-hidden="true"
      />
      <input
        {...props}
        className={`${large ? INPUT_LG : INPUT_MD} ${props.className || ''}`}
      />
    </div>
  );
}

function PageLogoWatermark() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <img
        src={LOGO_PATH}
        alt=""
        draggable={false}
        className="absolute left-1/2 top-1/2 h-[min(96vh,980px)] w-auto max-w-[min(100vw,1100px)] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.1]"
      />
    </div>
  );
}

function HostSelect({ value, onChange, hosts }) {
  return (
    <div className="relative">
      <User size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy-400" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => {
          e.stopPropagation();
          onChange(e);
        }}
        className={`${INPUT_MD} appearance-none`}
      >
        <option value="">Person visiting…</option>
        {hosts.map((host) => (
          <option key={host.id} value={host.id}>{host.name}</option>
        ))}
      </select>
    </div>
  );
}


function VehicleTypePicker({ value, onChange }) {
  return (
    <div className="grid w-full grid-cols-4 gap-3">
      {VEHICLE_TYPES.map(({ value: typeValue, label, icon: Icon }) => {
        const active = value === typeValue;
        return (
          <button
            key={typeValue}
            type="button"
            onClick={() => onChange(typeValue)}
            className={`flex w-full min-w-0 flex-col items-center gap-2 rounded-xl border px-2 py-4 text-xs font-semibold leading-tight transition-all sm:text-sm ${
              active
                ? 'border-cyan-600 bg-cyan-50 text-cyan-800 ring-2 ring-cyan-600/15 shadow-sm'
                : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300 hover:bg-navy-50'
            }`}
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${active ? 'bg-cyan-100 text-cyan-700' : 'bg-navy-50 text-navy-500'}`}>
              <Icon size={20} className="shrink-0" aria-hidden="true" />
            </span>
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepIndicator({ step, steps }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {steps.map((item, index) => {
          const active = index === step;
          const complete = index < step;
          return (
            <div
              key={item.key}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-cyan-600/10 text-cyan-800 ring-1 ring-cyan-600/20'
                  : complete
                    ? 'bg-emerald-50 text-emerald-800'
                    : 'bg-white text-navy-400 ring-1 ring-navy-100'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                  active
                    ? 'bg-cyan-600 text-white'
                    : complete
                      ? 'bg-emerald-600 text-white'
                      : 'bg-navy-100 text-navy-500'
                }`}
              >
                {complete ? <CheckCircle2 size={14} aria-hidden="true" /> : index + 1}
              </span>
              <span className="hidden sm:inline">{item.label}</span>
            </div>
          );
        })}
      </div>
      <p className="text-xs font-medium text-navy-500 sm:text-right">
        Step {step + 1} of {steps.length}
        <span className="text-navy-300"> · </span>
        <span className="text-navy-800">{steps[step]?.label}</span>
      </p>
    </div>
  );
}

function ReviewCard({ title, children }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-navy-100 bg-navy-50/50">
      <div className="border-b border-navy-100 bg-white px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-navy-900">{title}</h3>
      </div>
      <dl className="px-4 py-1 sm:px-5">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-navy-100/80 py-3 last:border-0">
      <dt className="text-sm text-navy-500">{label}</dt>
      <dd className="max-w-[60%] text-right text-sm font-semibold text-navy-900">{value}</dd>
    </div>
  );
}

function CheckInSignatureStep({ subjectName, signatureLabel, signature, onSignatureChange, signatureHint }) {
  return (
    <FormSection
      title="Check-in signature"
      subtitle={`${subjectName || signatureLabel} confirms arrival by signing below`}
    >
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-cyan-100 bg-cyan-50/60 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-cyan-700 ring-1 ring-cyan-100">
          <PenLine size={20} aria-hidden="true" />
        </span>
        <p className="text-sm text-navy-700">
          {signatureHint || 'This signature confirms check-in at the gate.'}
        </p>
      </div>
      <SignaturePad
        value={signature}
        onChange={onSignatureChange}
        label={`${signatureLabel} signature`}
        hint="Sign with finger or stylus — required to complete check-in"
      />
    </FormSection>
  );
}

function StepActions({ step, totalSteps, onBack, onNext, onFinish, submitting, layout = 'embedded', finishLabel, finishLoadingLabel }) {
  const isLast = step === totalSteps - 1;
  const showBack = step > 0;

  const primaryBtnClass = isLast
    ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-600 text-white'
    : 'bg-cyan-600 hover:bg-cyan-700 border-cyan-600 text-white';

  const edgeBtnBase =
    '!rounded-none min-h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] w-full border-0 border-t border-navy-100 text-base font-semibold shadow-none pb-[env(safe-area-inset-bottom,0px)]';

  const continueClassName = `${edgeBtnBase} ${showBack ? 'flex-1 !rounded-br-3xl' : 'gate-entry-actions !rounded-b-3xl'} ${primaryBtnClass}`;

  const continueBtn = (
    <LoadingButton
      type="button"
      size="lg"
      onClick={isLast ? onFinish : onNext}
      loading={submitting}
      loadingLabel={finishLoadingLabel || 'Logging entry…'}
      icon={isLast ? undefined : ArrowRight}
      className={layout === 'kiosk' ? continueClassName : `${primaryBtnClass} w-full sm:w-auto min-w-[10rem]`}
    >
      {isLast ? (finishLabel || 'Log & allow entry') : 'Continue'}
    </LoadingButton>
  );

  if (layout !== 'kiosk') {
    return (
      <div className="flex flex-col-reverse gap-3 border-t border-navy-100 pt-4 sm:flex-row sm:justify-end">
        {showBack ? (
          <LoadingButton
            type="button"
            variant="ghost"
            size="lg"
            onClick={onBack}
            disabled={submitting}
            icon={ArrowLeft}
            className="w-full sm:w-auto"
          >
            Back
          </LoadingButton>
        ) : null}
        {continueBtn}
      </div>
    );
  }

  if (!showBack) {
    return continueBtn;
  }

  return (
    <div className="gate-entry-actions flex w-full shrink-0 gap-0">
      <LoadingButton
        type="button"
        variant="ghost"
        size="lg"
        onClick={onBack}
        disabled={submitting}
        icon={ArrowLeft}
        className={`${edgeBtnBase} flex-1 !rounded-bl-3xl border-r border-navy-200 bg-white text-navy-700 hover:bg-navy-50`}
      >
        Back
      </LoadingButton>
      {continueBtn}
    </div>
  );
}

function resolveSection(tab) {
  const value = String(tab || '').toLowerCase();
  if (value === 'checkout' || value === 'check-out') return 'checkout';
  if (value === 'checkin' || value === 'check-in' || value === 'gate') return 'checkin';
  return 'checkin';
}

export default function GateEntryCheckInForm({
  layout = 'embedded',
  entryContext = 'gate',
  api = DEFAULT_GATE_API,
  onSuccess,
  initialMode = 'walk-in',
  showCheckout = layout === 'kiosk',
  className = '',
}) {
  const toast = useToast();
  const copy = COPY[entryContext] || COPY.gate;
  const [searchParams, setSearchParams] = useSearchParams();
  const [section, setSection] = useState(() => (showCheckout ? resolveSection(searchParams.get('tab')) : 'checkin'));
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState(0);
  const [refData, setRefData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [walkIn, setWalkIn] = useState(emptyWalkIn);
  const [vehicle, setVehicle] = useState(emptyVehicle);
  const [photoPreview, setPhotoPreview] = useState('');
  const [checkInSignature, setCheckInSignature] = useState('');
  const [nrcLookup, setNrcLookup] = useState(emptyNrcLookup);
  const [dojahOverride, setDojahOverride] = useState(false);

  const steps = mode === 'vehicle' ? VEHICLE_STEPS : WALKIN_STEPS;
  const dojahEnabled = Boolean(refData?.integrations?.dojah?.enabled && refData?.integrations?.dojah?.configured);

  const loadRef = useCallback(async () => {
    try {
      setRefData(await api.getReferenceData());
    } catch {
      toast.error('Failed to load reference data.');
    } finally {
      setLoading(false);
    }
  }, [api, toast]);

  useEffect(() => {
    void loadRef();
  }, [loadRef]);

  const blockImplicitSubmit = (e) => {
    if (e.key !== 'Enter') return;
    const tag = e.target?.tagName;
    if (tag === 'TEXTAREA') return;
    e.preventDefault();
  };

  useEffect(() => {
    setStep(0);
    setPhotoPreview('');
    setCheckInSignature('');
    setNrcLookup(emptyNrcLookup());
    setDojahOverride(false);
  }, [mode]);

  useEffect(() => {
    if (!showCheckout) return;
    setSection(resolveSection(searchParams.get('tab')));
  }, [searchParams, showCheckout]);

  const handleSectionChange = (nextSection) => {
    if (!showCheckout) return;
    setSection(nextSection);
    if (nextSection === 'checkout') {
      setSearchParams({ tab: 'checkout' }, { replace: true });
      return;
    }
    setSearchParams({ tab: 'checkin' }, { replace: true });
  };

  useEffect(() => {
    if (section === 'checkin') return;
    setStep(0);
  }, [section]);

  const hosts = refData?.hosts || [];
  const hostName = (id) => hosts.find((h) => h.id === id)?.name || '';
  const vehicleTypeLabel = (value) => VEHICLE_TYPES.find((t) => t.value === value)?.label || value;
  const stationLabel = refData?.scope?.stationName || refData?.scope?.siteName || 'Gate';
  const siteLabel = refData?.scope?.siteName;

  const verifyNrc = async () => {
    const nrc = formatNrcInput(walkIn.idNumber);
    if (walkIn.idType !== 'nrc' || !isCompleteNrc(nrc)) {
      toast.error(`Enter a complete NRC (${NRC_PLACEHOLDER}) before verifying.`);
      return;
    }
    if (!dojahEnabled) return;

    setWalkIn((prev) => (prev.idNumber === nrc ? prev : { ...prev, idNumber: nrc }));

    setNrcLookup({ status: 'loading', taxpayerName: '', tpin: '', message: '' });
    setDojahOverride(false);
    try {
      const result = await api.nrcLookup(nrc);
      setNrcLookup({
        status: 'verified',
        taxpayerName: result.taxpayer_name || '',
        tpin: result.tpin || '',
        message: result.current_status ? `Registry status: ${result.current_status}` : 'Verified with Dojah',
      });
      setWalkIn((prev) => ({
        ...prev,
        fullName: result.taxpayer_name || prev.fullName,
        tpin: result.tpin || prev.tpin,
      }));
    } catch (err) {
      if (err.unavailable) {
        setNrcLookup({
          status: 'unavailable',
          taxpayerName: '',
          tpin: '',
          message: err.message || 'Dojah service is temporarily unavailable.',
        });
        return;
      }
      setNrcLookup({
        status: 'failed',
        taxpayerName: '',
        tpin: '',
        message: err.message || 'NRC verification failed.',
      });
    }
  };

  const handlePlateBlur = async () => {
    const plate = vehicle.plateNumber.trim();
    if (plate.length < 3) return;
    try {
      const result = await api.searchVehicleByPlate(plate);
      const known = result?.knownVehicles?.[0];
      const expected = result?.expectedVehicles?.[0];
      if (known?.driver_name || expected?.driver_name) {
        setVehicle((prev) => ({
          ...prev,
          driverName: known?.driver_name || expected?.driver_name || prev.driverName,
          vehicleType: known?.vehicle_type || prev.vehicleType,
        }));
      }
    } catch {
      // Non-blocking lookup
    }
  };

  const validateStep = () => {
    if (mode === 'vehicle') {
      if (step === 0 && !vehicle.plateNumber.trim()) {
        toast.error('Plate number is required.');
        return false;
      }
      return true;
    }
    if (step === 0) {
      if (walkIn.idType === 'nrc' && !walkIn.idNumber.trim()) {
        toast.error('NRC number is required.');
        return false;
      }
      if (walkIn.idType === 'nrc' && walkIn.idNumber.trim() && !isCompleteNrc(walkIn.idNumber)) {
        toast.error(`Enter a complete NRC (${NRC_PLACEHOLDER}).`);
        return false;
      }
      if (walkIn.idType === 'nrc' && dojahEnabled && !dojahOverride && nrcLookup.status !== 'verified') {
        if (nrcLookup.status === 'unavailable') {
          toast.error('Confirm manual override — Dojah is unavailable.');
        } else {
          toast.error('Verify the NRC with Dojah before continuing.');
        }
        return false;
      }
      if (!walkIn.fullName.trim()) {
        toast.error('Full name is required.');
        return false;
      }
      return true;
    }
    if (step === 3 && !checkInSignature.trim()) {
      toast.error('Please sign to confirm check-in.');
      return false;
    }
    return true;
  };

  const goNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const resetForm = () => {
    setWalkIn(emptyWalkIn());
    setVehicle(emptyVehicle());
    setPhotoPreview('');
    setCheckInSignature('');
    setNrcLookup(emptyNrcLookup());
    setDojahOverride(false);
    setStep(0);
  };

  const submitWalkIn = async (e) => {
    e?.preventDefault?.();
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      const visit = await api.submitWalkIn({
        ...walkIn,
        phone: buildFullPhone(walkIn.phoneCountry, walkIn.phone),
        dojahOverride: dojahOverride || undefined,
        checkInSignature,
      });
      toast.success(copy.successWalkIn(visit));
      resetForm();
      onSuccess?.({ kind: 'walk-in', visit });
    } catch (err) {
      if (err.unavailable) {
        setNrcLookup({
          status: 'unavailable',
          taxpayerName: '',
          tpin: '',
          message: err.message || 'Dojah service is temporarily unavailable.',
        });
      }
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitVehicle = async (e) => {
    e?.preventDefault?.();
    if (!validateStep()) return;
    if (!vehicle.plateNumber.trim()) {
      toast.error('Plate number is required.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.submitVehicle({
        ...vehicle,
        phone: buildFullPhone(vehicle.phoneCountry, vehicle.phone),
        checkInSignature,
      });
      toast.success(copy.successVehicle(result));
      resetForm();
      onSuccess?.({ kind: 'vehicle', result });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const finishEntry = () => {
    const noop = { preventDefault: () => {} };
    if (mode === 'vehicle') {
      void submitVehicle(noop);
      return;
    }
    void submitWalkIn(noop);
  };

  const renderVehicleStep = () => {
    if (step === 0) {
      return (
        <div className="space-y-5">
          <FormSection title="Vehicle capture" subtitle="Photo, plate, and vehicle type">
            <div className="space-y-5">
              <div>
                <FieldLabel>Vehicle photo</FieldLabel>
                <CameraCapture
                  label="Capture vehicle photo"
                  hint="Opens camera to take photo"
                  preview={photoPreview}
                  onCapture={setPhotoPreview}
                  onError={(message) => toast.error(message)}
                />
              </div>
              <div>
                <FieldLabel>Plate number</FieldLabel>
                <IconInput
                  icon={Car}
                  large
                  value={vehicle.plateNumber}
                  onChange={(e) => setVehicle((v) => ({ ...v, plateNumber: e.target.value.toUpperCase() }))}
                  onBlur={handlePlateBlur}
                  placeholder="ABC 1234"
                  autoFocus
                />
              </div>
              <div>
                <FieldLabel>Vehicle type</FieldLabel>
                <VehicleTypePicker
                  value={vehicle.vehicleType}
                  onChange={(typeValue) => setVehicle((v) => ({ ...v, vehicleType: typeValue }))}
                />
              </div>
            </div>
          </FormSection>
        </div>
      );
    }

    if (step === 1) {
      return (
        <FormSection title="Driver details" subtitle="Who is operating the vehicle">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <FieldLabel>Driver full name</FieldLabel>
            <IconInput
              icon={User}
              value={vehicle.driverName}
              onChange={(e) => setVehicle((v) => ({ ...v, driverName: e.target.value }))}
              placeholder="Driver name"
              autoFocus
            />
          </div>
          <div>
            <FieldLabel>Phone number</FieldLabel>
            <PhoneInput
              country={vehicle.phoneCountry}
              value={vehicle.phone}
              onCountryChange={(phoneCountry) => setVehicle((v) => ({ ...v, phoneCountry }))}
              onChange={(phone) => setVehicle((v) => ({ ...v, phone }))}
            />
          </div>
          <div>
            <FieldLabel optional>Company / organisation</FieldLabel>
            <IconInput
              icon={Building2}
              value={vehicle.company}
              onChange={(e) => setVehicle((v) => ({ ...v, company: e.target.value }))}
              placeholder="Company name (optional)"
            />
          </div>
          <div>
            <FieldLabel>Number of occupants</FieldLabel>
            <IconInput
              icon={Users}
              type="number"
              min="1"
              max="20"
              value={vehicle.occupantCount}
              onChange={(e) => setVehicle((v) => ({ ...v, occupantCount: e.target.value }))}
            />
          </div>
          </div>
        </FormSection>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-5">
          <FormSection title="Visit details" subtitle="Host and purpose of visit">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <FieldLabel>Person visiting</FieldLabel>
                <HostSelect
                  value={vehicle.hostId}
                  onChange={(e) => setVehicle((v) => ({ ...v, hostId: e.target.value }))}
                  hosts={hosts}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Purpose of visit</FieldLabel>
                <PurposeSelect
                  value={vehicle.purpose}
                  onChange={(e) => setVehicle((v) => ({ ...v, purpose: e.target.value }))}
                />
              </div>
            </div>
          </FormSection>

          <ReviewCard title="Review entry">
            <ReviewRow label="Plate" value={vehicle.plateNumber} />
            <ReviewRow label="Vehicle type" value={vehicleTypeLabel(vehicle.vehicleType)} />
            <ReviewRow label="Driver" value={vehicle.driverName} />
            <ReviewRow label="Phone" value={formatPhoneDisplay(vehicle.phoneCountry, vehicle.phone)} />
            <ReviewRow label="Company" value={vehicle.company} />
            <ReviewRow label="Occupants" value={vehicle.occupantCount} />
            <ReviewRow label="Host" value={hostName(vehicle.hostId)} />
            <ReviewRow label="Purpose" value={vehicle.purpose} />
          </ReviewCard>
        </div>
      );
    }

    return (
      <CheckInSignatureStep
        subjectName={vehicle.driverName}
        signatureLabel="Driver"
        signature={checkInSignature}
        onSignatureChange={setCheckInSignature}
        signatureHint={copy.signatureHint}
      />
    );
  };

  const renderWalkInStep = () => {
    const idNumberLabel = walkIn.idType === 'passport' ? 'Passport Number' : 'NRC Number';
    const idNumberPlaceholder = walkIn.idType === 'passport' ? 'Passport number' : NRC_PLACEHOLDER;

    if (step === 0) {
      return (
        <div className="space-y-5">
          <FormSection title="Visitor identity" subtitle="Photo, ID document, and contact details">
            <div className="space-y-5">
              <div>
                <FieldLabel>Visitor photo</FieldLabel>
                <CameraCapture
                  label="Capture visitor photo"
                  hint="Opens camera to take photo"
                  preview={photoPreview}
                  onCapture={setPhotoPreview}
                  onError={(message) => toast.error(message)}
                />
              </div>

              <div>
                <FieldLabel>ID type</FieldLabel>
                <div className="grid grid-cols-2 gap-3">
                  {ID_TYPES.map(({ value, label, icon: Icon }) => {
                    const active = walkIn.idType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setWalkIn((v) => ({ ...v, idType: value, idNumber: '', tpin: '' }));
                          setNrcLookup(emptyNrcLookup());
                          setDojahOverride(false);
                        }}
                        className={`flex h-14 w-full min-w-0 items-center justify-center gap-2 rounded-xl border px-4 text-base font-semibold transition-all ${
                          active
                            ? 'border-cyan-600 bg-cyan-50 text-cyan-800 ring-2 ring-cyan-600/15 shadow-sm'
                            : 'border-navy-200 bg-white text-navy-600 hover:border-navy-300 hover:bg-navy-50'
                        }`}
                      >
                        <Icon size={18} className="shrink-0" aria-hidden="true" />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <FieldLabel hint={walkIn.idType === 'nrc' ? `Enter 9 digits — formatted as ${NRC_PLACEHOLDER}` : undefined}>
                  {idNumberLabel}
                </FieldLabel>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0 flex-1">
                    <IconInput
                      icon={IdCard}
                      large
                      value={walkIn.idNumber}
                      onChange={(e) => {
                        const nextValue = walkIn.idType === 'nrc'
                          ? formatNrcInput(e.target.value)
                          : e.target.value;
                        setWalkIn((v) => ({ ...v, idNumber: nextValue, tpin: '' }));
                        setNrcLookup(emptyNrcLookup());
                        setDojahOverride(false);
                      }}
                      placeholder={idNumberPlaceholder}
                      inputMode={walkIn.idType === 'nrc' ? 'numeric' : undefined}
                      maxLength={walkIn.idType === 'nrc' ? NRC_INPUT_MAX_LENGTH : undefined}
                      autoFocus
                    />
                  </div>
                  {walkIn.idType === 'nrc' && dojahEnabled ? (
                    <LoadingButton
                      type="button"
                      size="lg"
                      loading={nrcLookup.status === 'loading'}
                      loadingLabel="Verifying…"
                      icon={ShieldCheck}
                      onClick={verifyNrc}
                      disabled={!isCompleteNrc(walkIn.idNumber)}
                      className="h-[54px] shrink-0 px-6 bg-cyan-600 hover:bg-cyan-700 border-cyan-600"
                    >
                      Verify
                    </LoadingButton>
                  ) : null}
                </div>
                {walkIn.idType === 'nrc' && dojahEnabled && nrcLookup.status !== 'verified' && nrcLookup.status !== 'loading' ? (
                  <div className="mt-3">
                    {nrcLookup.status === 'failed' ? (
                      <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/10">
                        {nrcLookup.message}
                      </p>
                    ) : null}
                    {nrcLookup.status === 'unavailable' ? (
                      <div className="space-y-3">
                        <p className="inline-flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-600/10">
                          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{nrcLookup.message}</span>
                        </p>
                        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={dojahOverride}
                            onChange={(e) => setDojahOverride(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-700 focus:ring-amber-500"
                          />
                          <span>
                            <span className="block text-sm font-medium text-amber-950">
                              Continue without Dojah verification
                            </span>
                            <span className="mt-0.5 block text-xs text-amber-800/80">
                              Manual entry — guard confirms identity on site. This is logged in the audit trail.
                            </span>
                          </span>
                        </label>
                      </div>
                    ) : null}
                    {nrcLookup.status === 'idle' ? (
                      <p className="text-xs text-navy-400">
                        Enter the full NRC, then tap Verify to load name and TPIN from the registry.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <FieldLabel>Full name</FieldLabel>
                  <IconInput
                    icon={User}
                    value={walkIn.fullName}
                    onChange={(e) => setWalkIn((v) => ({ ...v, fullName: e.target.value }))}
                    placeholder="Visitor full name"
                    readOnly={nrcLookup.status === 'verified' && Boolean(nrcLookup.taxpayerName)}
                    className={nrcLookup.status === 'verified' && nrcLookup.taxpayerName ? 'bg-emerald-50/50' : ''}
                  />
                </div>
                {walkIn.idType === 'nrc' ? (
                  <div>
                    <FieldLabel>TPIN</FieldLabel>
                    <IconInput
                      icon={Hash}
                      value={walkIn.tpin}
                      onChange={(e) => setWalkIn((v) => ({ ...v, tpin: e.target.value }))}
                      placeholder="From Dojah verification"
                      readOnly={nrcLookup.status === 'verified' && Boolean(walkIn.tpin)}
                      className={nrcLookup.status === 'verified' && walkIn.tpin ? 'bg-emerald-50/50' : ''}
                    />
                  </div>
                ) : null}
                <div className={walkIn.idType === 'nrc' ? 'md:col-span-2' : ''}>
                  <FieldLabel>Phone number</FieldLabel>
                  <PhoneInput
                    country={walkIn.phoneCountry}
                    value={walkIn.phone}
                    onCountryChange={(phoneCountry) => setWalkIn((v) => ({ ...v, phoneCountry }))}
                    onChange={(phone) => setWalkIn((v) => ({ ...v, phone }))}
                  />
                </div>
              </div>
            </div>
          </FormSection>
        </div>
      );
    }

    if (step === 1) {
      return (
        <FormSection title="Company" subtitle="Organisation the visitor represents (optional)">
          <FieldLabel optional>Company / organisation</FieldLabel>
          <IconInput
            icon={Building2}
            value={walkIn.company}
            onChange={(e) => setWalkIn((v) => ({ ...v, company: e.target.value }))}
            placeholder="Company name (optional)"
            autoFocus
          />
        </FormSection>
      );
    }

    if (step === 2) {
      return (
        <div className="space-y-5">
          <FormSection title="Visit details" subtitle="Host and purpose of visit">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <FieldLabel>Person visiting</FieldLabel>
                <HostSelect
                  value={walkIn.hostId}
                  onChange={(e) => setWalkIn((v) => ({ ...v, hostId: e.target.value }))}
                  hosts={hosts}
                />
              </div>
              <div className="md:col-span-2">
                <FieldLabel>Purpose of visit</FieldLabel>
                <PurposeSelect
                  value={walkIn.purpose}
                  onChange={(e) => setWalkIn((v) => ({ ...v, purpose: e.target.value }))}
                />
              </div>
            </div>
          </FormSection>

          <ReviewCard title="Review entry">
            <ReviewRow label="Name" value={walkIn.fullName} />
            <ReviewRow label="Phone" value={formatPhoneDisplay(walkIn.phoneCountry, walkIn.phone)} />
            <ReviewRow label="NRC / ID" value={walkIn.idNumber} />
            <ReviewRow label="TPIN" value={walkIn.tpin} />
            <ReviewRow label="ID type" value={walkIn.idType === 'nrc' ? 'NRC' : 'Passport'} />
            <ReviewRow label="Company" value={walkIn.company} />
            <ReviewRow label="Host" value={hostName(walkIn.hostId)} />
            <ReviewRow label="Purpose" value={walkIn.purpose} />
          </ReviewCard>
        </div>
      );
    }

    return (
      <CheckInSignatureStep
        subjectName={walkIn.fullName}
        signatureLabel="Visitor"
        signature={checkInSignature}
        onSignatureChange={setCheckInSignature}
        signatureHint={copy.signatureHint}
      />
    );
  };

  const formBody = loading ? (
    <div className="flex flex-1 items-center justify-center py-20">
      <Spinner size={32} />
    </div>
  ) : section === 'checkout' ? (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-5 sm:px-8 sm:pb-6">
      <GateCheckOutPanel mode={mode} />
    </div>
  ) : (
    <form
      onSubmit={(e) => e.preventDefault()}
      onKeyDown={blockImplicitSubmit}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 pb-5 sm:px-8 sm:pb-6">
        {mode === 'vehicle' ? renderVehicleStep() : renderWalkInStep()}
      </div>

      <div className={layout === 'kiosk' ? 'shrink-0' : 'px-5 pb-5 sm:px-8 sm:pb-6'}>
        <StepActions
          step={step}
          totalSteps={steps.length}
          onBack={goBack}
          onNext={goNext}
          onFinish={finishEntry}
          submitting={submitting}
          layout={layout}
          finishLabel={copy.finishLabel}
          finishLoadingLabel={copy.finishLoadingLabel}
        />
      </div>
    </form>
  );

  if (layout === 'embedded') {
    return (
      <div className={`space-y-4 ${className}`}>
        <div className="rounded-2xl border border-navy-100 bg-white px-2 py-2 sm:px-4">
          <SegmentedControl
            fullWidth
            value={mode}
            onChange={setMode}
            options={[
              { value: 'walk-in', label: 'Walk-in', icon: Footprints },
              { value: 'vehicle', label: 'Vehicle', icon: Car },
            ]}
          />
        </div>
        <div className="rounded-2xl border border-navy-100 bg-white p-4 sm:p-5">
          <div className="mb-4 border-b border-navy-100 pb-3">
            <StepIndicator step={step} steps={steps} />
          </div>
          {formBody}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden bg-navy-50 ${className}`}>
      <PageLogoWatermark />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-navy-100 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-navy-200 bg-navy-50 text-cyan-700 shadow-sm">
                <ShieldCheck size={22} strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                {siteLabel && siteLabel !== stationLabel ? (
                  <p className="truncate text-xs font-semibold uppercase tracking-wider text-navy-400">{siteLabel}</p>
                ) : (
                  <p className="text-xs font-semibold uppercase tracking-wider text-cyan-700">Gate entry kiosk</p>
                )}
                <h2 className="truncate text-lg font-bold text-navy-900">{stationLabel}</h2>
              </div>
            </div>
            {showCheckout ? (
              <SegmentedControl
                className="lg:min-w-[320px]"
                fullWidth
                size="lg"
                variant="kioskSoft"
                value={section}
                onChange={handleSectionChange}
                options={[
                  { value: 'checkin', label: 'Checkin', icon: LogIn },
                  { value: 'checkout', label: 'Checkout', icon: LogOut },
                ]}
              />
            ) : null}
          </div>
          <SegmentedControl
            fullWidth
            size="lg"
            variant="kiosk"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'vehicle', label: 'Vehicle', icon: Car },
              { value: 'walk-in', label: 'Walk-in', icon: Footprints },
            ]}
          />
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-4 pt-4 pb-4 sm:px-6 sm:pt-4 sm:pb-4">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
          {section === 'checkin' ? (
            <div className="border-b border-navy-100 bg-navy-50/70 px-5 py-4 sm:px-8">
              <StepIndicator step={step} steps={steps} />
            </div>
          ) : null}
          {formBody}
        </div>
      </div>
      </div>
    </div>
  );
}
