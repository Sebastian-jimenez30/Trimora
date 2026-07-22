# Reporte de Auditoría de Seguridad: Trimora (OWASP Top 10)

Se ha realizado una auditoría estática (SAST) sobre el código fuente de Trimora y una evaluación arquitectónica basada en los estándares del **OWASP Top 10 (2021)**. A continuación, se detallan los hallazgos componente por componente, junto con sus respectivas recomendaciones de parcheo.

---

## 1. Módulo: Login y Autenticación (Auth)
**Hallazgo Crítico:** Falta de Middleware Global para Refresco de Tokens (A07:2021 - Identification and Authentication Failures).

*   **Descripción:** Trimora protege el dashboard validando el usuario en el Server Component (`src/app/(dashboard)/layout.tsx`) mediante `await supabase.auth.getUser()`. Si bien esto detiene la renderización a nivel de componente, el sistema actual carece de un archivo `middleware.ts` en la raíz. Según el estándar de `@supabase/ssr`, el middleware es obligatorio para refrescar de manera pasiva el token JWT (refresh token) y evitar que la sesión del usuario expire abruptamente en la mitad de una operación de caja.
*   **Recomendación de Parcheo:** 
    *   Crear el archivo `middleware.ts` en la raíz del proyecto para interceptar todas las peticiones a `/(dashboard)` e implementar `updateSession` usando `@supabase/ssr`.

---

## 2. Módulo: Punto de Venta (Caja / POS)
**Hallazgo Crítico:** Ausencia de validación de montos negativos y desbordamiento de pagos (A04:2021 - Insecure Design).

*   **Descripción:** En el archivo `src/modules/pos/actions.ts`, la función `registerPayment` que maneja los abonos a créditos ("fiados") ejecuta lo siguiente:
    ```typescript
    const newPaidAmount = parseFloat(tx.paidAmount) + amount;
    ```
    El sistema no valida lógicamente desde el backend si `amount` es un número negativo. Un usuario malintencionado podría enviar un `amount` negativo desde la interfaz (interceptando la petición) para extraer dinero del abono, manipulando artificialmente el flujo de caja. Tampoco se valida estrictamente que `newPaidAmount` no supere a `totalAmount`, lo cual podría romper los resúmenes financieros si se paga de más.
*   **Recomendación de Parcheo:** 
    *   Implementar validación estricta al inicio de la función: `if (amount <= 0) throw new Error("El monto a abonar debe ser mayor a 0")`.
    *   Validar el techo de deuda: `if (newPaidAmount > totalAmount) throw new Error("El abono supera la deuda restante")`.

---

## 3. Módulo: Inventario y Catálogo
**Hallazgo Crítico:** Validación de Datos Inexistente en la Importación Masiva (A08:2021 - Software and Data Integrity Failures / A03:2021 - Injection).

*   **Descripción:** En `src/modules/inventory/actions.ts`, la función `batchImportProducts(items: any[])` confía ciegamente en el payload JSON que envía el cliente desde la lectura del archivo o foto. No hay validación de esquema en el backend. Un atacante o un error en el archivo podría enviar categorías inválidas, nombres inyectados con scripts (XSS potencial si luego se renderiza con `dangerouslySetInnerHTML`) o precios nulos (Nulls).
*   **Recomendación de Parcheo:** 
    *   Adoptar la librería `Zod` (la cual ya está en el `package.json`).
    *   Definir un esquema: `const ProductImportSchema = z.object({ name: z.string().min(1), category: z.enum(["VENTA", "CONSUMO"]), ... })`.
    *   Parsear la data recibida antes de ejecutar el `db.insert`.

---

## 4. Módulo: Agenda y Citas
**Hallazgo Moderado:** Prevención de colisiones en diseño (A04:2021 - Insecure Design).

*   **Descripción:** En `createAppointment`, el sistema valida que no se agenden citas en el pasado, pero no incluye un candado o transacción pesimista (pessimistic lock) que verifique si el Barbero (colaborador) ya tiene una cita ocupando ese mismo bloque exacto de tiempo (`startTime` a `endTime`). Esto permite "Overbooking" malintencionado.
*   **Recomendación de Parcheo:** 
    *   Antes del `db.insert`, ejecutar una consulta cruzada verificando colisiones: `select donde staffId = X y no se solapen startTime y endTime`.

---

## Conclusión General
El nivel de seguridad base gracias al uso de **Drizzle ORM** (que parametriza todo previniendo inyección SQL - A03:2021) y el ecosistema **Server Actions** de Next.js es alto. Sin embargo, Trimora requiere blindar urgemente las validaciones de **lógica de negocio (Insecure Design)** en el backend, recordando la regla de oro de ciberseguridad: *"Jamás confiar en los datos que provienen del cliente"*.
