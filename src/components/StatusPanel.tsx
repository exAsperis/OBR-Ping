export function StatusPanel({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="centered"><section className="panel status-panel"><img src="/icon.svg" alt="" /><span className="eyebrow">OBR Ping</span><h1>{title}</h1><p>{message}</p>{onRetry && <button className="primary-button" onClick={onRetry}>Try again</button>}</section></main>;
}
