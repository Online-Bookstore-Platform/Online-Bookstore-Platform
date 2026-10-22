import { Link } from 'react-router-dom';

export default function Button({ to, children, variant = 'primary', className = '' }) {
  const classes = `button button-${variant} ${className}`.trim();
  return to ? <Link className={classes} to={to}>{children}</Link> : <button className={classes} type="button">{children}</button>;
}
