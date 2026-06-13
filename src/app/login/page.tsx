import { redirect } from "next/navigation";
import { loginAction } from "../../lib/actions";
import { authEnabled } from "../../lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // If auth isn't configured there's nothing to log into.
  if (!authEnabled()) redirect("/");
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form action={loginAction} className="card flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-2 text-lg font-bold">
          <span className="text-emerald-600">🌱</span> Beanstalk
        </div>
        <div>
          <label className="label">Password</label>
          <input
            type="password"
            name="password"
            autoFocus
            required
            autoComplete="current-password"
            className="input"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">Incorrect password.</p>}
        <button className="btn btn-primary">Sign in</button>
      </form>
    </div>
  );
}
