# Revisión del proyecto

El repositorio original tenía una aplicación web de un solo HTML, un plan fijo y almacenamiento local. La interacción de completar serie e iniciar descanso era su punto fuerte.

## Problemas detectados y cambios aplicados

| Antes | Ahora |
| --- | --- |
| Una carga por ejercicio, sin repeticiones reales | Peso y repeticiones por serie, sesiones independientes |
| Importar una rutina borraba todo el progreso | Importación validada que conserva el historial |
| Seguimiento exportado mediante un gesto oculto | Exportaciones visibles de rutina, seguimiento y copia completa |
| Gráfico limitado a cargas y los últimos diez registros | Carga, volumen y 1RM estimado, filtros y tabla de datos |
| Días asociados a marcas de serie persistentes | Sesiones con fecha, duración, notas y restauración tras recargar |
| Temporizador decrementado por intervalos | Hora de finalización persistida y recálculo al volver a la app |
| Interfaz con muchas superficies y colores | Jerarquía compacta, temas claro/oscuro, acento cálido y navegación móvil |
| Sin editor de rutina | Edición de días, ejercicios, series objetivo, descansos y grupos musculares |
| Sin plantillas para elegir | Full body 2/3 días, torso/pierna 4 y push/pull/legs 3/6, revisables y editables |
| Sin distinguir carga de dos mancuernas | Peso individual, volumen de ambas y marcas separadas según el modo de registro |
| Sin opción de empezar un historial nuevo | Borrado con confirmación, cancelación y copia exportable antes de borrar |
| Sin resúmenes exportables | PNG transparente, tarjeta o foto; sesión, carga destacada y semana con fecha y @usuario |
| Importación mezclaba sin contexto | Consulta temporal del seguimiento de un cliente o amigo sin mezclarlo |
| Caché dependía de una fuente externa y borraba otras cachés | Archivos locales completos y limpieza limitada a cachés de esta app |

## Decisiones de producto

El producto sigue centrado en entrenar, registrar y comparar. Conserva el plan original sin presentarlo como un plan personalizado para todos. No incorpora nutrición, IA, suscripciones, cuentas de entrenador ni almacenamiento remoto en esta fase.

La estética utiliza un fondo oscuro, texto legible y un acento dorado suave, con alternativa clara. Las transiciones se limitan a cambios de página, paneles y respuesta de los controles; los datos y el reloj permanecen quietos. Se respetan las preferencias de movimiento reducido y el foco de teclado.

## Siguiente validación

Probar con el iPhone y con dos o tres amigos: registrar una sesión real, recuperar el descanso al cambiar de app, exportar un seguimiento, consultar un archivo ajeno y colocar un PNG en una historia. Los PNG de ejemplo de `.test-output` usan datos de prueba; las capturas muestran la vista previa local. Las características para App Store y monetización se pueden definir después de esa prueba.

## Pulido visual de Repite

La segunda revisión conserva composición, información y navegación. Refuerza ligeramente superficies y bordes, sube el contraste del texto tenue, unifica controles táctiles en 44 px y aumenta las etiquetas pequeñas a 11 px. La pestaña móvil activa tiene una placa discreta y los paneles utilizan una curva de entrada más natural.

Las transiciones de página duran 200 ms; completar una serie dibuja el check en 160 ms y actualiza la barra en 200 ms. El temporizador aparece y se retira con una transición de 220 ms. No hay efectos continuos ni animación de cifras. Cambiar el tema conserva el formulario de perfil sin guardar. Se comprueban navegación rápida, teclado, movimiento reducido y navegadores sin soporte de animaciones.

El detector de Impeccable se ejecutó una vez. Se corrigieron las etiquetas pequeñas. Sus avisos de contraste mezclaban los tokens de impresión (`@media print`) con superficies oscuras: se revisaron las parejas de los dos temas por separado. Los bordes y sombras de los diálogos y el temporizador se conservan como límite y elevación de paneles superpuestos, dentro del diseño existente.
