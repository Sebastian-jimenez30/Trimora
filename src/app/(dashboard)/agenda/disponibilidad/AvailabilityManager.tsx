"use client";

import { useMemo, useState, useTransition } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { toast } from "react-hot-toast";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  replaceStaffServices,
  replaceWeeklyAvailability,
  saveBookingPolicy,
} from "@/modules/public-booking/server/availability-actions";

type Policy = {
  timeZone: string;
  minimumNoticeMinutes: number;
  maximumAdvanceDays: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
};

type Staff = { id: string; name: string; role: string };
type Service = { id: string; name: string; isActive: boolean };
type Window = {
  id: string;
  staffId: string | null;
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
};
type Assignment = { staffId: string; serviceId: string };
type Block = {
  id: string;
  staffId: string | null;
  kind: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
};

type Props = {
  policy: Policy;
  staff: Staff[];
  services: Service[];
  windows: Window[];
  assignments: Assignment[];
  blocks: Block[];
};

const DAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
] as const;

function minuteToTime(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function scheduleForScope(windows: Window[], scope: string) {
  const staffId = scope === "organization" ? null : scope;
  return Object.fromEntries(
    DAYS.map((day) => {
      const window = windows.find(
        (candidate) => candidate.staffId === staffId && candidate.dayOfWeek === day.value,
      );
      return [
        day.value,
        window
          ? {
              enabled: true,
              start: minuteToTime(window.startMinute),
              end: minuteToTime(window.endMinute),
            }
          : { enabled: false, start: "09:00", end: "18:00" },
      ];
    }),
  ) as Record<number, { enabled: boolean; start: string; end: string }>;
}

const cardClass = "rounded-2xl border border-white/10 bg-midnight/90 p-5 md:p-6 shadow-xl";
const inputClass =
  "w-full rounded-xl border border-white/10 bg-pitch px-3 py-2 text-white outline-none focus:border-cognac disabled:opacity-50";

export default function AvailabilityManager({
  policy: initialPolicy,
  staff,
  services,
  windows,
  assignments,
  blocks,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [policy, setPolicy] = useState(initialPolicy);
  const [scope, setScope] = useState("organization");
  const [schedule, setSchedule] = useState(() => scheduleForScope(windows, "organization"));
  const [selectedStaff, setSelectedStaff] = useState(staff[0]?.id ?? "");
  const [selectedServices, setSelectedServices] = useState<string[]>(
    assignments.filter((item) => item.staffId === staff[0]?.id).map((item) => item.serviceId),
  );

  const staffNames = useMemo(
    () => new Map(staff.map((professional) => [professional.id, professional.name])),
    [staff],
  );

  const run = (operation: () => Promise<{ success: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await operation();
      if (result.success) toast.success(success);
      else toast.error(result.error ?? "No fue posible guardar los cambios");
    });
  };

  const changeScope = (value: string) => {
    setScope(value);
    setSchedule(scheduleForScope(windows, value));
  };

  const changeSelectedStaff = (staffId: string) => {
    setSelectedStaff(staffId);
    setSelectedServices(
      assignments.filter((item) => item.staffId === staffId).map((item) => item.serviceId),
    );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section className={cardClass}>
        <h2 className="text-xl font-serif text-white">Política de reservas</h2>
        <p className="mt-1 text-sm text-charcoal">
          Reglas generales usadas para calcular espacios.
        </p>
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => saveBookingPolicy(policy), "Política actualizada");
          }}
        >
          <label className="text-sm text-sterling sm:col-span-2">
            Zona horaria
            <input
              value={policy.timeZone}
              onChange={(event) => setPolicy({ ...policy, timeZone: event.target.value })}
              className={`${inputClass} mt-1`}
              required
            />
          </label>
          {[
            ["minimumNoticeMinutes", "Anticipación mínima (min)", 0],
            ["maximumAdvanceDays", "Horizonte máximo (días)", 1],
            ["slotIntervalMinutes", "Intervalo entre opciones (min)", 5],
            ["bufferMinutes", "Margen entre citas (min)", 0],
          ].map(([key, label, min]) => (
            <label key={key} className="text-sm text-sterling">
              {label}
              <input
                type="number"
                min={min}
                value={policy[key as keyof Policy]}
                onChange={(event) => setPolicy({ ...policy, [key]: Number(event.target.value) })}
                className={`${inputClass} mt-1`}
                required
              />
            </label>
          ))}
          <button
            disabled={isPending}
            className="sm:col-span-2 rounded-full bg-cognac px-5 py-2.5 font-medium text-white disabled:opacity-50"
          >
            Guardar política
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-serif text-white">Horario semanal</h2>
        <p className="mt-1 text-sm text-charcoal">
          El horario profesional, cuando existe, se cruza con el horario general.
        </p>
        <label className="mt-5 block text-sm text-sterling">
          Configurar
          <select
            value={scope}
            onChange={(event) => changeScope(event.target.value)}
            className={`${inputClass} mt-1`}
          >
            <option value="organization">Horario general de la barbería</option>
            {staff.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-4 space-y-2">
          {DAYS.map((day) => {
            const row = schedule[day.value];
            return (
              <div key={day.value} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2">
                <label className="flex items-center gap-2 text-sm text-sterling">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(event) =>
                      setSchedule({
                        ...schedule,
                        [day.value]: { ...row, enabled: event.target.checked },
                      })
                    }
                  />
                  {day.label}
                </label>
                <input
                  aria-label={`Inicio ${day.label}`}
                  type="time"
                  value={row.start}
                  disabled={!row.enabled}
                  onChange={(event) =>
                    setSchedule({ ...schedule, [day.value]: { ...row, start: event.target.value } })
                  }
                  className={inputClass}
                />
                <input
                  aria-label={`Fin ${day.label}`}
                  type="time"
                  value={row.end}
                  disabled={!row.enabled}
                  onChange={(event) =>
                    setSchedule({ ...schedule, [day.value]: { ...row, end: event.target.value } })
                  }
                  className={inputClass}
                />
              </div>
            );
          })}
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(
              () =>
                replaceWeeklyAvailability({
                  staffId: scope === "organization" ? null : scope,
                  windows: DAYS.filter((day) => schedule[day.value].enabled).map((day) => ({
                    dayOfWeek: day.value,
                    startMinute: timeToMinute(schedule[day.value].start),
                    endMinute: timeToMinute(schedule[day.value].end),
                  })),
                }),
              "Horario actualizado",
            )
          }
          className="mt-5 w-full rounded-full bg-cognac px-5 py-2.5 font-medium text-white disabled:opacity-50"
        >
          Guardar horario
        </button>
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-serif text-white">Servicios por profesional</h2>
        <p className="mt-1 text-sm text-charcoal">
          Sólo se ofrecerán espacios de profesionales asignados al servicio solicitado.
        </p>
        {staff.length === 0 ? (
          <p className="mt-5 text-sm text-charcoal">Agrega primero un miembro al equipo.</p>
        ) : (
          <>
            <select
              value={selectedStaff}
              onChange={(event) => changeSelectedStaff(event.target.value)}
              className={`${inputClass} mt-5`}
            >
              {staff.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {services.map((service) => (
                <label
                  key={service.id}
                  className="flex items-center gap-2 rounded-xl bg-white/5 p-3 text-sm text-sterling"
                >
                  <input
                    type="checkbox"
                    checked={selectedServices.includes(service.id)}
                    onChange={(event) =>
                      setSelectedServices((current) =>
                        event.target.checked
                          ? [...current, service.id]
                          : current.filter((id) => id !== service.id),
                      )
                    }
                  />
                  <span>{service.name}</span>
                  {!service.isActive && <span className="text-xs text-charcoal">Inactivo</span>}
                </label>
              ))}
            </div>
            <button
              type="button"
              disabled={isPending || !selectedStaff}
              onClick={() =>
                run(
                  () =>
                    replaceStaffServices({ staffId: selectedStaff, serviceIds: selectedServices }),
                  "Servicios actualizados",
                )
              }
              className="mt-5 w-full rounded-full bg-cognac px-5 py-2.5 font-medium text-white disabled:opacity-50"
            >
              Guardar asignaciones
            </button>
          </>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-xl font-serif text-white">Cierres, descansos y ausencias</h2>
        <form
          className="mt-5 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const startsAt = fromZonedTime(String(form.get("startsAt")), policy.timeZone);
            const endsAt = fromZonedTime(String(form.get("endsAt")), policy.timeZone);
            run(
              () =>
                createAvailabilityBlock({
                  staffId: form.get("staffId") || null,
                  kind: form.get("kind"),
                  startsAt: startsAt.toISOString(),
                  endsAt: endsAt.toISOString(),
                  notes: String(form.get("notes") || "").trim() || null,
                }),
              "Bloqueo agregado",
            );
          }}
        >
          <label className="text-sm text-sterling">
            Alcance
            <select name="staffId" className={`${inputClass} mt-1`}>
              <option value="">Toda la barbería</option>
              {staff.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-sterling">
            Tipo
            <select name="kind" className={`${inputClass} mt-1`}>
              <option value="CLOSED">Cierre</option>
              <option value="BREAK">Descanso</option>
              <option value="ABSENCE">Ausencia</option>
            </select>
          </label>
          <label className="text-sm text-sterling">
            Desde
            <input
              name="startsAt"
              type="datetime-local"
              className={`${inputClass} mt-1`}
              required
            />
          </label>
          <label className="text-sm text-sterling">
            Hasta
            <input name="endsAt" type="datetime-local" className={`${inputClass} mt-1`} required />
          </label>
          <label className="text-sm text-sterling sm:col-span-2">
            Nota opcional
            <input name="notes" maxLength={500} className={`${inputClass} mt-1`} />
          </label>
          <button
            disabled={isPending}
            className="sm:col-span-2 rounded-full bg-cognac px-5 py-2.5 font-medium text-white disabled:opacity-50"
          >
            Agregar bloqueo
          </button>
        </form>

        <div className="mt-5 space-y-2">
          {blocks.length === 0 && (
            <p className="text-sm text-charcoal">No hay bloqueos próximos.</p>
          )}
          {blocks.map((block) => (
            <div
              key={block.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-white/5 p-3"
            >
              <div className="min-w-0 text-sm">
                <p className="font-medium text-white">
                  {block.kind} ·{" "}
                  {block.staffId ? staffNames.get(block.staffId) : "Toda la barbería"}
                </p>
                <p className="text-charcoal">
                  {formatInTimeZone(block.startsAt, policy.timeZone, "dd/MM/yyyy h:mm a")} –{" "}
                  {formatInTimeZone(block.endsAt, policy.timeZone, "dd/MM/yyyy h:mm a")}
                </p>
                {block.notes && <p className="truncate text-sterling">{block.notes}</p>}
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => deleteAvailabilityBlock(block.id), "Bloqueo eliminado")}
                className="shrink-0 rounded-lg px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
