import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Modal, FormField, LoadingButton, PhoneInput } from '../ui';
import { DEFAULT_PHONE_COUNTRY } from '../../utils/helpers';

export default function ExecutiveVisitModal({
  isOpen,
  onClose,
  initialValues = null,
  purposeOptions = [],
  onContinue,
}) {
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_PHONE_COUNTRY);
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFullName(initialValues?.fullName || '');
    setCompany(initialValues?.company || '');
    setPhoneCountry(initialValues?.phoneCountry || DEFAULT_PHONE_COUNTRY);
    setPhone(initialValues?.phone || '');
    setPurpose(initialValues?.purpose || '');
    setError('');
  }, [isOpen, initialValues]);

  const handleContinue = () => {
    if (!fullName.trim()) {
      setError('Visitor name is required.');
      return;
    }
    onContinue?.({
      fullName: fullName.trim(),
      company: company.trim(),
      phoneCountry,
      phone,
      purpose,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Executive visit"
      subtitle="Quick check-in — only the visitor's name is required"
      size="md"
      footer={(
        <>
          <LoadingButton variant="secondary" onClick={onClose}>
            Cancel
          </LoadingButton>
          <LoadingButton
            icon={ArrowRight}
            onClick={handleContinue}
            className="bg-cyan-600 hover:bg-cyan-500 border-cyan-600"
          >
            Continue
          </LoadingButton>
        </>
      )}
    >
      <div className="space-y-4">
        <FormField
          label="Name of visitor"
          name="executiveFullName"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            setError('');
          }}
          placeholder="Visitor full name"
          required
          error={error}
        />
        <FormField
          label="Company"
          name="executiveCompany"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company name (optional)"
        />
        <div>
          <label className="block text-sm font-medium text-navy-700 mb-1.5">
            Mobile phone
          </label>
          <PhoneInput
            country={phoneCountry}
            value={phone}
            onCountryChange={setPhoneCountry}
            onChange={setPhone}
          />
        </div>
        <FormField
          label="Purpose of visit"
          name="executivePurpose"
          type="select"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          options={[
            { value: '', label: 'Select purpose… (optional)' },
            ...purposeOptions,
          ]}
        />
      </div>
    </Modal>
  );
}
