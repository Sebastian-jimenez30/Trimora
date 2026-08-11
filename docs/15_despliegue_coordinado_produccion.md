# Despliegue coordinado de base de datos y aplicacion

## Objetivo

Evitar que Vercel publique una version de Trimora que espere tablas, columnas, indices o politicas
que todavia no existen en Supabase. El despliegue de `main` queda controlado por
`.github/workflows/release-production.yml`; un merge por si solo no modifica la base ni publica la
aplicacion.

`vercel.json` desactiva exclusivamente el despliegue Git automatico de `main`. Los Preview de las
ramas siguen disponibles, pero no deben usarse para probar escrituras financieras contra la base de
produccion mientras su esquema sea anterior.

## Controles incorporados

El workflow manual:

1. solo puede ejecutarse seleccionando `main`;
2. usa el Environment protegido `production` y no cancela un release que ya este en curso;
3. exige ejecuciones exitosas de `ci.yml` y `security.yml` para el mismo SHA;
4. valida tablas historicas, historial de migraciones y ausencia de grupos duplicados;
5. construye el artefacto de Vercel antes de modificar Supabase;
6. nunca ejecuta `0000_unusual_garia.sql` sobre produccion;
7. calcula y publica el plan remoto antes de aplicarlo;
8. aplica migraciones con el CLI oficial fijado a la misma version usada por CI;
9. comprueba el esquema, los indices, la trazabilidad y RLS forzada;
10. despliega en Vercel el artefacto preconstruido y verifica `/login`.

## Por que `0000` se registra y no se ejecuta

La base actual ya contiene las tablas historicas de Trimora, pero puede no tener historial en
`supabase_migrations.schema_migrations`. La migracion `0000_unusual_garia.sql` esta concebida para
reconstruir una base vacia y comienza eliminando tablas. Ejecutarla sobre produccion destruiria
datos.

El primer release comprueba que las doce tablas de la linea base existan y, con autorizacion
explicita, usa `supabase migration repair 0000 --status applied`. Este comando solo registra la
version; no ejecuta el SQL. El control posterior bloquea el release si el plan intenta incluir
`0000_unusual_garia.sql`.

## Cambios que si se aplican

- `0001` y `0002`: indices analiticos y de pagos.
- `0003`: tabla de concesiones de administracion de plataforma y migracion del administrador
  historico.
- `0004`: restricciones multiempresa, privilegios, RLS, funciones privadas e indices.
- `0005`: recepcion segura e idempotente de webhooks.
- `0006`: trazabilidad de inventario por transaccion, reconciliacion de `total_spent` y reglas del
  libro financiero.
- `0007`: indices para concurrencia, historico, agenda y rendimiento.

`0004` contiene consolidacion de duplicados historicos. El preflight bloquea el despliegue si
encuentra membresias, invitaciones pendientes, consumibles de servicio o resumenes diarios
duplicados. De esta forma ninguna fila se elimina silenciosamente durante este release: primero se
debe revisar y resolver cada hallazgo.

## Configuracion manual unica en GitHub

Crear un Environment llamado `production`, asignarle al menos un revisor obligatorio y agregar
estos secretos:

| Secreto                   | Uso                                                                       |
| ------------------------- | ------------------------------------------------------------------------- |
| `PRODUCTION_DATABASE_URL` | Conexion directa o Session Pooler `5432`; nunca Transaction Pooler `6543` |
| `VERCEL_TOKEN`            | Construccion y publicacion controlada                                     |
| `VERCEL_ORG_ID`           | Propietario del proyecto Vercel                                           |
| `VERCEL_PROJECT_ID`       | Proyecto Vercel de Trimora                                                |

La contrasena incluida en `PRODUCTION_DATABASE_URL` debe estar codificada para URL. Los secretos no
se imprimen ni se guardan como artefactos.

Antes del release, confirmar en Supabase que existe un respaldo recuperable reciente. No exportar
datos de clientes a artefactos de GitHub.

Si no existe un respaldo administrado disponible, `scripts/release/backup-public-data.mjs` genera
fuera del repositorio una instantanea consistente y de solo lectura de todas las tablas publicas.
El manifiesto guarda estructura, conteos y SHA-256 por archivo. Despues de migrar,
`scripts/release/verify-backup-preservation.mjs` comprueba que los hashes sigan siendo validos y que
cada identificador respaldado continue en la base. El directorio contiene datos sensibles: no se
versiona, no se adjunta a GitHub y debe protegerse como cualquier copia de produccion.

## Procedimiento del primer release

1. Finalizar el PR de consolidacion contra `main` y confirmar todos sus checks.
2. Configurar el Environment y los secretos anteriores antes del merge.
3. Hacer merge. Vercel no publicara automaticamente `main` por la regla de `vercel.json`.
4. Esperar que los workflows `CI` y `Seguridad` del commit en `main` terminen en verde.
5. Ejecutar `Despliegue coordinado de produccion` con:
   - rama: `main`;
   - `mode`: `plan`;
   - `baseline_legacy`: activado para la primera inspeccion;
   - `backup_confirmed`: desactivado;
   - confirmacion vacia.
6. Descargar `production-migration-plan-*` y revisar el historial. Si falta `0000`, el informe debe
   indicar que requiere registro; nunca debe proponer ejecutar su archivo SQL.
7. Verificar el respaldo en Supabase.
8. Ejecutar nuevamente el workflow con:
   - `mode`: `deploy`;
   - `baseline_legacy`: activado si el plan indico que falta `0000`;
   - `backup_confirmed`: activado;
   - `confirmation`: `MIGRATE_AND_DEPLOY`.
9. Aprobar manualmente el Environment `production`.
10. Esperar la verificacion posterior y el smoke test de `/login`.

En releases siguientes, `baseline_legacy` debe permanecer desactivado porque `0000` ya estara
registrada.

## Validacion funcional posterior

1. Iniciar sesion como usuario normal y como administrador de plataforma.
2. Registrar una venta de producto y confirmar venta, items, stock y movimiento de inventario.
3. Registrar un servicio con consumible decimal y confirmar su descuento exacto.
4. Crear dos deudas del mismo cliente, abonar y comprobar distribucion FIFO.
5. Revisar Caja, historial, cuentas por cobrar y Analitica.
6. Confirmar que no aparezcan eventos `platform_admin_schema_pending` ni errores `42P01` o `42703`.

## Fallos y reversion

- Si falla el preflight, la compilacion o el plan, la base y la aplicacion no se modifican.
- Si falla una migracion, Vercel no despliega. Se conserva el artefacto y se revisa el error antes de
  reintentar; nunca se marca manualmente una migracion intermedia como aplicada.
- Si las migraciones terminan pero falla Vercel, la version anterior permanece activa. Se corrige el
  despliegue y se reintenta sin revertir el esquema.
- Si aparece una regresion despues de publicar, se restaura la version anterior desde Vercel. Las
  migraciones son forward-only: no ejecutar `db reset`, no borrar columnas y no restaurar toda la
  base sin una decision explicita de incidente.
- Si una migracion modifico datos de manera incorrecta, detener escrituras y seguir el procedimiento
  de restauracion del respaldo de Supabase antes de cualquier nuevo despliegue.

## Criterio de cierre

El programa se considera publicado cuando el workflow termina verde, el SHA desplegado coincide
con `main`, las versiones `0000` a `0007` figuran en el historial remoto y la validacion funcional
posterior es satisfactoria.
