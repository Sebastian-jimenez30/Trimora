# Etapa 05 - Dominio critico e integracion

## Resultado de la fase

Las reglas financieras y operativas criticas quedan concentradas en servicios `server-only`. Las
Server Actions autentican al actor, validan el contrato de entrada y delegan la operacion; el
navegador no calcula precios confiables, saldos, descuentos de inventario ni distribuciones de
abonos.

## Invariantes implementadas

- El precio de productos y servicios siempre se vuelve a leer del catalogo de la organizacion.
- Una venta persiste la transaccion, todos los items, abonos iniciales, inventario y cita en una
  sola transaccion PostgreSQL.
- Los productos afectados se agregan y bloquean por UUID en orden estable antes de descontar
  stock. Esto cubre productos vendidos y consumibles de servicios sin dejar existencias negativas.
- Los importes se calculan como centavos enteros y los consumibles como unidades de cuatro
  decimales.
- Un credito exige cliente. Los abonos negativos, nulos o superiores al saldo se rechazan.
- Los abonos por cliente se asignan por FIFO con bloqueo de filas. La fecha del movimiento es la
  fecha real del ingreso, no la fecha de la venta ni de la cita.
- Gastos y su auditoria se crean atomicamente.
- Editar o eliminar una venta actualiza el total gastado derivado del cliente. Eliminarla restaura
  exactamente el inventario vinculado.
- Cambiar la duracion de un servicio actualiza las citas pendientes y confirmadas dentro de la
  misma transaccion. El algoritmo de carriles vuelve a distribuir las citas segun sus intervalos
  efectivos.
- El CSV mantiene `Total_Tx` como total original y `Abonado_Tx` como efectivo del movimiento.
- El cursor de caja usa fecha y una clave global con origen, por lo que mantiene un orden total
  entre transacciones y abonos.

## Migracion `0006_critical_domain_integrity.sql`

La migracion es acumulativa y no elimina datos de negocio. Realiza cuatro acciones:

1. agrega `inventory_movements.transaction_id` e intenta recuperar el vinculo historico a partir
   de las notas generadas por versiones anteriores;
2. agrega claves foraneas e indices para que un movimiento solo apunte a una transaccion de la
   misma organizacion;
3. reconstruye `clients.total_spent` desde las ventas existentes no reembolsadas;
4. instala un trigger que mantiene ese total frente a inserciones, ediciones, movimientos entre
   clientes, reembolsos y eliminaciones.

Antes de aplicarla en un entorno con datos reales se conserva la regla de despliegue de la etapa
03: respaldo verificable, auditoria de la tabla de migraciones y ensayo previo sobre una copia o
staging. No se debe usar `supabase db reset` contra una base enlazada o de produccion.

## Pruebas seleccionadas por componente

Las pruebas rapidas siguen el grafo de `ci/components.json`:

- `pos-finance`: centavos, CSV y contratos financieros;
- `agenda-appointments`: intervalos y carriles simultaneos;
- `analytics`: periodos de America/Bogota;
- `database`: pgTAP para claves, triggers y reconciliacion.

Cuando cambia base de datos, el job aislado levanta Supabase local, reconstruye una base vacia,
ejecuta pgTAP y luego corre la integracion transaccional de Vitest contra PostgreSQL real. Esta
suite prueba ventas multiples, consumibles, rollback inyectado, FIFO, fecha efectiva, concurrencia,
restauracion al eliminar, duracion de citas y paginacion sin duplicados.

## Como validar esta fase

1. Publicar la rama y esperar los jobs seleccionados por impacto.
2. Confirmar que `Migraciones, RLS e integridad PostgreSQL` complete tanto pgTAP como la prueba de
   integracion transaccional.
3. Descargar los artefactos de cobertura de POS, inventario, agenda, clientes y analitica.
4. En un entorno de prueba, registrar una venta multiple con producto y servicio consumible.
5. Crear dos deudas para un cliente y abonar un valor que cubra completamente la primera y parte
   de la segunda; comprobar la hora real en historial.
6. Editar la duracion de un servicio con citas futuras simultaneas y confirmar la redistribucion.
7. Exportar el periodo y comprobar que una fila de abono parcial conserva total original y efectivo
   del movimiento en columnas distintas.

La fase se acepta solo cuando el pipeline esta verde y el propietario confirma estas verificaciones.
