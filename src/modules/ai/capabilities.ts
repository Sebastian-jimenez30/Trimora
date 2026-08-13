export const AI_CAPABILITIES = [
  "APPOINTMENTS_WRITE",
  "SERVICES_READ",
  "AGENDA_READ",
  "FINANCE_READ",
  "FINANCE_WRITE",
  "INVENTORY_READ",
  "INVENTORY_WRITE",
  "CLIENTS_READ",
] as const;

export type AiCapability = (typeof AI_CAPABILITIES)[number];

export const CUSTOMER_AI_CAPABILITIES = [
  "APPOINTMENTS_WRITE",
  "SERVICES_READ",
] as const satisfies readonly AiCapability[];

export const ADMIN_AI_CAPABILITIES = AI_CAPABILITIES;

export const AI_TOOL_CAPABILITY_BY_NAME = {
  agendar_cita: "APPOINTMENTS_WRITE",
  listar_servicios: "SERVICES_READ",
  consultar_agenda_hoy: "AGENDA_READ",
  consultar_finanzas_hoy: "FINANCE_READ",
  registrar_transaccion_caja: "FINANCE_WRITE",
  registrar_venta_producto: "FINANCE_WRITE",
  crear_producto: "INVENTORY_WRITE",
  crear_servicio: "INVENTORY_WRITE",
  consultar_productos: "INVENTORY_READ",
  consultar_clientes: "CLIENTS_READ",
  consultar_transacciones: "FINANCE_READ",
  consultar_citas: "AGENDA_READ",
} as const satisfies Record<string, AiCapability>;

export function hasAiCapability(capabilities: readonly AiCapability[], required: AiCapability) {
  return capabilities.includes(required);
}

export function getAllowedAiToolNames(capabilities: readonly AiCapability[]) {
  return Object.entries(AI_TOOL_CAPABILITY_BY_NAME)
    .filter(([, required]) => hasAiCapability(capabilities, required))
    .map(([toolName]) => toolName);
}
