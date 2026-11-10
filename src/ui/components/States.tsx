export function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <div className="sk sk-row" />
      <div className="sk sk-row" />
      <div className="sk sk-row" />
    </div>
  );
}

export function PageSkeleton() {
  return (
    <main className="screen" aria-busy="true" aria-label="Loading FLOR Connect">
      <div className="sk sk-title" />
      <div className="sk sk-block" />
      <div className="sk sk-block" />
    </main>
  );
}

export function MessageState({
  title,
  message,
  action,
  onAction,
}: {
  title: string;
  message: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="state">
      <h2>{title}</h2>
      <p>{message}</p>
      {action && onAction ? (
        <button type="button" className="btn-primary" onClick={onAction}>
          {action}
        </button>
      ) : null}
    </div>
  );
}
