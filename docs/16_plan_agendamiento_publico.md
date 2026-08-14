# Plan rector de agendamiento público y autoservicio del cliente

**Estado:** Activo  
**Proyecto:** Trimora  
**Fecha de adopción:** 2026-08-13  
**Propósito:** Incorporar reservas públicas, autoservicio y chat para clientes finales mediante
entregas pequeñas, compatibles hacia atrás y verificables en producción.

## Estado de ejecución

| Etapa                  | Estado       | Evidencia operativa                                                        |
| ---------------------- | ------------ | -------------------------------------------------------------------------- |
| 00 — Plan rector       | Integrada    | Documento aprobado e incorporado a `main`.                                 |
| 01 — Fundación pública | Integrada    | Esquema aplicado con `supabase db push`; capacidades públicas apagadas.    |
| 02 — Disponibilidad    | Implementada | Migración aplicada; pendiente CI, PR y validación funcional en producción. |
| 03 a 09                | Pendientes   | No se iniciarán antes de validar la etapa anterior en producción.          |

## 1. Objetivo

Trimora incorporará una experiencia pública independiente del dashboard administrativo para que
los clientes finales puedan:

- consultar información pública de una barbería;
- conocer sus servicios y productos disponibles para venta;
- consultar espacios libres sin ver datos de otras personas;
- reservar una cita sin crear una contraseña;
- verificar su correo o teléfono mediante OTP o enlace de un solo uso;
- consultar, reprogramar y cancelar únicamente sus propias citas;
- solicitar confirmaciones y recordatorios por correo;
- usar un chat con capacidades públicas explícitamente limitadas.

La agenda, Caja, Clientes, Inventario, Servicios, Analítica y los canales internos existentes deben
continuar funcionando durante todas las etapas.

Este documento es la fuente de verdad del programa. Antes de cambiar alcance, orden, seguridad o
criterios de salida se actualizará primero este archivo y se explicará la decisión en el PR.

## 2. Contexto y supuestos

Se parte de estas condiciones:

- Trimora continúa como monolito modular de Next.js desplegado en Vercel;
- PostgreSQL/Supabase continúa como sistema de registro;
- Drizzle continúa siendo la capa de acceso a datos del servidor;
- Supabase Auth continúa resolviendo identidad, pero los clientes finales no serán miembros de una
  organización ni verán el dashboard;
- el volumen inicial esperado es bajo o medio y no justifica microservicios ni una cola externa;
- la operación debe soportar varias organizaciones sin compartir catálogo, disponibilidad o datos
  personales;
- las fechas se almacenan como `timestamptz` y se presentan en la zona horaria configurada por la
  organización;
- correo será el canal inicial de recordatorios; teléfono requiere un proveedor OTP configurado y
  probado antes de habilitarse;
- todas las migraciones serán aditivas y compatibles con la versión administrativa anterior.

Se reconsiderará la arquitectura si el tráfico público, la entrega de notificaciones o la demanda
de tiempo real requieren escalado independiente. Hasta entonces se evita introducir
microservicios, CQRS o event sourcing.

## 3. Decisiones arquitectónicas

### 3.1 Experiencia pública separada

La ruta recomendada es:

```text
/reservar/{organizationSlug}
```

Vivirá en un grupo de rutas público y no heredará el layout, navegación, datos ni comprobaciones
visuales del dashboard.

```text
src/app/(public)/reservar/[slug]/
```

Se reutilizarán reglas puras de fechas, duración y solapamiento. No se reutilizará el componente
administrativo completo porque contiene conceptos y DTOs que no deben cruzar la frontera pública.

### 3.2 Identidad sin contraseña, pero verificada

Escribir un correo o teléfono no demuestra propiedad. Mostrar citas inmediatamente produciría una
vulnerabilidad de acceso directo a objetos: cualquiera que conozca el contacto podría consultar o
cancelar citas ajenas.

La experiencia no tendrá registro ni contraseña, pero sí una verificación invisible para el modelo
administrativo:

1. el cliente escribe correo o teléfono;
2. el servidor responde siempre con un mensaje neutral;
3. Supabase envía OTP o enlace de un solo uso;
4. al verificarlo se crea una sesión de cliente;
5. `requireCustomerActor()` resuelve en servidor la organización y el cliente vinculados;
6. la sesión nunca concede membresía ni acceso administrativo.

No se modificará `requireActor()`: continuará siendo exclusivo de miembros de una organización.

### 3.3 Creación y reutilización de clientes

`clients` continúa siendo el registro comercial. Una identidad pública verificada se relacionará
con un cliente de una organización concreta.

- Se normalizan correo y teléfono antes de comparar.
- La búsqueda siempre incluye `organization_id`.
- Si no existe coincidencia, se crea un cliente.
- Si existe una coincidencia inequívoca, se reutiliza.
- El nombre suministrado públicamente no sobrescribe silenciosamente datos administrativos.
- Si correo y teléfono apuntan a clientes diferentes no se fusionan; el conflicto queda bloqueado
  para revisión administrativa.
- Un mismo usuario de Auth puede estar relacionado con clientes distintos en organizaciones
  distintas, sin mezclar sus citas.

### 3.4 Cancelar en lugar de borrar

La acción pública presentada como “Eliminar cita” cambiará el estado a `CANCELLED`. No ejecutará
un borrado físico. Esto conserva trazabilidad, métricas, auditoría y evidencia ante reclamaciones.

### 3.5 Disponibilidad calculada en servidor

El navegador recibe únicamente espacios libres. No recibe citas ocupadas para después filtrarlas.

```text
horario laboral
  - descansos y bloqueos
  - citas PENDING o CONFIRMED
  - duración del servicio
  - margen entre citas
  = espacios públicos disponibles
```

La disponibilidad mostrada es orientativa hasta confirmar. La escritura vuelve a comprobar el
espacio dentro de una transacción y la base impide dos citas activas incompatibles para el mismo
profesional.

### 3.6 API pública mínima

Las entradas públicas se aislarán bajo rutas o acciones propias:

```text
/api/public/organizations/{slug}/catalog
/api/public/organizations/{slug}/availability
/api/public/organizations/{slug}/identity/*
/api/public/organizations/{slug}/appointments/*
/api/public/organizations/{slug}/chat
```

El `slug` identifica la barbería solicitada, pero el servidor resuelve el `organization_id`; nunca
acepta ese UUID como una afirmación confiable del navegador.

### 3.7 Capacidades separadas para IA pública

El chat público no reutilizará la ruta administrativa ni herramientas con permisos amplios. Su
catálogo de capacidades será explícito:

```text
PUBLIC_SERVICES_READ
PUBLIC_PRODUCTS_READ
PUBLIC_AVAILABILITY_READ
PUBLIC_APPOINTMENTS_CREATE
CUSTOMER_APPOINTMENTS_READ
CUSTOMER_APPOINTMENTS_UPDATE
CUSTOMER_APPOINTMENTS_CANCEL
```

Las capacidades `CUSTOMER_*` requieren una sesión verificada. El modelo no recibirá esquemas de
Caja, finanzas, costos, stock exacto, lista de clientes, notas internas ni agenda ocupada.

### 3.8 Activación gradual mediante configuración persistida

Cada organización tendrá configuración pública con valores seguros por defecto:

```text
public_profile_enabled = false
public_catalog_enabled = false
public_booking_enabled = false
public_self_service_enabled = false
public_chat_enabled = false
reminders_enabled = false
```

Una versión nueva puede llegar a producción sin hacerse visible. La activación se hará primero en
una organización piloto y cada capacidad podrá apagarse sin revertir datos ni desplegar otra
versión.

## 4. Arquitectura objetivo

```text
Cliente final
    |
    v
Página pública /reservar/[slug]
    |
    v
Route Handler o Server Action pública
    |-- valida contrato Zod
    |-- aplica rate limit, origen e idempotencia
    |-- resuelve organización por slug
    |-- exige requireCustomerActor() cuando corresponde
    v
Caso de uso server-only
    |-- disponibilidad
    |-- identidad y cliente
    |-- reserva/reprogramación/cancelación
    |-- outbox de notificaciones
    v
Drizzle + transacción PostgreSQL
    |
    +--> Agenda administrativa existente
    +--> Clientes existente
    +--> Caja existente
```

Estructura modular prevista:

```text
src/modules/public-booking/
├── domain/
│   ├── availability.ts
│   ├── contact.ts
│   ├── policies.ts
│   └── schemas.ts
├── application/
│   ├── create-booking.ts
│   ├── reschedule-booking.ts
│   ├── cancel-booking.ts
│   └── list-customer-appointments.ts
├── server/
│   ├── booking-service.ts
│   ├── customer-actor.ts
│   ├── repositories.ts
│   └── reminder-service.ts
└── interface/
    └── dto.ts
```

## 5. Evolución prevista de datos

El diseño exacto se cerrará en la etapa correspondiente, pero el modelo debe cubrir:

- perfil público, `slug`, zona horaria y banderas de activación por organización;
- horario laboral semanal y excepciones;
- servicios que presta cada profesional;
- bloqueos, descansos y ausencias;
- identidad verificada y relación organización-cliente;
- reservas temporales con expiración, si la prueba de concurrencia demuestra que son necesarias;
- origen de la cita: `ADMIN`, `PUBLIC_WEB`, `PUBLIC_CHAT` u otro canal;
- fecha, razón y actor de cancelación;
- relación entre una cita reprogramada y su versión anterior;
- consentimiento y preferencias de recordatorio;
- outbox de notificaciones e intentos idempotentes;
- auditoría pública sin guardar OTP, tokens ni contenido sensible en claro.

Los contactos actuales no se eliminarán ni se transformarán destructivamente. Antes de imponer
unicidad se hará un informe de duplicados por organización y una estrategia explícita de
resolución. Las nuevas restricciones no podrán descartar ni fusionar filas automáticamente.

## 6. Estrategia de compatibilidad y protección de producción

### 6.1 Patrón expandir, activar y contraer

Cada cambio seguirá esta secuencia:

1. **Expandir:** agregar tablas, columnas, índices, rutas o código compatibles.
2. **Desplegar deshabilitado:** todas las banderas públicas permanecen en `false`.
3. **Verificar:** ejecutar CI, migraciones, smoke tests administrativos y pruebas de la nueva fase.
4. **Activar piloto:** habilitar sólo una organización de prueba.
5. **Observar:** revisar errores, latencia, intentos bloqueados y comportamiento funcional.
6. **Extender:** habilitar otras organizaciones de manera explícita.
7. **Contraer:** eliminar compatibilidad temporal únicamente en una fase futura y después de
   comprobar que ningún consumidor antiguo la utiliza.

### 6.2 Reglas de migración

- Las migraciones serán forward-only y aditivas.
- No se renombrarán ni borrarán columnas usadas por producción en la misma entrega que introduce
  su reemplazo.
- Toda columna nueva tendrá `NULL` permitido o un valor por defecto compatible cuando sea
  necesario.
- Antes de una restricción única se auditarán duplicados reales.
- Cada índice grande se evaluará para no bloquear escrituras de producción.
- El plan remoto se revisará antes de aplicar la migración.
- La aplicación anterior debe seguir funcionando sobre el esquema nuevo.
- Una reversión de aplicación no debe exigir revertir el esquema.

### 6.3 Protección de funcionalidades existentes

Después de cada fase serán obligatorios:

- CI del componente nuevo y todos sus consumidores transitivos;
- suite completa cuando cambien esquema, Auth, tooling o componentes compartidos;
- pruebas de contrato para asegurar que los DTO administrativos no cambian;
- integración con PostgreSQL para citas, clientes y concurrencia cuando aplique;
- smoke test manual de Inicio, Agenda, Caja, Clientes, Inventario, Servicios y Analítica;
- verificación de login administrativo y aislamiento entre organizaciones;
- revisión de errores nuevos en Vercel y PostgreSQL después del despliegue.

## 7. Flujo de ramas, PR y producción

Este programa no usará ramas apiladas. Cada etapa se integrará completamente antes de comenzar la
siguiente:

```text
main desplegado y validado
└── feature/public-booking-01-foundation
       └── PR a main -> merge -> deploy -> validación

main desplegado y validado
└── feature/public-booking-02-availability
       └── PR a main -> merge -> deploy -> validación
```

Reglas:

1. Cada rama nace del último `origin/main` validado en producción.
2. Cada rama contiene un solo commit enfocado.
3. Cada PR apunta directamente a `main`.
4. Una corrección del pipeline usa `commit --amend` y `push --force-with-lease`.
5. No se inicia la siguiente fase hasta que el propietario confirme la prueba en producción.
6. Las migraciones y la aplicación se publican mediante el despliegue coordinado existente.
7. Si una fase introduce una capacidad incompleta, queda inaccesible mediante sus banderas.
8. La activación de una bandera es una operación explícita y auditada, no un efecto automático del
   merge.

### Promoción de cada fase

```text
revisión estática del diff
  -> PR y Preview
  -> CI y seguridad en verde
  -> prueba funcional en Preview
  -> merge a main
  -> CI de main en verde
  -> plan de migración y respaldo cuando aplique
  -> despliegue coordinado
  -> smoke test administrativo
  -> prueba específica de la fase con organización piloto
  -> confirmación del propietario
  -> siguiente fase
```

## 8. Componentes y estrategia de pruebas

Se agregará `public-booking` a `ci/components.json` con consumidores y dependencias explícitas.

| Cambio público                          | Suites mínimas adicionales                       |
| --------------------------------------- | ------------------------------------------------ |
| Identidad o sesión de cliente           | `auth-access`, seguridad E2E y RLS               |
| Creación o edición de cita              | `agenda-appointments`, `clients` y `pos-finance` |
| Catálogo público                        | `inventory-services`                             |
| Chat público                            | `ai-integrations` y contratos de capacidades     |
| Recordatorios                           | correo, idempotencia, resiliencia e integración  |
| Esquema o migración                     | `database`, pgTAP y suite completa               |
| Componentes compartidos o configuración | `shared-ui`, `tooling` y suite completa          |

Capas requeridas:

- **Dominio:** intervalos, zona horaria, normalización, políticas y transiciones de estado.
- **Servidor:** autorización pública, recursos de otra organización, validación e idempotencia.
- **PostgreSQL:** restricciones, concurrencia, índices, RLS y migración desde una copia compatible.
- **Componentes:** teclado, foco, estados vacíos, carga, error y diseño adaptable.
- **E2E:** reserva, OTP, consulta, reprogramación, cancelación y chat.
- **Seguridad:** enumeración, fuerza bruta, BOLA/IDOR, CSRF, payloads y fuga de PII.
- **Regresión:** agenda administrativa, Caja, clientes, inventario y analítica.
- **Rendimiento:** disponibilidad bajo volumen y dos reservas concurrentes del mismo espacio.

## 9. Etapas de ejecución

### Etapa 00 — Plan rector

**Rama:** `feature/public-booking-00-roadmap`  
**Cambio visible:** ninguno.

**Entregables:**

- este documento versionado;
- decisiones, fases, riesgos y criterios de producción;
- estrategia de pruebas y rollback;
- ninguna migración ni cambio de comportamiento.

**Validación:**

1. Revisar que alcance, seguridad y orden correspondan al producto esperado.
2. Confirmar que cada etapa sea desplegable sin depender de la siguiente.
3. Confirmar que el flujo de ramas sustituye explícitamente el esquema apilado anterior.
4. Confirmar que el diff contiene únicamente documentación.

**Rollback:** revertir el documento; no existe impacto funcional.

### Etapa 01 — Fundación pública y banderas

**Rama:** `feature/public-booking-01-foundation`  
**Cambio visible:** ninguno por defecto.

**Entregables:**

- módulo `public-booking` y fronteras `domain/application/server/interface`;
- perfil público y `slug` único por organización;
- zona horaria y banderas deshabilitadas por defecto;
- resolución de organización por slug en servidor;
- componente `public-booking` registrado en el CI;
- DTO público mínimo y endpoint de salud/configuración sin datos privados;
- migración, RLS, índices y pgTAP.

**Pruebas automáticas:** esquema desde cero, actualización desde el estado vigente, slug duplicado,
organización inexistente, banderas apagadas, RLS y ausencia de privilegios públicos innecesarios.

**Prueba en producción:**

1. Ejecutar el release en modo `plan` y revisar que sólo agregue estructuras.
2. Aplicar migración y desplegar con todas las banderas en `false`.
3. Confirmar que `/reservar/slug-inexistente` y
   `/api/public/organizations/slug-inexistente/config` respondan 404 sin exponer datos.
4. Ejecutar el smoke administrativo completo.
5. Confirmar ausencia de errores nuevos de esquema o autorización.

**Rollback:** apagar banderas, restaurar la versión anterior de Vercel y conservar las tablas
aditivas sin uso.

### Etapa 02 — Horarios y motor de disponibilidad

**Rama:** `feature/public-booking-02-availability`  
**Cambio visible:** configuración administrativa; experiencia pública aún deshabilitada.

**Entregables:**

- horario semanal de organización y profesionales;
- descansos, ausencias y cierres excepcionales;
- relación profesional-servicio;
- anticipación mínima, horizonte máximo, intervalo y margen configurables;
- motor puro de disponibilidad por zona horaria;
- configuración administrativa protegida por rol;
- consulta pública que devuelve exclusivamente espacios libres.

**Pruebas automáticas:** cambios de día, límites, duración arbitraria, simultaneidad entre
profesionales, bloqueos, horario nocturno, DST para zonas configurables y ausencia total de datos
de otras citas.

**Prueba en producción:**

1. Configurar horarios en una organización piloto.
2. Comparar manualmente espacios calculados con la agenda administrativa.
3. Crear, mover y cancelar una cita administrativa y comprobar que la disponibilidad se actualice.
4. Confirmar que otras organizaciones no cambien.
5. Ejecutar smoke de Agenda y Caja.

**Rollback:** deshabilitar consulta pública y configuración; las citas existentes no cambian.

### Etapa 03 — Identidad pública sin contraseña

**Rama:** `feature/public-booking-03-customer-identity`  
**Cambio visible:** flujo aislado de verificación en organización piloto.

**Entregables:**

- identidad pública vinculada a organización y cliente;
- OTP/enlace por correo y OTP por teléfono con proveedor configurado;
- `requireCustomerActor()` separado de `requireActor()`;
- sesión segura para cliente final;
- normalización y búsqueda segura de contactos;
- respuesta neutral, expiración, intentos máximos y rate limiting;
- cierre de sesión pública sin afectar la sesión administrativa.

**Pruebas automáticas:** código correcto, incorrecto, vencido, reutilizado, exceso de intentos,
contacto inexistente, misma identidad en dos organizaciones, usuario sin membresía intentando abrir
dashboard y miembro administrativo conservando su acceso.

**Prueba en producción:**

1. Solicitar un código con correo y teléfono reales de prueba.
2. Confirmar que los mensajes no revelen si el contacto existe.
3. Verificar sesión pública y denegación del dashboard.
4. Probar expiración y rate limit sin usar datos de clientes reales.
5. Ejecutar smoke de login, recuperación y sesión administrativa.

**Rollback:** apagar identidad pública, invalidar sesiones públicas activas y mantener relaciones
aditivas para diagnóstico.

### Etapa 04 — Página pública de catálogo y disponibilidad

**Rama:** `feature/public-booking-04-public-page`  
**Cambio visible:** single page de sólo lectura para la organización piloto.

**Entregables:**

- diseño público adaptable y desacoplado del dashboard;
- perfil, servicios, precios y productos de categoría `VENTA` marcados como públicos;
- calendario que muestra sólo espacios libres;
- estados de carga, vacío, error y barbería deshabilitada;
- SEO básico, metadatos, accesibilidad y medición sin PII.

**Pruebas automáticas:** DTO mínimo, productos consumibles ocultos, costos y stock exacto ocultos,
navegación por teclado, móvil, contraste, organización deshabilitada y separación entre tenants.

**Prueba en producción:**

1. Activar únicamente `public_profile_enabled` y `public_catalog_enabled` en el piloto.
2. Revisar móvil y escritorio sin iniciar sesión.
3. Inspeccionar red y HTML para confirmar que no viajen datos privados.
4. Comparar catálogo y espacios con datos administrativos.
5. Confirmar que el dashboard mantiene apariencia y comportamiento.

**Rollback:** apagar las dos banderas; la URL vuelve al estado no disponible.

### Etapa 05 — Creación pública de citas

**Rama:** `feature/public-booking-05-create-appointment`  
**Cambio visible:** reserva habilitable en la organización piloto.

**Entregables:**

- formulario nombre, correo/teléfono, servicio, profesional opcional, fecha y hora;
- consentimiento independiente para confirmación y recordatorio;
- verificación de contacto antes de confirmar la reserva;
- resolución o creación segura de `client`;
- transacción que vuelve a validar el horario;
- idempotencia y prevención de doble reserva;
- cita con origen `PUBLIC_WEB`, visible inmediatamente en Agenda y posteriormente en Caja.

**Pruebas automáticas:** cliente nuevo, existente, conflicto de contacto, doble envío, dos reservas
concurrentes, precio manipulado, servicio inactivo, horario vencido, recurso de otra organización y
trazabilidad Agenda-Caja.

**Prueba en producción:**

1. Activar `public_booking_enabled` sólo en el piloto.
2. Reservar como cliente nuevo y confirmar creación única del cliente.
3. Reservar de nuevo con el mismo contacto y confirmar reutilización.
4. Comprobar la cita en Agenda y cobrarla en Caja.
5. Intentar tomar el mismo espacio desde dos navegadores.
6. Ejecutar smoke de creación y edición administrativa de citas.

**Rollback:** apagar reservas públicas. Las citas ya confirmadas permanecen válidas y gestionables
desde el dashboard.

### Etapa 06 — Mis citas y autoservicio

**Rama:** `feature/public-booking-06-self-service`  
**Cambio visible:** consulta y gestión habilitable para clientes verificados.

**Entregables:**

- listado mínimo de citas propias próximas e históricas;
- creación adicional desde la sesión verificada;
- reprogramación con nueva validación concurrente;
- cancelación lógica con fecha, canal y motivo;
- políticas configurables de anticipación para cambios;
- auditoría de todas las operaciones públicas.

**Pruebas automáticas:** acceso propio, acceso de otro cliente, otra organización, citas pasadas,
completadas o canceladas, ventana de cancelación, concurrencia al reprogramar y conservación de
auditoría.

**Prueba en producción:**

1. Activar `public_self_service_enabled` en el piloto.
2. Consultar citas con OTP válido.
3. Reprogramar una futura y comprobar el calendario administrativo.
4. Cancelarla y confirmar que no desaparezca del historial.
5. Intentar reutilizar enlaces, IDs o sesiones de otro cliente.
6. Confirmar que Caja e historial financiero no cambien.

**Rollback:** apagar autoservicio; las citas siguen disponibles para gestión administrativa.

### Etapa 07 — Confirmaciones y recordatorios

**Rama:** `feature/public-booking-07-reminders`  
**Cambio visible:** comunicaciones habilitables por organización y consentimiento.

**Entregables:**

- outbox persistente de notificaciones;
- confirmación inmediata y recordatorios configurables;
- reintentos con idempotencia y estados observables;
- plantillas sin información administrativa;
- actualización o cancelación de recordatorios al mover/cancelar una cita;
- procesamiento programado con límites de lote.

**Pruebas automáticas:** consentimiento ausente, envío único, reintento, proveedor caído, cambio de
hora, cancelación, zona horaria, concurrencia entre workers y ausencia de PII en logs.

**Prueba en producción:**

1. Activar `reminders_enabled` sólo en el piloto.
2. Crear citas con y sin consentimiento.
3. Confirmar recepción, formato y hora del mensaje.
4. Simular fallo controlado del proveedor y comprobar reintento sin duplicado.
5. Reprogramar y cancelar para validar el outbox.
6. Confirmar que una falla de correo nunca deshaga una cita.

**Rollback:** apagar recordatorios y detener el worker; las citas y el outbox permanecen íntegros.

### Etapa 08 — Chat público limitado

**Rama:** `feature/public-booking-08-customer-chat`  
**Cambio visible:** asistente público habilitable para la organización piloto.

**Entregables:**

- ruta y almacenamiento separados del chat administrativo;
- conversación efímera identificada por cookie segura;
- herramientas públicas de catálogo y disponibilidad;
- reserva mediante el mismo caso de uso determinista de la página;
- consulta, reprogramación y cancelación sólo con sesión verificada;
- confirmación explícita antes de cada mutación;
- límites de cuerpo, pasos, tiempo, frecuencia y gasto.

**Pruebas automáticas:** matriz exacta de herramientas, prompt injection, solicitud financiera,
enumeración, mutación sin verificar, IDs ajenos, repetición de tool call, timeout e indisponibilidad
del proveedor de IA.

**Prueba en producción:**

1. Activar `public_chat_enabled` sólo en el piloto.
2. Consultar servicios, productos y espacios.
3. Solicitar información administrativa y confirmar rechazo.
4. Crear una cita y verificar que no se duplique.
5. Intentar modificar una cita sin OTP y luego con sesión válida.
6. Confirmar que el chat administrativo mantiene todas sus capacidades autorizadas.

**Rollback:** apagar chat público; la página y reservas manuales continúan disponibles.

### Etapa 09 — Endurecimiento y despliegue general

**Rama:** `feature/public-booking-09-ga-hardening`  
**Cambio visible:** habilitación gradual para organizaciones aprobadas.

**Entregables:**

- E2E completo en Chromium, Firefox y móvil;
- auditoría de accesibilidad y seguridad;
- pruebas de carga del motor de disponibilidad;
- alertas, métricas y runbook de incidentes;
- documentación administrativa y pública;
- checklist de incorporación de una barbería;
- revisión final de permisos, RLS, índices y retención de datos.

**Pruebas automáticas:** suite completa, mutación del dominio crítico, concurrencia real,
rendimiento, escaneo de secretos, dependencias, SAST, pgTAP y E2E de regresión.

**Prueba en producción:**

1. Mantener piloto estable durante el periodo acordado.
2. Revisar tasa de reserva, fallos OTP, conflictos, cancelaciones y latencia.
3. Habilitar una segunda organización y comprobar aislamiento.
4. Ejecutar el checklist administrativo completo.
5. Habilitar organizaciones restantes sólo mediante decisión explícita.

**Rollback:** apagar por organización la capacidad afectada; restaurar aplicación anterior si es
necesario y corregir el esquema únicamente mediante una migración forward.

## 10. Matriz de regresión obligatoria

Esta matriz se ejecutará después de cada despliegue, reducida o completa según el impacto, pero no
podrá omitirse cuando cambien datos compartidos:

| Área         | Comprobación mínima                                                       |
| ------------ | ------------------------------------------------------------------------- |
| Auth         | login, callback, recuperación y rechazo sin membresía                     |
| Inicio       | métricas y próximas citas sin errores                                     |
| Agenda       | crear, editar, mover, cancelar y visualizar simultaneidad                 |
| Caja         | venta, cita pendiente, recibo, historial y cuenta por cobrar              |
| Clientes     | crear, editar, eliminar permitido y totales                               |
| Inventario   | crear, editar, stock y consumibles                                        |
| Servicios    | duración, materiales y actualización de citas futuras                     |
| Analítica    | filtros, trazabilidad y exportación                                       |
| IA interna   | capacidades por rol y ausencia de herramientas no autorizadas             |
| Multi-tenant | un identificador de otra organización nunca devuelve ni modifica recursos |

## 11. Observabilidad y criterios operativos

Se medirán sin guardar contactos ni mensajes completos:

- solicitudes de disponibilidad y latencia p95;
- reservas iniciadas, verificadas, confirmadas y rechazadas;
- conflictos de horario;
- OTP solicitados, expirados y bloqueados;
- reprogramaciones y cancelaciones;
- notificaciones pendientes, enviadas y fallidas;
- tool calls del chat por capacidad y resultado;
- errores por ruta, organización anonimizada y código estable.

Alertas mínimas:

- aumento de errores 5xx;
- cola de recordatorios envejecida;
- tasa anormal de OTP o rate limits;
- conflictos de cita por encima del nivel esperado;
- latencia de disponibilidad degradada;
- cualquier error de RLS, esquema o aislamiento.

## 12. Riesgos y mitigaciones

| Riesgo                              | Mitigación                                                       |
| ----------------------------------- | ---------------------------------------------------------------- |
| Ver citas con un contacto conocido  | OTP/enlace, sesión estrecha y respuesta neutral                  |
| Doble reserva                       | revalidación transaccional, restricción e idempotencia           |
| Cruce entre organizaciones          | slug resuelto en servidor, filtros compuestos, RLS y pruebas     |
| Spam o agotamiento del proveedor    | CAPTCHA adaptable, rate limit, cooldown y presupuesto            |
| Duplicación de clientes             | normalización, identidad por organización y conflicto bloqueado  |
| Regresión administrativa            | banderas apagadas, contratos estables y matriz de regresión      |
| Migración incompatible              | expand/contract, plan remoto, respaldo y rollback de aplicación  |
| IA ejecutando operaciones indebidas | herramientas mínimas, sesión verificada y confirmación explícita |
| Pérdida de recordatorios            | outbox persistente, reintentos e idempotencia                    |
| Fuga de PII en logs o analítica     | DTO mínimos, enmascarado y prohibición de payloads completos     |

## 13. Decisiones pendientes antes de sus etapas

No bloquean la etapa 00, pero deben resolverse antes de implementar el componente correspondiente:

1. proveedor de OTP por teléfono y países iniciales;
2. proveedor y dominio de correo transaccional;
3. si el cliente puede escoger profesional o sólo “cualquiera” por organización;
4. anticipación mínima y política predeterminada de cancelación;
5. duración de la reserva temporal durante la verificación;
6. contenido, número y horario de recordatorios;
7. periodo de retención del historial y conversaciones públicas;
8. organización piloto y responsables de aprobar activaciones;
9. periodo de observación exigido antes del despliegue general.

Cada decisión relevante se registrará en este documento o en un ADR dentro de `docs/architecture/`
antes de escribir la funcionalidad dependiente.

## 14. Criterio de finalización

El programa estará completo cuando:

- una organización pueda configurar y publicar su perfil y horarios;
- un cliente pueda reservar y gestionar citas sin contraseña, pero con identidad verificada;
- las citas públicas aparezcan correctamente en Agenda y Caja;
- recordatorios y chat funcionen con consentimiento y capacidades mínimas;
- ninguna ruta pública exponga información de otra persona u organización;
- la concurrencia no permita doble reserva;
- todas las capas de pruebas y seguridad estén en verde;
- la organización piloto y al menos una segunda organización hayan sido validadas;
- la matriz administrativa permanezca funcional;
- exista rollback operativo y las banderas permitan desactivar cada capacidad;
- el propietario confirme la aceptación de producción de la etapa 09.
