# Detalles Técnicos por Módulo y Componente

Esta sección desglosa rigurosamente la implementación técnica de la plataforma Trimora, examinando cada módulo y componente fundamental. Al estar basado en Next.js (App Router), el sistema separa responsabilidades entre Server Components (RSC), Client Components y Server Actions.

## 1. Módulo POS (Punto de Venta) y Finanzas

El módulo POS es el corazón de las operaciones de cierre y cobro. Gestiona transacciones financieras y desencadena actualizaciones en el inventario.

### Acciones de Servidor (`src/modules/pos/actions.ts`)

*   **`processSale(cart, clientId, paymentMethod, appointmentId, initialPaidAmount, initialPaymentMethod)`**
    *   **Propósito:** Procesa una venta que puede contener productos y/o servicios.
    *   **Casos de Uso Soportados:** Ventas directas, ventas provenientes de citas, ventas a crédito (fiados) con o sin abono inicial.
    *   **Manejo de Transacciones (DB):**
        1.  Valida la sesión y obtiene el `organization_id` usando `@supabase/ssr`.
        2.  Calcula el monto total a partir del carrito.
        3.  Para ventas a crédito, verifica que exista un `clientId` asignado.
        4.  Inserta el registro principal en la tabla `transactions` (Estado `PENDING` o `COMPLETED`).
        5.  Si es un crédito con abono, inserta en `transaction_payments`.
        6.  Itera sobre los elementos del carrito e inserta en `transaction_items`.
    *   **Lógica de Negocio Crítica (Inventario):**
        *   Si el item es un `PRODUCT`: Resta la cantidad vendida del `currentStock` en la tabla `products` e inserta el registro histórico en `inventory_movements` (tipo `OUT`).
        *   Si el item es un `SERVICE`: Busca en la tabla relacional `service_materials` los productos asociados (insumos). Por cada insumo, multiplica la cantidad del insumo por la cantidad de servicios vendidos, resta ese total del `currentStock` e inserta el `inventory_movements`.
    *   **Lógica de Citas:** Si la venta proviene de una cita (`appointmentId`), actualiza la tabla `appointments` a estado `COMPLETED`.

## 2. Módulo de Agenda (Citas)

Administra el recurso más valioso de un negocio de servicios: el tiempo.

### Acciones de Servidor (`src/modules/agenda/actions.ts`)

*   **`createAppointment(data)`**
    *   **Propósito:** Reserva un bloque de tiempo.
    *   **Detalle:** Relaciona `clientId`, `staffId` (organization_member) y `serviceId`. Registra `startTime` y calcula `endTime` basado en el `duration_minutes` del servicio. 
*   **`updateAppointmentStatus(id, newStatus)`**
    *   **Propósito:** Cambia el estado de una cita (`PENDING`, `CONFIRMED`, `CANCELLED`).
    *   **Nota:** Si el estado es `COMPLETED`, típicamente se maneja desde el POS para asegurar el cobro.

## 3. Módulo de Autenticación y SaaS Core

El acceso al sistema y la tenencia de datos están estrictamente controlados.

### Integración Supabase (`src/core/database/admin.ts` y Auth)

*   **`supabaseAdmin` (Service Role):** Se provee una instancia de cliente Supabase con la llave maestra *solo para uso del lado del servidor* (acciones críticas como crear usuarios). Nunca se expone al cliente.
*   **Middleware (`src/middleware.ts` / Next.js Auth):** Verifica la existencia de una sesión de usuario válida. Si el usuario intenta acceder al `/(dashboard)` sin sesión, es redirigido a `/login`.
*   **Multi-tenant (Filtrado de Organización):** Cada acción de lectura o escritura en el servidor (ej. `getOrganizationId()`) extrae el ID de la organización desde los metadatos del JWT del usuario `user.user_metadata?.organization_id`. Todas las consultas a Drizzle incluyen el filtro `where(eq(table.organizationId, orgId))`.

## 4. Módulo de Inventario

Maneja el ciclo de vida de los productos (Venta y Consumo).

### Acciones Críticas (`inventory/actions.ts`)

*   **`adjustInventory(productId, adjustmentType, quantity, notes)`**
    *   **Propósito:** Permite correcciones manuales del stock.
    *   **Detalle:** Recibe el tipo de ajuste (`IN` o `OUT`), calcula el nuevo stock y lo guarda atómicamente, dejando siempre un rastro en `inventory_movements`.

## 5. UI y Componentes Globales (`src/components/`)

Los componentes de interfaz (Client Components) aseguran reactividad y UX interactiva.

*   **`FeaturesCarousel` (`src/components/FeaturesCarousel.tsx`):** Un componente animado que se renderiza en la *Landing Page*. Expone visualmente el valor del ecosistema (Agenda, Clientela, Cobros, IA) usando tarjetas que transicionan en carrusel. No interactúa con la DB, es puramente presentacional.
*   **`DashboardNavigation` (`src/components/layout/DashboardNavigation.tsx`):** Gestiona la barra lateral y superior del sistema interno. Incluye lógica de enrutamiento y verificación de roles para mostrar/ocultar opciones del menú (ej. Ocultar reportes financieros a un Rol de Barbero).
