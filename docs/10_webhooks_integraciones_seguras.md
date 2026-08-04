# Webhooks e integraciones externas seguras

- **Etapa:** 04
- **Rama:** `architecture/04-webhook-hardening`
- **Estado:** implementada; pendiente de pipeline y aceptación del propietario

## 1. Frontera de confianza

Telegram y Kapso son entradas públicas. Ningún campo del payload decide la organización, los
permisos ni las herramientas disponibles.

```text
Proveedor externo
  -> autenticación del proveedor
  -> límite estricto del cuerpo
  -> validación Zod del contrato
  -> asociación canal-organización definida en secretos del servidor
  -> rate limit persistente
  -> reclamo idempotente del evento
  -> caso de uso autorizado
  -> respuesta al proveedor
```

Las rutas no consultan la primera organización de la base de datos. La asociación queda definida
por `TELEGRAM_ORGANIZATION_ID` o `KAPSO_ORGANIZATION_ID`, y WhatsApp exige además que
`phone_number_id` coincida con `KAPSO_PHONE_NUMBER_ID`.

## 2. Configuración obligatoria

### Telegram

- `TELEGRAM_BOT_TOKEN`: credencial usada únicamente para responder por el bot.
- `TELEGRAM_WEBHOOK_SECRET`: secreto aleatorio de 16 a 256 caracteres.
- `TELEGRAM_ORGANIZATION_ID`: UUID de la organización asociada al canal.

Al registrar el webhook mediante `setWebhook`, se debe enviar exactamente el mismo valor como
`secret_token`. Telegram lo entrega en `X-Telegram-Bot-Api-Secret-Token`. La ruta rechaza una
solicitud sin ese encabezado antes de leer o interpretar su cuerpo.

Referencia: [Telegram Bot API — setWebhook](https://core.telegram.org/bots/api#setwebhook).

### WhatsApp mediante Kapso

- `KAPSO_API_KEY`: credencial de salida para responder mensajes.
- `KAPSO_WEBHOOK_SECRET`: secreto usado por Kapso para HMAC SHA256.
- `KAPSO_PHONE_NUMBER_ID`: identificador exacto del número o canal autorizado.
- `KAPSO_ORGANIZATION_ID`: UUID de la organización asociada al canal.

El webhook debe ser de tipo `kapso`, suscribirse a `whatsapp.message.received` y configurarse con
el mismo `secret_key`. La firma `X-Webhook-Signature` se calcula sobre el cuerpo JSON crudo y se
compara en tiempo constante. `X-Idempotency-Key` es obligatorio.

Referencias: [Kapso — Webhook security](https://docs.kapso.ai/docs/platform/webhooks/security) y
[Kapso — Webhooks overview](https://docs.kapso.ai/docs/platform/webhooks/overview).

Los secretos se configuran en el gestor del entorno de despliegue. No se agregan a Git, variables
`NEXT_PUBLIC_*`, respuestas HTTP ni logs.

## 3. Controles implementados

- cuerpo máximo: 256 KiB, incluyendo transferencias sin `Content-Length`;
- frecuencia máxima: 60 entregas autenticadas por organización, proveedor y minuto;
- tiempo máximo de ruta: 10 segundos;
- señal de cancelación de IA y llamadas salientes: 8 segundos;
- lote Kapso: máximo 10 eventos;
- texto externo: máximo 4096 caracteres;
- comparación de secretos y HMAC en tiempo constante;
- validación Zod antes de usar campos del proveedor;
- errores HTTP estables sin detalles internos;
- logs limitados a proveedor, código y estado, sin payload, teléfono, mensaje o secreto.

Los contadores viven en PostgreSQL y no en memoria, por lo que varias instancias del servidor
comparten el mismo límite.

## 4. Idempotencia y trazabilidad

`webhook_events` tiene una restricción única por proveedor e identificador externo:

- Telegram usa `update_id`;
- Kapso usa `X-Idempotency-Key`;
- solo se guarda SHA256 del payload, nunca el payload;
- una entrega repetida recibe `200` con resultado `duplicate` y no ejecuta IA ni casos de uso;
- un evento nuevo pasa por `PROCESSING` y termina en `PROCESSED` o `FAILED`.

Un evento `FAILED` no se reprocesa automáticamente. Esta decisión evita duplicar una cita si el
fallo ocurrió después de escribir en la base y antes de responder al proveedor. Su recuperación
requiere revisar el incidente y realizar una operación explícita; nunca se debe borrar el registro
para forzar un replay sin comprobar antes sus efectos.

Las tablas `webhook_events` y `webhook_rate_limits` tienen RLS habilitado y forzado, y no conceden
privilegios a `anon` ni `authenticated`. Solo la conexión privada del servidor las usa.

## 5. Herramientas de IA

Las herramientas ya no dependen de un booleano `isAdmin` suministrado por cada integración. Se
construyen desde una lista explícita de capacidades:

- canales externos: `APPOINTMENTS_WRITE` y `SERVICES_READ`;
- chat web de ADMIN: conjunto administrativo completo;
- chat web de otros miembros: únicamente capacidades públicas actuales.

El modelo externo no recibe siquiera los esquemas de caja, finanzas, inventario, clientes o
administración. El payload tampoco puede solicitar capacidades adicionales.

## 6. Contratos y casos cubiertos en CI

El componente `ai-integrations` descubre pruebas para:

- secreto Telegram válido, inválido o ausente;
- firma Kapso válida y alteración de un byte del cuerpo;
- payload individual, lote, incompleto y demasiado grande;
- evento de un `phone_number_id` diferente;
- reclamo nuevo, evento repetido y fallo de procesamiento;
- herramientas visibles para cliente externo y administrador.

La migración activa además `database`: CI reconstruye PostgreSQL desde cero y pgTAP comprueba RLS,
`FORCE ROW LEVEL SECURITY` y ausencia de privilegios para las dos tablas internas.

## 7. Puesta en servicio

1. Aplicar la migración por el pipeline habitual.
2. Crear secretos distintos para desarrollo y producción.
3. Configurar las cuatro variables del proveedor correspondiente y verificar que el UUID exista.
4. Registrar el webhook HTTPS con el secreto y solo los eventos necesarios.
5. Enviar el payload de prueba del proveedor y confirmar `result: processed`.
6. Reenviar exactamente el mismo evento y confirmar `result: duplicate` sin una cita adicional.
7. Probar un secreto o firma incorrectos y confirmar `401 INVALID_SIGNATURE`.
8. Confirmar que no aparecen mensajes, teléfonos, tokens ni payloads completos en los logs.

Rotar un secreto exige actualizar primero el gestor del despliegue y luego volver a registrar el
webhook. Durante esta etapa no existe una ventana con dos secretos válidos simultáneamente.
