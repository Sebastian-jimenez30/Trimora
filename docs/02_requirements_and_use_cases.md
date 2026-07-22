# Requerimientos, Historias de Usuario y Casos de Uso

Este documento detalla exhaustivamente el levantamiento de requerimientos del sistema, evidenciando funcionalidad por funcionalidad según la arquitectura actual. Trimora está diseñado como un SaaS (Software as a Service) Multi-tenant, lo que significa que su arquitectura base permite prestar el servicio a múltiples barberías/organizaciones de forma simultánea y aislada, no limitándose a un uso único.

## 1. Requerimientos Funcionales

Las siguientes son las funcionalidades explícitas que el sistema Trimora ejecuta y soporta:

### 1.1 Autenticación y Autorización
*   **Login Tradicional:** Inicio de sesión mediante correo y contraseña.
*   **Recuperación y Verificación:** Sistema de recuperación de contraseñas y verificación de correo electrónico.
*   **Google OAuth:** Botón para ingresar rápidamente utilizando cuentas de Google.
*   **Multi-tenant (SaaS):** Aislamiento de datos; un usuario pertenece a una Organización (barbería) y solo ve los datos de dicha organización.

### 1.2 Superadministración y Gestión de Organizaciones
*   **Gestión SaaS:** El perfil "Superadmin" tiene manejo total sobre la base de datos global.
*   **Creación de Organizaciones:** Capacidad de registrar y aprovisionar nuevas barberías (entidades) en el sistema de manera independiente.
*   **Sistema de Invitaciones:** Módulo para invitar a trabajadores (barberos, recepcionistas) vía correo electrónico mediante tokens seguros.

### 1.3 Catálogo (Servicios e Inventario)
*   **Operaciones CRUD de Servicios:** Crear, listar, actualizar y eliminar servicios (ej. Corte, Barba), especificando duración y precio.
*   **Operaciones CRUD de Productos:** Gestión de stock físico, precios de venta y costo.
*   **Importación Masiva:** Funcionalidad para importar productos al inventario desde archivos o lectura de foto, facilitando la adopción inicial del negocio.

### 1.4 Agenda y Citas
*   **Manejo de Citas:** Agendamiento de clientes asignándoles un servicio, una hora específica y un colaborador (barbero).
*   **Sistema de Notificaciones:** Avisos y notificaciones visuales/alertas diseñadas para recordar o forzar el cobro de los servicios agendados una vez completados.

### 1.5 Punto de Venta (Caja) y Finanzas
*   **Manejo de Caja (POS):** Interfaz para procesar cobros de servicios y productos simultáneamente.
*   **Generación de Facturas:** Emisión de comprobantes (tickets/facturas) tras una transacción exitosa.
*   **Sistema de Préstamos y Cobros Parciales ("Fiados"):** Capacidad para registrar una venta a crédito, permitiendo recibir abonos parciales, manteniendo la deuda trazable.
*   **Resumen Financiero:** Generación de tableros (dashboards) y resúmenes con ingresos, métodos de pago y métricas diarias.

### 1.6 Inteligencia Artificial y Automatización
*   **Descuento Automático en Inventario:** Al concretar una venta (servicio), el sistema revisa la receta del servicio (`service_materials`) y descuenta los insumos gastados del inventario general de forma automática.
*   **Chatbot de IA Operativo e Informativo:** Un asistente inteligente integrado que entiende lenguaje natural. Puede responder consultas (ej. "cuáles son los servicios") e invocar operaciones reales en el sistema (ej. "agendar un corte para el viernes a las 3pm"), funcionando como un agente de recepción virtual.
*   **Envío de Correos:** Integración con proveedores (SendGrid) para envío de notificaciones transaccionales a usuarios.

---

## 2. Requerimientos No Funcionales

*   **Seguridad:** Los datos deben estar protegidos por políticas de seguridad a nivel de fila (RLS en Supabase) asegurando que ninguna barbería pueda acceder a los datos de otra (aislamiento Multi-tenant).
*   **Escalabilidad:** La base de datos relacional (PostgreSQL) y el backend serverless (Next.js Actions) deben soportar el alta de cientos de organizaciones concurrentes.
*   **Disponibilidad:** El chatbot y el módulo de agenda deben estar operativos 24/7 para que los clientes finales puedan interactuar.

---

## 3. Historias de Usuario Críticas

*   **Como Superadmin**, quiero crear una nueva organización en la base de datos para darle servicio a una nueva barbería cliente.
*   **Como Dueño (Admin)**, quiero iniciar sesión con mi cuenta de Google para acceder más rápido.
*   **Como Dueño (Admin)**, quiero invitar a un barbero por correo electrónico para que se una a mi organización.
*   **Como Administrador**, quiero importar mi inventario inicial usando un archivo/foto para no cargar cientos de productos manualmente.
*   **Como Recepcionista**, quiero agendar una cita y que el sistema me notifique cuando sea hora de cobrarla.
*   **Como Recepcionista**, quiero fiar un servicio (crédito) y registrar un abono parcial, para cobrar el resto después.
*   **Como Dueño (Admin)**, quiero ver un resumen financiero autogenerado para entender cómo le fue a mi caja hoy, e imprimir la factura de una transacción.
*   **Como Cliente Final**, quiero hablar con el Chatbot de IA usando lenguaje natural para que me agende una cita sin necesidad de descargar una app.

---

## 4. Casos de Uso (Flujos Principales Evidenciados)

### CU-01: Incorporación (Onboarding) y Acceso SaaS
1. Superadmin aprovisiona la organización, o el dueño se registra directamente.
2. El dueño usa el login clásico (con recuperación de contraseña vía email) o el inicio rápido mediante Google Auth.
3. El dueño usa el sistema de invitación por correo (integración SendGrid) enviando un token al trabajador.
4. El trabajador hace clic en el link del correo, se registra y queda asociado automáticamente a la organización.

### CU-02: Agendamiento Asistido por Inteligencia Artificial
1. El cliente (o usuario interno) abre el chat de IA.
2. Escribe en lenguaje natural: "Quiero un corte de cabello mañana a las 10 am".
3. El agente de IA interpreta la intención, valida el catálogo de servicios (informativo) y ejecuta la herramienta (`agendar_cita` tool).
4. La base de datos registra la cita y el sistema notifica el éxito de la operación.

### CU-03: Facturación, Fiados y Descuentos de Inventario (POS)
1. Recepcionista selecciona una cita completada para facturar.
2. El cliente decide que pagará una parte en efectivo y el resto quedará pendiente (Cobro Parcial / Fiado).
3. El sistema registra la transacción (`transactions`) y los pagos iniciales (`transaction_payments`).
4. **Trigger Automático:** El sistema lee qué servicio se hizo, busca qué productos consume (ej. gel, hojillas), y descuenta exactamente esa cantidad del inventario de forma automática.
5. Se genera la factura final para el cliente y el resumen financiero del dueño se actualiza en tiempo real.

### CU-04: Gestión Rápida de Inventario (Importación)
1. El usuario accede al módulo de inventario.
2. Selecciona la opción de importación masiva subiendo un archivo o captura fotográfica.
3. El sistema procesa los datos, ejecuta un CRUD masivo y la barbería queda con su stock cargado inmediatamente.
