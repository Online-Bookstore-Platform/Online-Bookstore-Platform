import { useRef, useState } from 'react';
import { apiPut } from '../api.js';
import { DEFAULT_COUNTRY } from '../config.js';
import { EMPTY_DELIVERY, deliveryToForm, tidyDelivery, validateDelivery } from '../utils/delivery.js';

/**
 * Delivery details form. `initial` is the saved delivery (or null) and `suggestion` the
 * profile name/phone to pre-fill with. Calls onSaved(delivery) after the server accepted it.
 */
export default function DeliveryForm({ initial, suggestion, onSaved, onCancel }) {
  const [values, setValues] = useState(() => ({
    ...EMPTY_DELIVERY,
    country: DEFAULT_COUNTRY,
    ...(suggestion ?? {}),
    ...(initial ? deliveryToForm(initial) : {}),
  }));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef(null);

  function change(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clear a field's message as soon as it is being fixed.
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusFirstProblem() {
    // Wait for React to render aria-invalid on the fields before looking for it.
    requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;

    const found = validateDelivery(values);
    setErrors(found);
    setFormError('');
    if (Object.keys(found).length > 0) {
      focusFirstProblem();
      return;
    }

    setSaving(true);
    try {
      const payload = await apiPut('/checkout/delivery', tidyDelivery(values));
      onSaved(payload.data);
    } catch (err) {
      if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        setFormError('Please check the highlighted details and try again.');
        focusFirstProblem();
      } else {
        setFormError(err.message);
      }
    } finally {
      setSaving(false);
    }
  }

  function field(name, label, { hint, optional, ...input } = {}) {
    const id = `delivery-${name}`;
    const message = errors[name];
    const describedBy = [hint && `${id}-hint`, message && `${id}-error`].filter(Boolean).join(' ') || undefined;
    return (
      <div className={`form-field form-field--${name}`}>
        <label htmlFor={id}>
          {label}
          {optional && <span className="form-field__optional"> (optional)</span>}
        </label>
        {hint && (
          <p className="form-field__hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
        <input
          id={id}
          name={name}
          className="field"
          value={values[name]}
          onChange={(event) => change(name, event.target.value)}
          aria-invalid={message ? 'true' : undefined}
          aria-describedby={describedBy}
          disabled={saving}
          {...input}
        />
        {message && (
          <p className="field-error" id={`${id}-error`}>
            {message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form className="delivery-form" ref={formRef} onSubmit={submit} noValidate>
      {formError && (
        <p className="form-banner" role="alert">
          {formError}
        </p>
      )}

      {field('recipientName', 'Full name', { autoComplete: 'name', maxLength: 100 })}
      {field('phone', 'Phone number', {
        type: 'tel',
        inputMode: 'tel',
        autoComplete: 'tel',
        hint: 'The courier may call this number. For example 9876543210.',
        maxLength: 25,
      })}
      {field('addressLine1', 'Address', {
        autoComplete: 'address-line1',
        hint: 'House or flat number and street.',
        maxLength: 150,
      })}
      {field('addressLine2', 'Area or landmark', { optional: true, autoComplete: 'address-line2', maxLength: 150 })}

      <div className="form-row">
        {field('city', 'City', { autoComplete: 'address-level2', maxLength: 80 })}
        {field('state', 'State', { autoComplete: 'address-level1', maxLength: 80 })}
      </div>
      <div className="form-row">
        {field('postalCode', 'PIN code', { autoComplete: 'postal-code', inputMode: 'text', maxLength: 12 })}
        {field('country', 'Country', { autoComplete: 'country-name', maxLength: 60 })}
      </div>

      <div className="form-actions">
        <button type="submit" className="btn" disabled={saving}>
          {saving ? 'Saving…' : 'Save delivery details'}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--outline" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
