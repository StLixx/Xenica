import { useState, type FormEvent } from 'react';

import { Button, TextInput } from '../ui';

export interface SignInValues {
  code: string;
  name: string;
  password: string;
}

/** 登录页 / 首次设置页。只管样子和表单，提交交给调用方。 */
export function SignIn({
  mode,
  demo = false,
  pending = false,
  error,
  onSubmit,
}: {
  mode: 'login' | 'setup';
  /** 预览站：提示示例账号。 */
  demo?: boolean;
  pending?: boolean;
  error?: string;
  onSubmit: (values: SignInValues) => void;
}) {
  const setup = mode === 'setup';
  const [values, setValues] = useState<SignInValues>({ code: '', name: '', password: '' });
  const field = (k: keyof SignInValues) => ({
    value: values[k],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [k]: e.target.value }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <main className="grid h-full place-items-center bg-bg p-6">
      <form
        onSubmit={submit}
        aria-label={setup ? '创建账号' : '登录'}
        className="flex w-80 max-w-full flex-col gap-3 rounded-lg bg-raised p-6 shadow-pop"
      >
        <h1 className="text-lg font-semibold text-fg">{setup ? '创建账号' : '登录 Xenica'}</h1>
        {setup && (
          <p className="text-sm text-fg-3">还没有账号。设置码打印在服务日志里，只能用一次。</p>
        )}
        {setup && (
          <TextInput
            aria-label="设置码"
            placeholder="设置码"
            autoComplete="one-time-code"
            required
            {...field('code')}
          />
        )}
        <TextInput
          aria-label="用户名"
          placeholder="用户名"
          autoComplete="username"
          autoFocus={!setup}
          required
          {...field('name')}
        />
        <TextInput
          aria-label="密码"
          placeholder={setup ? '密码（至少 8 位）' : '密码'}
          type="password"
          autoComplete={setup ? 'new-password' : 'current-password'}
          required
          {...field('password')}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={pending} className="justify-center">
          {pending ? '请稍候…' : setup ? '创建并登录' : '登录'}
        </Button>
        {demo && !setup && <p className="text-sm text-fg-3">预览站示例账号：demo / demo</p>}
      </form>
    </main>
  );
}
