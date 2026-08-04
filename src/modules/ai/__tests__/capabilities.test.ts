import { describe, expect, it } from "vitest";
import {
  ADMIN_AI_CAPABILITIES,
  CUSTOMER_AI_CAPABILITIES,
  getAllowedAiToolNames,
} from "../capabilities";

describe("AI tool capabilities", () => {
  it("un canal externo solo recibe herramientas publicas", () => {
    expect(getAllowedAiToolNames(CUSTOMER_AI_CAPABILITIES).sort()).toEqual([
      "agendar_cita",
      "listar_servicios",
    ]);
  });

  it("las herramientas administrativas requieren capacidades explicitas", () => {
    const toolNames = getAllowedAiToolNames(ADMIN_AI_CAPABILITIES);
    expect(toolNames).toContain("consultar_finanzas_hoy");
    expect(toolNames).toContain("registrar_transaccion_caja");
    expect(toolNames).toContain("crear_producto");
  });
});
