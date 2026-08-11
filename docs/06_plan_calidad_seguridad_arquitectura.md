# Plan rector de calidad, seguridad y arquitectura

**Estado:** Vigente  
**Proyecto:** Trimora  
**Fecha de adopción:** 2026-08-04  
**Propósito:** Guiar la evolución completa de Trimora antes de publicar parcialmente cambios de arquitectura, seguridad o lógica de negocio.

## 1. Objetivo

Construir una base verificable para que Trimora tenga:

- límites claros entre interfaz, servidor, dominio e infraestructura;
- autenticación y autorización centralizadas;
- aislamiento multiempresa protegido también por PostgreSQL;
- reglas financieras e inventario probadas como invariantes;
- cobertura amplia por módulo y componente;
- selección automática de pruebas según los componentes realmente afectados;
- pruebas unitarias, de integración, base de datos, RLS, E2E, accesibilidad y seguridad;
- un CI estricto cuyos resultados sean obligatorios antes de integrar a `main`;
- una entrega atómica del programa completo, evitando publicar una arquitectura incompleta.

Este documento es la fuente de verdad para las siguientes ramas. Si cambia el alcance, primero se actualiza este plan y se registra la razón.

## 2. Restricciones y decisiones adoptadas

### 2.1 Monolito modular

Trimora continuará como una aplicación full-stack de Next.js. No se separará todavía en dos repositorios ni en dos despliegues.

La separación será interna y verificable:

```text
Navegador / Client Components
              │
              ▼
Server Actions y Route Handlers
              │
              ▼
Casos de uso y reglas de dominio
              │
              ▼
DAL / Repositorios server-only
              │
              ▼
PostgreSQL / Supabase
```

Se reconsiderará un backend desplegado por separado únicamente si aparecen clientes externos, equipos independientes, necesidades de escalado diferentes o límites operativos que lo justifiquen.

### 2.2 Seguridad por capas

La seguridad no dependerá de que una opción esté oculta en la interfaz.

- Cada Server Action y Route Handler se tratará como una entrada pública.
- La identidad y organización se resolverán desde datos confiables del servidor.
- `user_metadata` no se usará para decisiones de autorización.
- Toda operación verificará organización, rol y pertenencia del recurso afectado.
- La base de datos tendrá RLS y restricciones como segunda barrera.
- Los módulos con secretos, acceso administrativo o conexión directa usarán `server-only`.
- El cliente recibirá DTOs mínimos y serializables, no filas completas de base de datos.

### 2.3 Validación fuera del agente

Por instrucción del propietario del proyecto:

- el agente no ejecutará localmente lint, pruebas ni build;
- el agente generará el código, realizará revisión estática del diff y publicará la rama;
- al finalizar cada etapa entregará instrucciones exactas para probarla;
- el pipeline y el propietario ejecutarán la validación;
- no se iniciará la siguiente etapa hasta recibir confirmación explícita de que la etapa actual está correcta.

### 2.4 Entrega completa mediante ramas apiladas

Los cambios de este programa no se fusionarán individualmente a `main`.

```text
rama base vigente
└── architecture/00-quality-roadmap
    └── architecture/01-ci-foundation
        └── architecture/02-server-boundaries
            └── architecture/03-database-security
                └── architecture/04-webhook-hardening
                    └── architecture/05-critical-domain-tests
                        └── architecture/06-component-tests
                            └── architecture/07-e2e-security-ci
                                └── architecture/08-resilience-performance
```

Reglas:

1. Cada rama nace de la rama anterior confirmada por el propietario.
2. Cada rama contiene un solo commit enfocado.
3. Cada PR intermedio apunta a su rama padre y muestra únicamente el delta de esa etapa.
4. Los PR intermedios permanecen sin fusionar.
5. Una corrección de pipeline se realiza con `commit --amend` y `push --force-with-lease` sobre la misma rama.
6. La siguiente rama solo se crea después de la confirmación del propietario.
7. La rama final contiene toda la cadena y abre el PR de integración contra `main`.
8. Solo se fusiona a `main` después de validar el conjunto completo en un entorno equivalente a producción.

### 2.5 Pruebas seleccionadas por impacto

El CI no ejecutará indiscriminadamente todas las pruebas en cada cambio. Detectará los componentes afectados comparando el `merge-base` de la rama contra su rama base y ejecutará sus suites junto con las de sus dependientes transitivos.

La selección no se basará únicamente en el nombre del archivo de prueba ni en `HEAD~1`. Existirá un mapa versionado de componentes y dependencias, consumido por un script determinista del repositorio.

Componentes iniciales:

| Componente            | Código principal                                          | Dependencias que debe activar                                      |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| `auth-access`         | Auth, miembros, colaboradores, superadmin y proxy         | Todos los módulos autenticados y seguridad E2E                     |
| `pos-finance`         | Caja, ventas, pagos, recibos y movimientos                | Clientes, inventario y analítica                                   |
| `inventory-services`  | Productos, stock, consumibles y servicios                 | POS, agenda y analítica                                            |
| `agenda-appointments` | Agenda, citas, calendario y horarios                      | POS y dashboard                                                    |
| `clients`             | Clientes, totales y cuentas por cobrar                    | Agenda, POS y analítica                                            |
| `analytics`           | Métricas, trazabilidad, filtros y exportaciones           | Dashboard analítico                                                |
| `ai-integrations`     | Chat, herramientas de IA y webhooks                       | Contratos externos y módulos que las herramientas pueden modificar |
| `shared-ui`           | Navegación, modales y componentes compartidos             | Todas las interfaces consumidoras                                  |
| `database`            | Esquema, migraciones, RLS y conexión                      | Toda integración de backend y E2E crítico                          |
| `tooling`             | CI, TypeScript, ESLint, Next, Vitest y scripts de pruebas | Suite completa de calidad                                          |

Reglas de selección:

1. Un cambio dentro de un componente ejecuta sus pruebas unitarias, de integración y de interfaz aplicables.
2. También ejecuta las pruebas de todos sus consumidores transitivos declarados en el mapa.
3. Cambios en `src/core`, autenticación, utilidades compartidas, esquema, migraciones, configuración o lockfile amplían el alcance automáticamente.
4. Cambios exclusivamente documentales pueden omitir pruebas funcionales, pero mantienen las validaciones documentales y de integridad del repositorio.
5. Si un archivo no está clasificado, el comportamiento seguro es ejecutar la suite completa, no omitirlo.
6. El selector publicará en el resumen del job los archivos detectados, componentes afectados, dependientes añadidos y suites elegidas.
7. Existirá una opción manual `full-suite` para forzar toda la validación.
8. La suite completa será obligatoria en la rama final contra `main`, en `main`, en ejecución nocturna y cuando cambie el propio selector.

Esta decisión acepta una mayor complejidad en el CI a cambio de retroalimentación más rápida. El riesgo de omitir regresiones se mitiga con dependencias transitivas explícitas, fallback seguro, auditoría del plan seleccionado y ejecuciones completas periódicas.

## 3. Línea base observada

- Existe Vitest y React Testing Library.
- Solo hay una suite de pruebas, enfocada en importación de inventario.
- La cobertura genera reportes, pero no tiene umbrales obligatorios.
- El CI ejecuta lint y build.
- En PR, las pruebas se limitan a `--changed HEAD~1`, sin un mapa confiable de componentes ni dependencias transitivas.
- No hay pruebas E2E, de integración con PostgreSQL, de RLS ni de migraciones desde cero.
- No hay puertas de accesibilidad, análisis estático de seguridad ni escaneo de secretos.
- La validación de entradas con Zod es parcial.
- La autenticación y resolución de organización están duplicadas.
- Módulos críticos confían en `user_metadata.organization_id`.
- Las migraciones versionadas no contienen las políticas RLS del esquema multiempresa actual.
- Los webhooks públicos no muestran una verificación de autenticidad suficiente y utilizan selección provisional de organización.
- Existen dos archivos de configuración de Next.js.

La línea base podrá ampliarse con hallazgos nuevos, pero no se reducirán los criterios finales sin una decisión documentada.

## 4. Pirámide de pruebas objetivo

| Capa          | Alcance                                         | Herramienta principal    |                         Objetivo final |
| ------------- | ----------------------------------------------- | ------------------------ | -------------------------------------: |
| Dominio       | Dinero, deudas, inventario, agenda, fechas      | Vitest en Node           |                 95% líneas / 90% ramas |
| Aplicación    | Casos de uso, autorización, transacciones       | Vitest en Node           |                 90% líneas / 85% ramas |
| Componentes   | Render, interacción, formularios, accesibilidad | Testing Library          |                 85% líneas / 80% ramas |
| Base de datos | Esquema, restricciones, RLS, funciones          | Supabase local + pgTAP   |       Todos los permisos e invariantes |
| Integración   | Casos de uso con PostgreSQL real                | Vitest + base efímera    |              Flujos críticos completos |
| E2E           | Recorridos reales en aplicación compilada       | Playwright               |           Flujos de negocio esenciales |
| Seguridad     | Dependencias, secretos, SAST y abuso            | CodeQL y herramientas CI |        Cero hallazgos altos o críticos |
| Resiliencia   | Concurrencia, rendimiento y mutación            | Pruebas especializadas   | Sin corrupción ni regresiones críticas |

Los porcentajes son objetivos finales. La cobertura se incrementará por etapas sin permitir que código nuevo crítico quede sin pruebas.

En PR se medirá la cobertura de cada componente afectado. La cobertura global se recalculará en la suite completa de la rama final, `main` y ejecuciones nocturnas. Un componente modificado no podrá reducir su propio umbral aunque otros componentes no se ejecuten en ese PR.

## 5. Etapas de ejecución

### Etapa 00 — Plan rector

**Rama:** `architecture/00-quality-roadmap`

**Resultado:**

- este documento queda versionado;
- se formalizan arquitectura, orden, criterios y estrategia de ramas;
- no se cambia comportamiento de la aplicación.

**Validación del propietario:**

- revisar que el orden y el flujo de publicación coincidan con lo acordado;
- confirmar que las ramas permanecerán apiladas y sin merge;
- aprobar el inicio de la etapa 01.

### Etapa 01 — Fundaciones de CI y pruebas

**Rama:** `architecture/01-ci-foundation`

**Estado:** Implementada; pendiente de validación por pipeline y aceptación del propietario.

**Cambios previstos:**

- consolidar una sola configuración de Next.js;
- migrar el CI a Node 22;
- separar scripts de formato, lint, TypeScript, unitarias, componentes y cobertura;
- separar Vitest en proyectos `node` y `jsdom`;
- añadir utilidades de pruebas sin mocks globales indiscriminados;
- definir un manifiesto versionado de componentes, rutas, suites y dependencias;
- crear un detector de impacto basado en el `merge-base` real de cada PR;
- generar matrices dinámicas de jobs para ejecutar solo los componentes afectados y sus dependientes;
- aplicar fallback de suite completa a archivos desconocidos o cambios transversales;
- configurar cobertura con umbrales iniciales y artefactos;
- hacer fallar lint ante advertencias nuevas o existentes;
- añadir permisos mínimos, concurrencia, timeout y cachés de CI;
- crear una plantilla segura de variables de entorno para pruebas.

**Criterios de aceptación:**

- los jobs son independientes y sus fallos son identificables;
- `typecheck` no depende del build para detectar errores;
- cada PR muestra qué componentes y suites fueron seleccionados y por qué;
- una modificación de un componente ejecuta sus pruebas y las de sus consumidores transitivos;
- cambios compartidos o no clasificados fuerzan el alcance seguro correspondiente;
- la suite completa sigue disponible y se ejecuta en los puntos de consolidación definidos;
- cobertura y reportes quedan disponibles como artefactos;
- no se utilizan secretos de producción.

**Prueba que se entregará:** cambios simulados en cada componente para verificar la matriz seleccionada, los dependientes transitivos, el fallback completo y los artefactos generados.

### Etapa 02 — Frontera de servidor y autorización central

**Rama:** `architecture/02-server-boundaries`

**Estado:** implementada, pendiente de validación del pipeline y aceptación funcional. La decisión
y las pruebas manuales están documentadas en `docs/08_fronteras_servidor_autorizacion.md`.

**Cambios previstos:**

- crear `requireActor()` como fuente única de usuario, organización y rol;
- resolver membresía desde `organization_members`;
- eliminar `user_metadata.organization_id` de autorizaciones;
- introducir carpetas de dominio, aplicación, servidor e interfaz por módulo;
- convertir Server Actions en adaptadores delgados;
- marcar base de datos, administración, correo e IA con `server-only`;
- crear DTOs explícitos y limitar datos serializados al navegador;
- reemplazar el superadministrador por una autorización persistida y auditable;
- validar entradas externas con Zod.

**Criterios de aceptación:**

- ninguna operación crítica autoriza mediante metadatos editables;
- cada acción valida el recurso y la organización;
- importar un módulo privado desde un Client Component falla durante build;
- la interfaz conserva el comportamiento existente.

**Prueba que se entregará:** matriz de roles, llamadas directas a acciones e intentos con identificadores de otra organización.

El selector deberá clasificar esta etapa como cambio transversal de `auth-access` y ejecutar todas las suites de módulos autenticados, sin depender de que sus archivos hayan cambiado directamente.

### Etapa 03 — Seguridad e integridad de base de datos

**Rama:** `architecture/03-database-security`

**Estado:** implementada, pendiente de validación del pipeline y aceptación funcional. La matriz de
acceso, las decisiones de RLS y las pruebas manuales están documentadas en
`docs/09_seguridad_integridad_base_datos.md`.

**Cambios previstos:**

- versionar RLS para todas las tablas expuestas;
- crear políticas por organización y rol;
- aplicar privilegios mínimos;
- añadir índices usados por RLS;
- agregar restricciones financieras, inventario y estados válidos;
- asegurar unicidad de membresías y relaciones necesarias;
- crear pruebas pgTAP positivas y negativas;
- comprobar que todas las migraciones reconstruyen una base vacía;
- documentar y verificar el rol usado por `DATABASE_URL` y su relación con RLS.

**Criterios de aceptación:**

- una organización no puede leer ni modificar datos de otra;
- usuarios anónimos no acceden a datos privados;
- cada `UPDATE` verifica fila previa y fila resultante;
- los invariantes críticos también fallan desde SQL directo;
- `supabase db reset` y `supabase test db` pasan en CI.

**Prueba que se entregará:** casos pgTAP con dos organizaciones, varios roles y operaciones CRUD cruzadas.

Todo cambio en esquema, migraciones, RLS o conexión activará `database`, las integraciones de backend dependientes y el E2E crítico relacionado. No se permitirá seleccionar únicamente la prueba SQL modificada.

### Etapa 04 — Webhooks e integraciones externas

**Rama:** `architecture/04-webhook-hardening`

**Estado:** implementada; pendiente de pipeline y aceptación del propietario.

**Cambios previstos:**

- validar firma o secreto de Telegram y WhatsApp/Kapso;
- eliminar permisos administrativos temporales;
- mapear cada canal a una organización explícita;
- implementar idempotencia y protección contra reenvíos;
- limitar tamaño, frecuencia y tiempo de procesamiento;
- validar payloads con Zod;
- eliminar logs de payloads completos y datos sensibles;
- separar herramientas de IA de permisos administrativos;
- añadir pruebas de contrato para proveedores externos.

**Criterios de aceptación:**

- una firma inválida se rechaza antes de procesar datos;
- un evento repetido no duplica citas ni movimientos;
- ningún canal puede seleccionar arbitrariamente una organización;
- un usuario externo no obtiene herramientas administrativas.

**Prueba que se entregará:** payload válido, inválido, repetido, incompleto y asociado a otra organización.

Los cambios de cada proveedor ejecutarán sus contratos específicos. Los cambios en utilidades compartidas de webhooks o herramientas de IA activarán todos los proveedores y módulos consumidores.

### Etapa 05 — Dominio crítico e integración

**Rama:** `architecture/05-critical-domain-tests`

**Estado de trabajo:** aceptada por el propietario con pipeline en verde.

**Módulos prioritarios:**

1. Caja, ventas, créditos y abonos.
2. Inventario y consumibles.
3. Agenda, duración y zona horaria.
4. Clientes y totales acumulados.
5. Analítica, paginación y exportaciones.

**Casos obligatorios:**

- venta simple y venta múltiple;
- persistencia de todos los ítems;
- descuento exacto de inventario y consumibles;
- rollback completo ante fallo intermedio;
- crédito con cliente obligatorio;
- abono parcial, pago completo y distribución FIFO;
- imposibilidad de abonar valores negativos o superiores a la deuda;
- cobro registrado en la fecha real del ingreso;
- pagos simultáneos sin doble cobro;
- CSV con total original y efectivo del movimiento;
- cursor sin duplicados ni omisiones;
- consistencia de `America/Bogota`;
- cambio de duración y simultaneidad de citas;
- reconstrucción correcta del total gastado del cliente.

**Criterios de aceptación:**

- invariantes financieros con cobertura mínima objetivo;
- integración con PostgreSQL real para operaciones transaccionales;
- fallos inyectados demuestran rollback;
- no hay corrupción bajo concurrencia controlada.

**Prueba que se entregará:** reporte de cobertura por módulo y resultados de integración.

Cada suite quedará etiquetada por componente. Por ejemplo, un cambio exclusivo en agenda no ejecutará toda la batería financiera, salvo que afecte una dependencia compartida; un cambio en transacciones o inventario sí ampliará el alcance a POS, clientes y analítica según el grafo.

### Etapa 06 — Componentes y experiencia de usuario

**Rama:** `architecture/06-component-tests`

**Estado de trabajo:** aceptada por el propietario con pipeline en verde.

La matriz de comportamientos, los DTO de interfaz y el recorrido manual están documentados en
`docs/12_componentes_experiencia_usuario.md`.

**Cambios previstos:**

- añadir Testing Library, `user-event` y matchers de accesibilidad;
- probar componentes por comportamiento y no por implementación;
- reducir `any` en propiedades y respuestas;
- crear fixtures y factories tipadas;
- etiquetar y ubicar cada prueba de componente para que el selector pueda ejecutarla de forma independiente;
- probar estados cargando, vacío, error, éxito y permisos;
- comprobar teclado, foco, modales y diseño adaptable.

**Componentes prioritarios:**

- POS y cuentas por cobrar;
- calendario y formulario de citas;
- clientes e inventario;
- servicios y consumibles;
- notificaciones y navegación;
- detalle y acciones del historial;
- filtros y trazabilidad de analítica.

**Criterios de aceptación:**

- interacciones críticas cubiertas;
- modales controlan foco y cierre correctamente;
- formularios muestran errores del servidor;
- componentes no revelan datos fuera de sus DTOs.

**Prueba que se entregará:** cobertura por componente y recorrido manual de estados visuales.

Las pruebas de componentes compartidos ejecutarán también las suites de las interfaces que los consumen. Las pruebas de un componente aislado no obligarán a ejecutar componentes visuales sin relación.

### Etapa 07 — E2E, accesibilidad y seguridad en CI

**Rama:** `architecture/07-e2e-security-ci`

**Estado de trabajo:** implementada; pendiente de validación por pipeline, revisión de hallazgos y
aceptación funcional. La operación, matriz de recorridos y activación manual de protecciones están
documentadas en `docs/13_e2e_accesibilidad_seguridad_ci.md`.

**Cambios previstos:**

- configurar Playwright contra build de producción;
- usar datos aislados y deterministas;
- dividir Playwright por proyectos o etiquetas de dominio;
- ejecutar en cada PR únicamente los recorridos Chromium asociados a los componentes afectados y sus flujos dependientes;
- ejecutar Chromium, Firefox y WebKit en `main` o calendario nocturno;
- añadir axe a recorridos críticos;
- añadir CodeQL, revisión de dependencias y escaneo de secretos;
- guardar reportes, capturas, video y trazas solo cuando aporten diagnóstico;
- configurar protección de rama y checks obligatorios.

**Recorridos E2E mínimos:**

1. Registro o acceso y sesión.
2. Crear cliente.
3. Agendar y editar una cita.
4. Cobrar servicio y productos.
5. Verificar inventario.
6. Crear deuda, abonar y pagar completa.
7. Verificar historial, recibo y analítica.
8. Probar restricciones de roles y aislamiento multiempresa.

**Criterios de aceptación:**

- los recorridos funcionan sobre una base creada desde migraciones;
- el resumen del CI relaciona cada recorrido E2E ejecutado con el componente que lo activó;
- no hay violaciones serias de accesibilidad;
- los escáneres no reportan hallazgos altos o críticos;
- los fallos producen evidencia suficiente para reproducirse.

**Prueba que se entregará:** reporte Playwright, accesibilidad y seguridad.

### Etapa 08 — Resiliencia, mutación y rendimiento

**Rama:** `architecture/08-resilience-performance`

**Cambios previstos:**

- pruebas de mutación para lógica financiera;
- pruebas de propiedades para montos e inventario;
- ejecutar mutación, propiedades y carga por componente afectado en PR, manteniendo una corrida completa programada;
- carga controlada sobre consultas y flujos críticos;
- pruebas de concurrencia en abonos, ventas y stock;
- verificación de índices y planes de consulta;
- presupuestos de rendimiento para páginas críticas;
- monitoreo de errores y correlación por solicitud;
- eliminación o aislamiento de código y scripts obsoletos.

**Criterios de aceptación:**

- las pruebas detectan mutaciones relevantes de reglas de negocio;
- operaciones simultáneas mantienen invariantes;
- no se agotan conexiones bajo la carga definida;
- consultas críticas usan índices adecuados;
- el conjunto completo está listo para el PR final contra `main`.

**Prueba que se entregará:** informe de mutación, concurrencia, consultas y rendimiento.

## 6. Modos y puertas obligatorias del CI

### 6.1 PR intermedio: validación por impacto

Todo PR apilado ejecutará siempre:

1. detección y reporte de componentes afectados;
2. validación del manifiesto de dependencias;
3. formato y lint sobre el alcance aplicable;
4. TypeScript con el alcance seguro definido por el proyecto;
5. pruebas y cobertura de componentes afectados;
6. pruebas de consumidores transitivos;
7. integración, base de datos o E2E únicamente cuando el grafo los active;
8. build cuando cambien código ejecutable o configuración de aplicación;
9. análisis de seguridad correspondiente al tipo de cambio.

El job de selección será obligatorio. Un plan vacío solo será válido para cambios exclusivamente documentales reconocidos.

### 6.2 Integración final y ejecuciones completas

Todo PR final contra `main` deberá superar:

1. formato;
2. ESLint sin advertencias;
3. TypeScript estricto;
4. pruebas unitarias completas;
5. cobertura por capa;
6. pruebas de componentes;
7. reconstrucción de base mediante migraciones;
8. lint y pruebas de PostgreSQL;
9. pruebas RLS;
10. integración con base real;
11. build de producción;
12. E2E críticos;
13. accesibilidad;
14. análisis estático de seguridad;
15. auditoría de dependencias;
16. escaneo de secretos.

Ningún check obligatorio se omitirá para obtener un pipeline verde. Una excepción requiere motivo, riesgo, mitigación y aprobación explícita.

La selección por componente optimiza los PR intermedios; no reemplaza la suite completa final, de `main` o nocturna.

## 7. Protocolo de cierre de cada etapa

Al terminar una rama, el agente entregará:

- rama y commit publicados;
- PR y rama base correspondientes;
- resumen de archivos y decisiones;
- migraciones o variables nuevas;
- riesgos o límites conocidos;
- instrucciones automáticas para el pipeline;
- componentes detectados, suites seleccionadas y razón de cualquier ampliación transitiva;
- instrucciones manuales paso a paso;
- resultados esperados y casos negativos;
- confirmación de que no ejecutó pruebas localmente.

El propietario responderá si:

- el pipeline está verde;
- el listado de componentes detectados coincide con el cambio realizado;
- no falta ningún consumidor que pudiera verse afectado;
- las pruebas manuales coinciden con lo esperado;
- existen errores que deban corregirse con `amend`;
- la etapa queda aprobada para crear la siguiente rama.

Sin esa confirmación no se crea la siguiente rama.

## 8. Condición final de integración

El programa se considerará completo cuando:

- todas las etapas estén aprobadas;
- la última rama contenga la cadena completa;
- el CI final esté verde;
- la suite completa, sin selección por componente, haya pasado sobre la cadena final;
- los flujos E2E críticos pasen en conjunto;
- el aislamiento multiempresa esté probado;
- no existan hallazgos altos o críticos abiertos;
- la cobertura alcance los objetivos acordados;
- exista un plan de despliegue y reversión;
- el propietario autorice explícitamente el merge final a `main`.

Hasta entonces, ninguna rama intermedia de este programa debe publicarse parcialmente en producción.
