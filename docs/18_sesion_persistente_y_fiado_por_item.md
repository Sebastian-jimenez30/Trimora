# Sesión persistente y fiado por ítem

## Resultado

Trimora conserva la sesión administrativa mientras Supabase pueda renovarla. La aplicación ya no
cierra al usuario por diez minutos de inactividad; el cierre ocurre por acción explícita, borrado de
cookies, revocación o expiración definida por el proveedor de identidad.

El agendamiento público de las etapas 01 a 03 permanece implementado, apagado por bandera y sin
accesos visibles desde la navegación administrativa. Sus rutas y estructuras no fueron eliminadas.

## Venta y deuda

Una compra mixta continúa siendo una sola transacción. Cada servicio o producto conserva su
subtotal y puede quedar pagado, parcialmente pagado o fiado. El dinero recibido sigue registrándose
en `transaction_payments` con su fecha real y se distribuye mediante
`transaction_payment_allocations` entre los registros de `transaction_items`.

```text
transactions
  |-- transaction_items
  |-- transaction_payments
        |-- transaction_payment_allocations --> transaction_items
```

`transactions.total_amount`, `transactions.paid_amount` y `transactions.status` siguen siendo los
agregados compatibles con Caja, Analítica, recibos y exportaciones. El inventario se descuenta por
la venta realizada, independientemente del saldo pendiente.

## Cuentas por cobrar

- La pantalla principal agrupa la deuda por cliente.
- El detalle presenta directamente los servicios y productos pendientes, sin agruparlos
  visualmente por movimiento.
- Cada concepto permite abonar o pagar completamente; internamente conserva la transacción y el
  `transaction_item` que le dieron origen.
- El cliente completo permite pagar toda su deuda.
- Los pagos y las transacciones se bloquean en un orden estable para impedir sobrepagos
  concurrentes.

Los abonos generales de toda la cuenta se distribuyen primero entre los movimientos más antiguos.
Dentro de cada movimiento se aplican a los conceptos pendientes en orden estable, salvo que la
interfaz envíe una distribución explícita.

## Experiencia de venta fiada

Al elegir **Fiado**, cada concepto ofrece dos estados reversibles antes de confirmar la venta:

- **Pago** cubre el subtotal completo, oculta el campo de monto y atenúa visualmente el concepto.
- **Abono** muestra el campo y exige un valor mayor que cero y menor que el subtotal.
- Sin seleccionar ninguna opción, el concepto queda completamente pendiente.

Cambiar entre ambos estados no registra dinero ni modifica inventario. La operación contable se
crea una sola vez al pulsar **Cobrar**.

## Compatibilidad histórica

La migración es exclusivamente aditiva: no actualiza, elimina ni reconstruye transacciones,
pagos, ítems, clientes o inventario existentes. Cuando un movimiento anterior tenía un abono pero
no registraba su distribución por concepto, se conserva el total contable y la interfaz informa que
ese detalle histórico no estaba disponible.

## Migración

La migración `20260821013459_itemized_payment_allocations.sql`:

- agrega claves compuestas para validar que pago e ítem pertenezcan a la misma transacción;
- crea `transaction_payment_allocations` con monto positivo, claves foráneas e índices;
- habilita y fuerza RLS;
- revoca acceso directo de `anon` y `authenticated`;
- no contiene operaciones destructivas ni transformaciones de datos anteriores.

Antes de aplicarla se debe ejecutar `npx supabase db push --linked --dry-run` y confirmar que sea la
única migración pendiente. Después del `db push`, un segundo `dry-run` debe responder que la base
remota está actualizada.

## Pruebas manuales

1. Iniciar sesión, dejar el navegador inactivo más de diez minutos y confirmar que sigue abierto.
2. Cerrar sesión manualmente y confirmar que las rutas administrativas vuelven a exigir acceso.
3. Crear una venta con un servicio y dos productos; pagar el servicio, abonar un producto y fiar el
   otro.
4. Confirmar una sola transacción, tres conceptos y el saldo exacto en **Caja > Por cobrar**.
5. Abrir **Por cobrar**, confirmar que se ven productos y servicios sin tarjetas de movimientos y
   abonar a un solo concepto.
6. Pagar completamente otro concepto y confirmar que los demás no cambien.
7. Pagar toda la deuda del cliente y confirmar que desaparezca de **Por cobrar**.
8. Revisar Historial, recibo, inventario, total gastado del cliente y Analítica.
9. Abrir un movimiento histórico con abonos y confirmar que mantiene sus cifras originales.
