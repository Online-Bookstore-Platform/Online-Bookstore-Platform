import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, loginPath } from '../../uditi/shared/api.js';
import { fieldErrors, getProfile, registerCustomer, updateProfile } from '../api.js';
import { logout } from '../../varchas/api.js';
import styles from './RegistrationProfile.module.css';

const emptyRegistration = { name: '', email: '', phone: '', password: '', confirmPassword: '', acceptedTerms: false };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9]{8,15}$/;
const normalizedPhone = value => value.replace(/[\s().-]/g, '');

export default function RegistrationProfilePage({ profile = false }) {
  const [values, setValues] = useState(emptyRegistration);
  const [user, setUser] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [loading, setLoading] = useState(profile);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!profile) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setErrors(current => ({ ...current, form: undefined }));
    getProfile(controller.signal).then(setUser).catch(error => {
      if (error.name === 'AbortError') return;
      if (error instanceof ApiError && error.status === 401) {
        navigate(loginPath('/profile'), { replace: true });
        return;
      }
      setErrors({ form: error.message });
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [profile, navigate, reloadKey]);

  function change(field, value) {
    setValues(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined, form: undefined }));
    setMessage('');
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const invalid = {};
    if (values.name.trim().length < 2 || values.name.trim().length > 100) invalid.name = 'Enter your name (2–100 characters).';
    if (!emailPattern.test(values.email.trim())) invalid.email = 'Enter a valid email address.';
    if (values.password.length < 8 || values.password.length > 200) invalid.password = 'Use a password between 8 and 200 characters.';
    if (values.confirmPassword !== values.password) invalid.confirmPassword = 'The passwords do not match.';
    if (values.phone && !phonePattern.test(normalizedPhone(values.phone.trim()))) invalid.phone = 'Enter a valid phone number, or leave it blank.';
    if (!values.acceptedTerms) invalid.acceptedTerms = 'Accept the terms to create an account.';
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setMessage('');
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      await registerCustomer(values);
      setMessage('Your account is ready. Sign in to continue.');
      setValues(emptyRegistration);
    } catch (error) {
      setErrors({ ...fieldErrors(error), form: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitProfile(event) {
    event.preventDefault();
    const invalid = {};
    if (values.name.trim().length < 2 || values.name.trim().length > 100) invalid.name = 'Enter your name (2–100 characters).';
    if (!emailPattern.test(values.email.trim())) invalid.email = 'Enter a valid email address.';
    if (values.phone && !phonePattern.test(normalizedPhone(values.phone.trim()))) invalid.phone = 'Enter a valid phone number, or leave it blank.';
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setMessage('');
      return;
    }
    setBusy(true);
    setErrors({});
    setMessage('');
    try {
      const updated = await updateProfile({ name: values.name, email: values.email, phone: values.phone });
      setUser(updated);
      setValues({ name: updated.name ?? '', email: updated.email ?? '', phone: updated.phone ?? '' });
      setMessage('Your profile has been updated.');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        navigate(loginPath('/profile'), { replace: true });
      } else {
        setErrors({ ...fieldErrors(error), form: error.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await logout();
      setUser(null);
      navigate('/', { replace: true });
    } catch (error) {
      setLogoutError(error.message || 'We could not log you out. Please try again.');
    } finally {
      setLogoutBusy(false);
    }
  }

  useEffect(() => {
    if (profile && user) setValues({ name: user.name ?? '', email: user.email ?? '', phone: user.phone ?? '' });
  }, [profile, user]);

  if (profile && loading) return <main className={styles.state} aria-live="polite"><p>Loading your profile…</p></main>;
  if (profile && errors.form && !user) return <main className={styles.state}><p className={styles.error} role="alert">{errors.form}</p><button type="button" onClick={() => setReloadKey(value => value + 1)}>Try again</button><Link to="/">Return home</Link></main>;

  if (profile) {
    const initials = getInitials(user?.name);
    const roleLabel = user?.role === 'customer' ? 'Customer account' : user?.role === 'admin' ? 'Administrator account' : '';
    return <main className={styles.dashboard}>
      <div className={styles.dashboardInner}>
        <header className={styles.dashboardHeader}>
          <div>
            <p className="eyebrow">Your folio</p>
            <h1 id="account-title">Your account</h1>
            <p className={styles.dashboardIntro}>A quiet place to keep your details close and your orders in view.</p>
          </div>
          <p className={styles.headerSignature}>Books for<br />the curious.</p>
        </header>

        <section className={styles.overview} aria-label="Profile overview">
          <div className={styles.avatar} aria-hidden="true">{initials}</div>
          <div className={styles.overviewDetails}>
            <h2>{user?.name}</h2>
            <p>{user?.email}</p>
          </div>
          {roleLabel && <span className={styles.accountLabel}>{roleLabel}</span>}
          <button className={styles.logoutButton} type="button" onClick={signOut} disabled={logoutBusy}>
            {logoutBusy ? 'Logging out…' : 'Log out'}
          </button>
        </section>
        {logoutError && <p className={styles.logoutError} role="alert">{logoutError}</p>}

        <div className={styles.dashboardGrid}>
          <section className={styles.profilePanel} aria-labelledby="profile-details-title">
            <header className={styles.panelHeading}>
              <div>
                <p className="eyebrow">Personal information</p>
                <h2 id="profile-details-title">Profile details</h2>
              </div>
              <p className={styles.panelNote}>Your details stay connected to your account.</p>
            </header>
            <form className={`${styles.form} ${styles.profileForm}`} onSubmit={submitProfile} noValidate>
              <Field id="vrinda-name" label="Full name" value={values.name} error={errors.name} autoComplete="name" onChange={value => change('name', value)} />
              <Field id="vrinda-email" label="Email address" type="email" value={values.email} error={errors.email} autoComplete="email" onChange={value => change('email', value)} />
              <Field id="vrinda-phone" label="Phone number" type="tel" value={values.phone} error={errors.phone} autoComplete="tel" hint="Optional" onChange={value => change('phone', value)} />
              {errors.form && <p className={styles.error} role="alert">{errors.form}</p>}
              {message && <p className={styles.success} role="status">{message}</p>}
              <button className={styles.submit} type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'} <span aria-hidden="true">↗</span></button>
            </form>
          </section>

          <Link className={styles.ordersCard} to="/orders" aria-labelledby="orders-card-title">
            <span className={styles.ordersIcon} aria-hidden="true">↗</span>
            <p className={`eyebrow ${styles.ordersEyebrow}`}>Your reading life</p>
            <h2 id="orders-card-title">Orders &amp; deliveries</h2>
            <p className={styles.ordersCopy}>See your past orders and follow their journey home.</p>
            <span className={styles.ordersAction}>View your orders <span aria-hidden="true">→</span></span>
          </Link>
        </div>
      </div>
    </main>;
  }

  const submit = profile ? submitProfile : submitRegistration;
  return <main className={styles.page}>
    <section className={styles.card} aria-labelledby="account-title">
      <p className="eyebrow">{profile ? 'Your account' : 'A little more personal'}</p>
      <h1 id="account-title">{profile ? 'Your reading life, in one place.' : 'Make room for more good reads.'}</h1>
      <p className={styles.intro}>{profile ? 'Keep your account details up to date.' : 'Create an account to keep your cart and orders together.'}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field id="vrinda-name" label="Full name" value={values.name} error={errors.name} autoComplete="name" onChange={value => change('name', value)} />
        <Field id="vrinda-email" label="Email address" type="email" value={values.email} error={errors.email} autoComplete="email" onChange={value => change('email', value)} />
        <Field id="vrinda-phone" label="Phone number" type="tel" value={values.phone} error={errors.phone} autoComplete="tel" hint="Optional" onChange={value => change('phone', value)} />
        {!profile && <>
          <Field id="vrinda-password" label="Password" type="password" value={values.password} error={errors.password} autoComplete="new-password" onChange={value => change('password', value)} />
          <Field id="vrinda-confirm-password" label="Confirm password" type="password" value={values.confirmPassword} error={errors.confirmPassword} autoComplete="new-password" onChange={value => change('confirmPassword', value)} />
          <label className={styles.terms}>
            <input type="checkbox" checked={values.acceptedTerms} onChange={event => change('acceptedTerms', event.target.checked)} aria-invalid={Boolean(errors.acceptedTerms)} />
            <span>I agree to the terms and privacy policy.</span>
          </label>
          {errors.acceptedTerms && <p className={styles.fieldError} role="alert">{errors.acceptedTerms}</p>}
        </>}
        {errors.form && <p className={styles.error} role="alert">{errors.form}</p>}
        {message && <p className={styles.success} role="status">{message}</p>}
        <button className={styles.submit} type="submit" disabled={busy}>{busy ? 'Saving…' : profile ? 'Save changes' : 'Create account'} <span aria-hidden="true">↗</span></button>
      </form>
      {profile
        ? <p className={styles.footer}><Link to="/orders">View your orders</Link></p>
        : <p className={styles.footer}>Already have an account? <Link to="/login">Sign in</Link></p>}
    </section>
  </main>;
}

function Field({ id, label, value, error, type = 'text', autoComplete, hint, onChange }) {
  return <div className={styles.field}>
    <label htmlFor={id}>{label}</label>
    <input id={id} name={id} type={type} value={value} autoComplete={autoComplete} onChange={event => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} required={label !== 'Phone number'} />
    {hint && <span className={styles.hint} id={`${id}-hint`}>{hint}</span>}
    {error && <span className={styles.fieldError} id={`${id}-error`} role="alert">{error}</span>}
  </div>;
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => [...part][0]).join('').toLocaleUpperCase();
}
