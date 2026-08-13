# Etapa 08 - Resiliencia, mutacion y rendimiento

## 1. Resultado

La ultima etapa tecnica agrega puertas reproducibles para detectar reglas financieras debiles,
corrupcion por concurrencia, consultas sin indices, agotamiento de conexiones y regresiones de
rendimiento. Todas las pruebas se seleccionan desde el mismo grafo de componentes de las fases
anteriores y la corrida completa sigue siendo obligatoria en consolidacion, `main` y el calendario
nocturno.

Esta etapa no separa el despliegue ni agrega un servicio externo. Trimora conserva el monolito
modular de Next.js con logica delicada en servidor y PostgreSQL como autoridad transaccional.

## 2. Propiedades y mutacion

`ci/resilience.json` registra por componente las pruebas generativas, los objetivos de mutacion y
las pruebas que necesitan PostgreSQL real.

Para `pos-finance` se generan de forma determinista miles de montos y cantidades. Se comprueba:

- ida y vuelta exacta entre centavos y decimal;
- suma conmutativa y asociativa sin propagar errores binarios;
- precision de cuatro decimales para consumibles;
- comportamiento estable en limites de redondeo.

El ejecutor `run-mutation-tests.mjs` aplica cada mutacion declarada sobre una copia temporal del
archivo de trabajo, ejecuta las pruebas del componente y restaura el contenido original incluso si
la ejecucion falla. La linea base debe estar verde antes de mutar y todos los mutantes declarados
deben ser eliminados. El informe JSON y Markdown queda en `reports/mutation/<componente>`.

No se agrego un framework de mutacion al arbol npm. El ejecutor es pequeno, versionado,
determinista y falla si un patron deja de coincidir exactamente una vez, evitando mutaciones
silenciosamente obsoletas.

## 3. Concurrencia y carga controlada

La suite `resilience.integration.test.ts` usa PostgreSQL real y una organizacion efimera:

1. lanza 16 ventas simultaneas contra 10 unidades del mismo producto;
2. exige exactamente 10 ventas confirmadas, 6 rechazadas, stock final cero y 10 transacciones;
3. crea 1.200 movimientos financieros;
4. ejecuta 24 lecturas paginadas concurrentes;
5. comprueba 50 claves unicas por pagina;
6. exige un p95 maximo de 2.500 ms, configurable con `RESILIENCE_QUERY_P95_MS`;
7. verifica que el ensayo no abra mas conexiones de las permitidas por el pool de prueba.

El pool productivo mantiene una conexion conservadora por instancia serverless. Puede ajustarse
sin cambiar codigo mediante:

- `DATABASE_POOL_MAX`, entero entre 1 y 10;
- `DATABASE_IDLE_TIMEOUT_SECONDS`, entero entre 1 y 60;
- `DATABASE_CONNECT_TIMEOUT_SECONDS`, entero entre 1 y 30.

Valores ausentes usan `1`, `20` y `10`. Valores fuera de limite detienen el arranque en lugar de
crear una configuracion peligrosa.

## 4. Indices y planes PostgreSQL

La migracion `0007_resilience_performance.sql` es aditiva. No elimina, vacia ni reescribe datos.
Agrega:

- `transactions_org_client_type_status_created_id_idx` para localizar, ordenar y bloquear deudas
  FIFO por empresa y cliente;
- `inventory_movements_org_transaction_idx` para trazabilidad de inventario dentro del tenant.

pgTAP valida los indices anteriores y los ya existentes para historico, agenda, abonos y kardex.
Con `enable_seqscan=off`, los planes `EXPLAIN (FORMAT JSON)` demuestran que cada consulta critica
puede usar el indice diseñado. Esto no reemplaza observacion en produccion: con volumen real deben
revisarse `EXPLAIN (ANALYZE, BUFFERS)` y estadisticas antes de ajustar un indice.

## 5. Presupuestos de interfaz

Playwright mide navegacion real sobre el build standalone y conserva la medicion como adjunto del
test. Los presupuestos iniciales son deliberadamente estrictos pero compatibles con un runner CI:

| Pagina    |     TTFB | DOMContentLoaded |     Load |
| --------- | -------: | ---------------: | -------: |
| Inicio    | 2.500 ms |         5.000 ms | 7.000 ms |
| Agenda    | 2.500 ms |         5.000 ms | 7.000 ms |
| Caja      | 2.500 ms |         5.000 ms | 7.000 ms |
| Analitica | 3.000 ms |         6.000 ms | 8.000 ms |

El recorrido `@performance` se activa cuando cambian POS, agenda, analitica o interfaz compartida.
La consolidacion lo ejecuta en Chromium, Firefox y WebKit.

## 6. Observabilidad y correlacion

El proxy acepta un `x-request-id` externo solo si cumple un formato limitado; de lo contrario crea
un UUID. El identificador se envia al servidor y vuelve en la respuesta, incluidos los redirects.

`src/instrumentation.ts` usa el contrato estable `onRequestError` de Next.js para emitir un evento
JSON por error de servidor con fecha, request ID, metodo, pathname sin query string, ruta y tipo de
ejecucion. No registra cuerpo, cookies, parametros, tokens, SQL ni mensaje completo de la excepcion.
El evento puede ser ingerido posteriormente por el proveedor de observabilidad elegido sin volver
a instrumentar la aplicacion.

## 7. Eliminación de scripts históricos

Los scripts manuales heredados fueron retirados al cerrar el programa. Ninguno era consumido por la
aplicación, `package.json` o los workflows, y su propósito ya está cubierto por migraciones
versionadas y ejecutores reproducibles de `scripts/ci` y `scripts/release`. Las reglas para evitar
que reaparezca esta deuda están en `scripts/README.md`.

## 8. Seleccion del pipeline

El detector publica tres alcances adicionales:

- componentes con pruebas de propiedades;
- componentes con objetivos de mutacion;
- componentes que requieren resiliencia PostgreSQL.

Un cambio de `pos-finance` activa propiedades, mutacion, concurrencia y carga. Un cambio de base de
datos activa pgTAP y resiliencia transaccional. Los cambios de tooling y la consolidacion ejecutan
todo. Cada job genera un nombre estable y el informe de mutacion se publica durante 14 dias.

## 9. Como validar la etapa

### Pipeline automatico

1. Confirmar que `Detectar impacto` seleccione todos los componentes por el cambio de tooling.
2. Confirmar `Propiedades - pos-finance` en verde.
3. Confirmar `Mutacion - pos-finance` con 5/5 mutantes eliminados.
4. Descargar `mutation-pos-finance` y revisar JSON y Markdown.
5. Confirmar que el job PostgreSQL reconstruya la base, ejecute pgTAP y luego las suites critica y
   de resiliencia.
6. Confirmar que los cuatro presupuestos `@performance` pasen en Chromium.
7. Confirmar formato, lint, TypeScript, cobertura, seguridad y build.

Despues del PR apilado, ejecutar manualmente `CI` con `full_suite=true`. La consolidacion debe pasar
en Chromium, Firefox y WebKit.

### Validacion funcional manual

1. Abrir Inicio, Agenda, Caja y Analitica y confirmar que cargan normalmente.
2. En DevTools, revisar una respuesta de documento y confirmar un `x-request-id` valido.
3. Crear una venta de producto y comprobar el descuento exacto de stock.
4. Crear dos deudas del mismo cliente y abonar; comprobar distribucion FIFO y saldo final.
5. Revisar que los logs normales no contengan cuerpos, cookies ni datos personales.

## 10. Cierre del programa

La etapa queda aceptada cuando el pipeline vigente y la consolidacion de tres navegadores estan en
verde, los mutantes son eliminados, no hay corrupcion bajo concurrencia y el propietario confirma
la validacion funcional. Entonces esta rama contiene toda la cadena y queda lista para el PR final
contra `main`; ninguna rama intermedia se fusiona por separado.
