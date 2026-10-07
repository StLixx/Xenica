import { useHealth } from '../api/queries';

export function StatusBar() {
  const health = useHealth();
  const ok = health.isSuccess;
  return (
    <footer className="flex h-6 items-center gap-3 border-t border-line bg-side px-3 text-meta text-fg-3">
      <span className="flex items-center gap-1.5" data-testid="connection">
        <span className={`size-1.5 rounded-full ${ok ? 'bg-accent' : 'bg-danger'}`} />
        {health.isPending
          ? '连接中…'
          : ok
            ? `已连接 · v${health.data.version}${health.data.commit ? ` · ${health.data.commit.slice(0, 7)}` : ''}`
            : '后端不可用'}
      </span>
    </footer>
  );
}
