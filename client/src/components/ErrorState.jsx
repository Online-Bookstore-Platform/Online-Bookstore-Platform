/** A failed request: what happened, and a way to try again. */
export default function ErrorState({ title = 'We could not load this page', message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <h2 className="state__title">{title}</h2>
      {message && <p className="state__text">{message}</p>}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
