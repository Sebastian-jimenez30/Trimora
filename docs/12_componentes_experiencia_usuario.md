# Etapa 06 - Componentes y experiencia de usuario

## Resultado de la fase

La interfaz crítica de Trimora queda cubierta por pruebas de comportamiento ejecutadas en un
entorno de navegador simulado. Las pruebas interactúan como una persona usuaria: buscan controles
por su nombre accesible, escriben, seleccionan, recorren el foco y validan la respuesta visual sin
depender de estados internos de React.

Esta fase no traslada reglas financieras ni operaciones delicadas al navegador. Los componentes
reciben DTO explícitos, recogen la intención del usuario y delegan las mutaciones a Server Actions;
la autoridad sobre precios, deuda, inventario y permisos permanece en la capa de servidor creada en
las etapas anteriores.

## Infraestructura de pruebas

- `@testing-library/user-event` reproduce interacciones de teclado, puntero y formularios.
- `@testing-library/jest-dom` añade aserciones sobre accesibilidad, foco, estado y contenido visible.
- La configuración `jsdom` restaura mocks y limpia el DOM después de cada caso.
- Los reemplazos deterministas de `matchMedia` y `scrollIntoView` permiten cubrir componentes
  adaptables sin depender de API inexistentes en el navegador simulado.
- `src/test/factories.ts` crea datos tipados de analítica, historial y cuentas por cobrar. Cada caso
  modifica únicamente los campos relevantes para su comportamiento.
- Las pruebas viven junto al componente bajo `__tests__`, por lo que el selector puede ejecutar las
  raíces de cada dominio por separado.

## Contrato común de diálogos

`Dialog` concentra el comportamiento que antes estaba repetido entre pantallas:

1. expone `role="dialog"`, `aria-modal` y un nombre accesible;
2. mueve el foco al control marcado con `data-autofocus` o al diálogo;
3. mantiene Tab y Shift+Tab dentro de la ventana;
4. cierra con Escape o al pulsar el fondo cuando la operación lo permite;
5. bloquea el desplazamiento del documento mientras está abierto;
6. devuelve el foco al elemento que abrió la ventana al cerrarse.

El contrato se usa en confirmaciones y en los flujos prioritarios de clientes, inventario,
servicios, agenda, caja y analítica. Los estados de carga pueden impedir un cierre accidental, como
ocurre durante una confirmación destructiva.

## Matriz de comportamientos cubiertos

| Componente                  | Comportamientos automatizados                                                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Caja y por cobrar           | estado sin citas, deuda agrupada por cliente, detalle de movimientos, pago completo, detalle del historial y acceso a edición |
| Agenda                      | búsqueda y selección de cliente sin exponer teléfonos, apertura del formulario y selección libre de hora y minuto             |
| Clientes                    | estado vacío, búsqueda, apertura y foco del formulario, error devuelto por el servidor sin perder los datos                   |
| Inventario                  | estado vacío, búsqueda, tabla adaptable con desplazamiento solo cuando hace falta y foco al crear producto                    |
| Servicios                   | estado vacío, duración exacta escrita por el usuario y listado exclusivo de productos consumibles                             |
| Navegación y notificaciones | opciones según rol, apertura por campana, cierre por campana, Escape y clic exterior                                          |
| Historial de Caja           | detalle accesible, datos del movimiento, transición a edición y campos asociados a sus etiquetas                              |
| Analítica                   | estado vacío, filtros por período, trazabilidad por teclado, conceptos, abonos, carga y recuperación de error                 |
| Diálogos compartidos        | foco inicial, ciclo de Tab, Escape, clic en fondo, restauración de foco y bloqueo durante carga                               |

## Tipos y exposición de datos

Las propiedades que antes aceptaban valores sin contrato ahora usan DTO explícitos:

- Agenda separa citas, clientes, servicios y colaboradores.
- Servicios distingue el catálogo de productos consumibles y los materiales asignados.
- Caja separa servicios, productos, clientes, colaboradores, historial, citas y cuentas por cobrar.
- Navegación define el contenido exacto de una notificación de cita.

Estos DTO contienen únicamente los campos necesarios para presentar cada pantalla. La prueba de
componentes no importa conexiones de base de datos ni credenciales y reemplaza las Server Actions
en el límite del cliente.

## Selección por componente

El grafo conserva la dirección productor-consumidor. Cambiar una pantalla de un dominio ejecuta su
suite y los dominios que dependen de ella. Cambiar `Dialog`, navegación u otro elemento de
`shared-ui` ejecuta además las suites de todas las interfaces consumidoras. Una modificación
aislada de Agenda o Analítica ya no activa `shared-ui` en sentido inverso ni amplía sin necesidad el
resto de las pruebas visuales.

El propio manifiesto y las dependencias de pruebas pertenecen a `tooling`; por seguridad, esta rama
ejecutará la suite completa en el pipeline. Las ramas funcionales posteriores recuperarán la
selección granular definida por el grafo.

## Cómo validar esta fase

### Pipeline

1. Confirmar que formato, lint y TypeScript terminan sin errores.
2. Confirmar que el resumen de impacto clasifica esta rama como cambio de `tooling` y ejecuta el
   conjunto completo.
3. Confirmar que las suites `client` usan `jsdom` y publican cobertura para cada componente.
4. Verificar que las pruebas de `shared-ui` incluyen sus consumidores y que no existen archivos sin
   clasificar.
5. Confirmar que el build de producción finaliza correctamente.

### Recorrido manual

1. Abrir y cerrar los formularios de Cliente, Producto, Servicio y Cita mediante Escape y clic en el
   fondo; comprobar que el foco vuelve al botón que los abrió.
2. Recorrer cada modal con Tab y Shift+Tab y verificar que el foco no llega a controles de la página
   cubierta.
3. En Caja, abrir `Por cobrar`, entrar a un cliente con varios movimientos y comprobar que `Pagar
completo` precarga el total acumulado.
4. En el Historial, abrir una venta, revisar su detalle y entrar a Editar; confirmar que cliente,
   total y método aparecen asociados a sus etiquetas.
5. En Agenda, buscar un cliente por nombre y confirmar que el menú no muestra teléfonos; elegir una
   hora con minutos específicos.
6. En Servicios, escribir una duración no predefinida y confirmar que el selector de materiales solo
   contiene productos registrados como consumibles.
7. Abrir las notificaciones y cerrarlas con la campana, Escape y un clic exterior.
8. En Analítica, cambiar período y segmento, abrir un movimiento con Enter y cerrar su trazabilidad
   con Escape.
9. Repetir los flujos principales con un ancho móvil y uno de escritorio; en escritorio, confirmar
   que las acciones importantes permanecen visibles sin desplazamiento horizontal de toda la
   página.

## Resultado esperado y casos negativos

- Un error de Server Action se muestra y el modal permanece abierto para corregir o reintentar.
- Un diálogo en estado de carga no se cierra por Escape ni permite repetir la acción.
- Una persona sin rol administrativo no ve las opciones exclusivas de administración.
- No aparecen citas pendientes, cuentas por cobrar ni filas históricas ficticias cuando las listas
  están vacías.
- Ningún formulario de cliente presenta el teléfono como parte del texto de selección.
- El foco nunca queda perdido en el documento después de cerrar una ventana.

No se ejecutaron pruebas, lint, TypeScript ni build localmente. La evidencia automática de esta
fase será exclusivamente la publicada por el pipeline; la fase se acepta cuando dicho pipeline
esté verde y el propietario confirme el recorrido manual aplicable.
