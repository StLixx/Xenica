import type { ReactNode } from 'react';

import { useLogin, useSession, useSetup } from '../api/queries';
import { Shell } from '../shell/Shell';
import { EmptyState } from '../ui';
import { SignIn } from './SignIn';

/** 没登录只显示登录页；库里还没有账号时显示「创建账号」。登录后显示 `children`（默认工作台）。 */
export function Gate({ children }: { children?: ReactNode }) {
  const session = useSession();
  const login = useLogin();
  const setup = useSetup();

  if (session.isPending) return <EmptyState tone="loading" title="连接中…" />;
  if (session.isError)
    return <EmptyState tone="error" title="后端不可用" hint={session.error.message} />;
  if (session.data.user) return children ?? <Shell />;

  const mode = session.data.setup_required ? 'setup' : 'login';
  const action = mode === 'setup' ? setup : login;
  return (
    <SignIn
      mode={mode}
      demo={session.data.demo}
      pending={action.isPending}
      error={action.error?.message}
      onSubmit={(v) => (mode === 'setup' ? setup.mutate(v) : login.mutate(v))}
    />
  );
}
