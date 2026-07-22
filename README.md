# Trimora - Plataforma SaaS de Gestión Administrativa y Financiera

Bienvenido al repositorio oficial de Trimora. Trimora es una plataforma integral de gestión administrativa (SaaS/ERP/CRM) diseñada arquitectónicamente para modernizar las operaciones de negocios orientados a servicios. Aunque está abierta a cualquier establecimiento que requiera trazabilidad administrativa, Trimora se enfoca primordialmente en resolver los vacíos tecnológicos de barberías tradicionales, especialmente aquellas ubicadas en ciudades intermedias y regiones descentralizadas que aún dependen de métodos analógicos.

El objetivo central del sistema es erradicar los silos de información bajo una filosofía central: "Todo Conectado, Todo en Armonía", permitiendo a los dueños de negocios enfocar su tiempo en prestar servicios de calidad en lugar de conciliar hojas de cálculo.

## Capacidades y Módulos Principales

Trimora es una plataforma Multi-tenant, lo que significa que su arquitectura de base de datos y backend soporta el aislamiento seguro de cientos de barberías concurrentes (organizaciones), permitiendo administrar múltiples negocios de manera independiente desde una sola instancia central de software.

Las funcionalidades principales del sistema incluyen:

### Autenticación y Administración Segura
*   Autenticación robusta que incluye inicio de sesión tradicional (correo/contraseña), recuperación de contraseñas y verificación de correo electrónico.
*   Integración con Google OAuth para acceso rápido y sin fricciones.
*   Panel de Superadministración para gestión total de la base de datos y la creación y aprovisionamiento de nuevas organizaciones (barberías) clientes.
*   Sistema de invitación por correo electrónico (mediante SendGrid) para agregar colaboradores (ej. barberos, recepcionistas) a una organización específica.

### Operaciones e Inteligencia Artificial
*   Asistente de Inteligencia Artificial (Chatbot) integrado capaz de procesar lenguaje natural. Este agente actúa de forma tanto informativa (ej. consultando servicios) como operativa (ej. ejecutando agendamientos de citas de forma automatizada).
*   Gestión avanzada de Agenda y Citas, con asignación estructurada de clientes, servicios y colaboradores, y un sistema de notificaciones para recordar y asegurar el cobro de los servicios prestados.
*   Gestión de Clientes (CRM) para trazabilidad completa del ciclo de vida, ticket promedio e historial del consumidor.

### Gestión de Catálogo e Inventario
*   Módulo completo (CRUD) para administrar Servicios (con precio y duración) e Inventario de Productos.
*   Clasificación de inventario entre "Productos para la venta" e "Insumos de consumo interno".
*   Capacidad de importación masiva de inventario inicial a través de archivos o reconocimiento fotográfico.
*   Automatización de deducción de stock: Al completar y cobrar un servicio en caja, el sistema descuenta automáticamente los insumos utilizados según la formulación del servicio.

### Punto de Venta (POS) y Flujo de Caja
*   Caja centralizada para procesar servicios, productos adicionales e impuestos en una sola transacción.
*   Sistema integral de préstamos ("fiados") que soporta pagos y abonos parciales, manteniendo la deuda de cada cliente trazable a lo largo del tiempo.
*   Generación automática de facturas y tickets de venta.
*   Generación de reportes y resúmenes financieros diarios para un análisis profundo del rendimiento económico del negocio.

## Stack Tecnológico

El ecosistema de Trimora está construido sobre tecnologías de vanguardia enfocadas en rendimiento, escalabilidad y tipado estricto:

*   **Frontend y Backend:** Next.js (App Router), React 19 y Server Actions para manejo seguro de mutaciones.
*   **Interfaz de Usuario:** Tailwind CSS v4 para diseño atómico moderno.
*   **Base de Datos y Autenticación:** Supabase (PostgreSQL) garantizando políticas estrictas de Row Level Security (RLS) para la arquitectura Multi-tenant.
*   **ORM:** Drizzle ORM para consultas fuertemente tipadas e inferencia de esquemas.
*   **Inteligencia Artificial:** Vercel AI SDK para la orquestación del chatbot de lenguaje natural (con soporte para proveedores como OpenAI, Google, Groq).

## Documentación Técnica Interna

Hemos elaborado una documentación técnica exhaustiva para facilitar el desarrollo, el análisis arquitectónico y el entendimiento funcional de la plataforma. La documentación se encuentra estructurada en la carpeta `/docs`:

1. [Visión General y Definición del Problema](docs/01_overview.md): Contexto comercial, el problema analógico que resolvemos y el flujo de valor.
2. [Requerimientos y Casos de Uso](docs/02_requirements_and_use_cases.md): Historias de usuario, requerimientos funcionales/no funcionales detallados (IA, POS, etc.) y flujos operativos críticos.
3. [Arquitectura del Sistema](docs/03_architecture.md): Diagramas (Mermaid) modelando la base de datos, arquitectura de servidor y secuencias operativas.
4. [Detalles Técnicos y Componentes](docs/04_technical_details.md): Desglose técnico de la implementación de Server Actions, manejo de base de datos e integraciones de los módulos críticos.

## Despliegue Local (Getting Started)

Para inicializar el proyecto en un entorno de desarrollo local:

1. Clonar el repositorio e instalar las dependencias:
   ```bash
   npm install
   ```

2. Configurar las variables de entorno basándose en el archivo `.env.local` (Es imperativo contar con credenciales activas de Supabase y cualquier API Key de IA configurada).

3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

El aplicativo estará disponible navegando a http://localhost:3000.
