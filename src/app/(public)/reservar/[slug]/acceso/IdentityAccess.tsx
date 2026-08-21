"use client";

import { useState, type FormEvent } from "react";

type Props = Readonly<{ slug: string; organizationName: string; phoneOtpEnabled: boolean }>;
type Channel = "EMAIL" | "PHONE";

export default function IdentityAccess({ slug, organizationName, phoneOtpEnabled }: Props) {
  const [channel, setChannel] = useState<Channel>("EMAIL");
  const [contact, setContact] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const channels: readonly Channel[] = phoneOtpEnabled ? ["EMAIL", "PHONE"] : ["EMAIL"];

  async function requestCode(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/organizations/${slug}/identity/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, contact }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "No fue posible continuar");
      setChallengeId(body.data.challengeId);
      setMessage(body.data.message);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "No fue posible continuar");
    } finally {
      setPending(false);
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    if (!challengeId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/organizations/${slug}/identity/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, channel, contact, name, token }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Código inválido o vencido");
      setAuthenticated(true);
      setMessage(`Identidad verificada para ${body.data.customer.displayName}.`);
    } catch (verificationError) {
      setError(
        verificationError instanceof Error
          ? verificationError.message
          : "Código inválido o vencido",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#111] px-4 py-12 text-white">
      <section className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-[#191919] p-6 shadow-2xl sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#d8a06f]">Trimora</p>
        <h1 className="mt-3 text-3xl font-semibold">Acceso de clientes</h1>
        <p className="mt-2 text-sm leading-6 text-[#c7c7c7]">
          Verifica tus datos para gestionar tus próximas citas en {organizationName}. No necesitas
          crear una contraseña.
        </p>

        {authenticated ? (
          <div
            className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"
            role="status"
          >
            <h2 className="font-semibold text-emerald-200">Verificación completada</h2>
            <p className="mt-2 text-sm text-emerald-100">{message}</p>
          </div>
        ) : challengeId ? (
          <form className="mt-8 space-y-5" onSubmit={verifyCode}>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="customer-name">
                Nombre completo
              </label>
              <input
                id="customer-name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-[#d8a06f]"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="identity-token">
                Código de verificación
              </label>
              <input
                id="identity-token"
                required
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                maxLength={8}
                value={token}
                onChange={(event) => setToken(event.target.value.replace(/\D/gu, ""))}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.35em] outline-none focus:border-[#d8a06f]"
                autoComplete="one-time-code"
              />
            </div>
            {message && (
              <p className="text-sm text-[#c7c7c7]" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={pending}
              className="w-full rounded-xl bg-[#a85d2a] px-4 py-3 font-semibold text-white transition hover:bg-[#bd6c35] disabled:cursor-wait disabled:opacity-60"
              type="submit"
            >
              {pending ? "Verificando…" : "Verificar código"}
            </button>
            <button
              className="w-full text-sm text-[#d8a06f] underline-offset-4 hover:underline"
              type="button"
              onClick={() => {
                setChallengeId(null);
                setToken("");
                setError(null);
              }}
            >
              Usar otro contacto
            </button>
          </form>
        ) : (
          <form className="mt-8 space-y-5" onSubmit={requestCode}>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">¿Cómo quieres verificarte?</legend>
              <div className="grid grid-cols-2 gap-2">
                {channels.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={channel === value}
                    onClick={() => {
                      setChannel(value);
                      setContact("");
                      setError(null);
                    }}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium ${channel === value ? "border-[#d8a06f] bg-[#d8a06f]/15 text-white" : "border-white/10 text-[#b7b7b7]"}`}
                  >
                    {value === "EMAIL" ? "Correo" : "Teléfono"}
                  </button>
                ))}
              </div>
            </fieldset>
            {!phoneOtpEnabled && (
              <p className="text-xs text-[#9f9f9f]">
                La verificación por teléfono se habilitará cuando la barbería tenga un proveedor SMS
                configurado.
              </p>
            )}
            <div>
              <label className="mb-2 block text-sm font-medium" htmlFor="identity-contact">
                {channel === "EMAIL" ? "Correo electrónico" : "Número de teléfono"}
              </label>
              <input
                id="identity-contact"
                required
                type={channel === "EMAIL" ? "email" : "tel"}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={channel === "EMAIL" ? "tu@correo.com" : "+57 300 000 0000"}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 outline-none focus:border-[#d8a06f]"
                autoComplete={channel === "EMAIL" ? "email" : "tel"}
              />
            </div>
            {error && (
              <p className="text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
            <button
              disabled={pending}
              className="w-full rounded-xl bg-[#a85d2a] px-4 py-3 font-semibold text-white transition hover:bg-[#bd6c35] disabled:cursor-wait disabled:opacity-60"
              type="submit"
            >
              {pending ? "Enviando…" : "Enviar código"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
