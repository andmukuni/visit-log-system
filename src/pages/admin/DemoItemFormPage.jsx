import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Card, FormField, SaveAction, CancelAction, ActionToolbar } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

export default function DemoItemFormPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'Software',
    status: 'draft',
    description: '',
  });

  const update = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600));
    setSaving(false);
    toast.success('Demo item saved (not persisted — add your API here).');
    navigate('/admin/items');
  };

  return (
    <div>
      <PageHeader
        title="Create Demo Item"
        subtitle="Example form page using FormField + Card"
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Demo Items', to: '/admin/items' },
          { label: 'Create' },
        ]}
      />

      <form onSubmit={handleSubmit}>
        <Card title="Item details" className="max-w-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Name"
              name="name"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              required
            />
            <FormField
              label="Category"
              name="category"
              type="select"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              options={[
                { value: 'Software', label: 'Software' },
                { value: 'Hardware', label: 'Hardware' },
                { value: 'Services', label: 'Services' },
              ]}
            />
            <FormField
              label="Status"
              name="status"
              type="select"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
                { value: 'archived', label: 'Archived' },
              ]}
            />
            <FormField
              label="Description"
              name="description"
              textarea
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              rows={4}
            />
          </div>

          <ActionToolbar className="mt-6">
            <SaveAction type="submit" loading={saving} label="Save demo item" />
            <CancelAction label="Cancel" onClick={() => navigate('/admin/items')} />
          </ActionToolbar>
        </Card>
      </form>
    </div>
  );
}
