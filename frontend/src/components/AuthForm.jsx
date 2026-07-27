import { FaGoogle } from "react-icons/fa";

/**
 * Shared layout for the login and register screens.
 *
 * Both pages are the same card with a different set of fields, so the shell,
 * the Google button, the error banner and the busy states live here and each
 * page supplies only what differs.
 */
function AuthForm({
  title,
  subtitle,
  fields,
  submitLabel,
  onSubmit,
  onGoogle,
  error,
  busy,
  footer,
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0d0f14] px-4">
      <div className="w-full max-w-[380px] bg-[#13151c] border border-white/[0.08] rounded-2xl p-7 flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[19px] font-semibold text-slate-100 tracking-tight">{title}</h1>
          <p className="text-[13px] text-slate-500">{subtitle}</p>
        </div>

        {error && (
          // role=alert so screen readers announce the failure instead of it
          // silently appearing for sighted users only.
          <div
            role="alert"
            className="text-[13px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
          >
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          {fields.map((field) => (
            <label key={field.name} className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-slate-400">{field.label}</span>
              <input
                name={field.name}
                type={field.type}
                value={field.value}
                onChange={field.onChange}
                autoComplete={field.autoComplete}
                placeholder={field.placeholder}
                required
                disabled={busy}
                className="w-full bg-[#0d0f14] border border-white/[0.08] rounded-xl px-3.5 py-[11px] text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20 transition disabled:opacity-50"
              />
              {field.hint && <span className="text-[11px] text-slate-600">{field.hint}</span>}
            </label>
          ))}

          <button
            type="submit"
            disabled={busy}
            className="w-full mt-1 py-[11px] rounded-xl text-sm font-medium text-white bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 border border-cyan-500/30 shadow-lg shadow-cyan-500/20 transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy ? "Please wait…" : submitLabel}
          </button>
        </form>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-white/[0.08]" />
          <span className="text-[11px] text-slate-600">or</span>
          <span className="h-px flex-1 bg-white/[0.08]" />
        </div>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 py-[11px] rounded-xl text-sm font-medium text-slate-200 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] transition-all duration-150 cursor-pointer disabled:opacity-60"
        >
          <FaGoogle size={14} />
          Continue with Google
        </button>

        <p className="text-[13px] text-slate-500 text-center">{footer}</p>
      </div>
    </div>
  );
}

export default AuthForm;
