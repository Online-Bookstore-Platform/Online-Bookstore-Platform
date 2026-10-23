import { FIELD_LABELS } from './deliveryRules.js';
import styles from './Checkout.module.css';

const FIELDS = [
  { name: 'recipientName', autoComplete: 'name', wide: true },
  { name: 'phone', type: 'tel', autoComplete: 'tel', inputMode: 'tel', wide: true, hint: 'We use it only for delivery updates. For example 98765 43210.' },
  { name: 'addressLine1', autoComplete: 'address-line1', wide: true, hint: 'House number and street.' },
  { name: 'addressLine2', label: 'Address line 2 (optional)', autoComplete: 'address-line2', wide: true, hint: 'Apartment, floor or a landmark.' },
  { name: 'city', autoComplete: 'address-level2' },
  { name: 'state', autoComplete: 'address-level1' },
  { name: 'postalCode', autoComplete: 'postal-code' },
  { name: 'country', autoComplete: 'country-name' },
];

export const fieldId = name => `delivery-${name}`;

/** The delivery form. Errors are shown under each field and tied to it for screen readers. */
export default function DeliveryForm({ values, errors, onChange, onBlur, onSubmit }) {
  return (
    <form id="delivery-form" className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby="delivery-heading">
      <h2 id="delivery-heading">Where should we send it?</h2>
      <div className={styles.fields}>
        {FIELDS.map(field => {
          const id = fieldId(field.name);
          const error = errors[field.name];
          const described = [field.hint && !error ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
          return (
            <div key={field.name} className={`${styles.field} ${field.wide ? styles.wide : ''}`}>
              <label htmlFor={id}>{field.label ?? FIELD_LABELS[field.name]}</label>
              <input
                id={id}
                name={field.name}
                type={field.type ?? 'text'}
                inputMode={field.inputMode}
                autoComplete={field.autoComplete}
                value={values[field.name]}
                onChange={event => onChange(field.name, event.target.value)}
                onBlur={() => onBlur(field.name)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={described}
              />
              {field.hint && !error && <p className={styles.hint} id={`${id}-hint`}>{field.hint}</p>}
              {error && <p className={styles.fieldError} id={`${id}-error`}>{error}</p>}
            </div>
          );
        })}
      </div>
    </form>
  );
}
