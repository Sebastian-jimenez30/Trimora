# CI y pruebas por componente

Este documento describe la implementación de la etapa 01 del
[plan rector](./06_plan_calidad_seguridad_arquitectura.md). El archivo
`ci/components.json` es la fuente de verdad ejecutable para relacionar código, pruebas,
cobertura y consumidores transitivos.

## Flujo de una pull request

```text
merge-base de la PR
        │
        ▼
archivos modificados
        │
        ▼
componentes directos ──► consumidores transitivos
        │
        ├── cambio conocido ──► matriz de componentes con pruebas
        └── tooling/desconocido ──► suite completa segura
```

El detector publica en el resumen de GitHub Actions los archivos evaluados, los componentes
directos, los consumidores añadidos, los componentes que todavía no tienen pruebas y la razón
por la que se amplió el alcance. Un archivo no clasificado nunca reduce la validación: activa la
suite completa.

## Componentes registrados

| Componente            | Responsabilidad                                           |
| --------------------- | --------------------------------------------------------- |
| `auth-access`         | Identidad, membresías, roles y superadministración        |
| `pos-finance`         | Caja, ventas, pagos y movimientos                         |
| `inventory-services`  | Productos, existencias, consumibles y servicios           |
| `agenda-appointments` | Agenda, citas, calendario y horarios                      |
| `clients`             | Clientes, totales y cuentas por cobrar                    |
| `analytics`           | Métricas, trazabilidad y exportaciones                    |
| `ai-integrations`     | IA, importaciones y webhooks                              |
| `shared-ui`           | Navegación y componentes compartidos                      |
| `database`            | Esquema, migraciones, conexión y RLS                      |
| `tooling`             | CI, compilación, lint, formato y configuración de pruebas |

Cada entrada del manifiesto contiene:

- `paths`: archivos de producción que pertenecen al componente;
- `testRoots`: raíces donde se descubren sus pruebas;
- `coverage`: archivos que cuentan para la cobertura del componente;
- `triggers`: consumidores cuyas pruebas también deben ejecutarse.

Agregar una carpeta funcional exige clasificarla en este manifiesto. Los cambios al propio
manifiesto, al lockfile o a la configuración de herramientas ejecutan la suite completa.

## Entornos de Vitest

Vitest tiene dos proyectos aislados:

- `server`: entorno Node para dominio, casos de uso, acciones y utilidades de backend;
- `client`: entorno jsdom para componentes React e interacción de navegador.

No hay mocks globales de base de datos, autenticación o caché. Cada suite declara de forma
explícita sus fronteras, lo cual evita que una prueba pase por una dependencia simulada que no
conocía.

Los umbrales iniciales de cobertura son deliberadamente bajos porque esta etapa establece la
línea base. Las etapas 05 y 06 incorporarán cobertura crítica y por interfaz, y elevarán los
umbrales sin permitir retrocesos.

## Comandos del pipeline

| Comando                                         | Uso                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `npm run format:check`                          | Comprueba formato en archivos modificados o en todo el repositorio |
| `npm run lint:changed`                          | Ejecuta ESLint estricto sobre archivos modificados                 |
| `npm run typecheck`                             | Valida TypeScript independientemente del build                     |
| `npm run test:server`                           | Ejecuta únicamente pruebas de servidor                             |
| `npm run test:client`                           | Ejecuta únicamente pruebas de componentes cliente                  |
| `npm run test:component -- <nombre> --coverage` | Ejecuta y mide un componente                                       |
| `npm run test:coverage`                         | Ejecuta la suite completa con cobertura global                     |
| `npm run ci:detect`                             | Calcula el plan de impacto usando `BASE_SHA` y `HEAD_SHA`          |

## Cuándo se ejecuta todo

La suite completa se activa cuando:

- cambia tooling, el manifiesto o un archivo no clasificado;
- la rama final `architecture/08-*` abre PR contra `main`;
- se publica en `main`;
- se ejecuta el cron nocturno;
- se fuerza manualmente mediante `workflow_dispatch`.

Formato y lint operan sobre el delta en las PR intermedias. En ejecuciones de consolidación se
evalúa el repositorio completo. Así se puede endurecer la base progresivamente sin ocultar deuda
técnica ni ejecutar indiscriminadamente todas las pruebas funcionales en cada cambio ordinario.

## Variables seguras

`.env.test.example` contiene únicamente valores locales o ficticios. Ningún job debe recibir
secretos de producción. Las etapas que necesiten PostgreSQL usarán una instancia efímera creada
por el propio pipeline.
