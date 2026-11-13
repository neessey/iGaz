'use client';

export function RetryButton() {
  return (
    <button type="button" className="btn btn-block" onClick={() => window.location.reload()}>
      Réessayer
    </button>
  );
}
