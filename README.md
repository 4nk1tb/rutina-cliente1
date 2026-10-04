# Repite

Aplicación de entrenamiento para uso personal y entre amigos. Es una web instalable, con datos guardados en el dispositivo y sin servicios de pago, cuentas obligatorias ni APIs externas.

## Arrancar en local

Necesitas Node.js 24 o una versión compatible con los comandos de prueba. No hay dependencias que instalar.

```sh
npm run dev
```

Abre http://127.0.0.1:4173. Para comprobar el diseño desde un teléfono de la misma red, ejecuta `npm run dev -- --host` y abre la IP local del ordenador, puerto 4173. Algunas funciones del navegador, como instalar, compartir archivos y escribir PNG en el portapapeles, necesitan HTTPS o localhost. Para el uso en iPhone, utiliza la web publicada con HTTPS y Safari → Compartir → Añadir a pantalla de inicio.

## Publicar en GitHub Pages

La app se sirve directamente, sin compilación. En **Settings → Pages**, selecciona **Deploy from a branch**, la rama **main** y **/(root)**. El archivo `.nojekyll` evita el procesamiento de Jekyll. Al subir cambios a esa rama, GitHub publica la nueva versión.

La dirección de este repositorio es `https://4nk1tb.github.io/rutina-cliente1/`. Las rutas y el service worker funcionan dentro de ese subdirectorio. La publicación debe finalizar correctamente antes de utilizar el enlace.

Para trasladar los datos de la vista previa local a la web publicada, exporta una **Copia completa** desde Perfil e impórtala en la nueva dirección. Cada navegador y origen conserva sus propios datos.

## Entrenar

La primera visita ofrece **Tutorial rápido** (4 pasos), **Guía detallada** (7 pasos) o **Entrar sin guía**. La elección o el cierre se recuerdan en ese navegador; las actualizaciones no fuerzan el recorrido a usuarios con datos anteriores. Desde **Perfil → Guías de Repite** puedes repetir cualquiera de los dos.

El recorrido abre las pantallas reales y resalta sus controles con explicaciones breves. No inicia sesiones ni modifica rutina, historial o temporizador de entrenamiento. Si aún no hay registros, explica dónde aparecerán. Puedes avanzar, retroceder o salir; al tocar un control de la app sales de la guía para utilizarlo. La guía completa también señala el inicio de sesión, el @usuario y las copias locales.

1. Selecciona un día y pulsa **Empezar entrenamiento**.
2. Registra peso y repeticiones por serie. Se muestran las series del entrenamiento anterior como referencia. Se admite 0 kg para ejercicios sin carga externa.
3. Pulsa el botón de completar: comienza automáticamente el descanso. Puedes añadir 30 segundos, terminar el descanso o añadir y quitar series.
   La siguiente serie se prepara con el mismo peso y repeticiones. Los campos que ya hayas editado, incluso si los borraste, se conservan. Al empezar un entrenamiento se sugieren los datos de la última sesión del mismo ejercicio y modo de peso; sin historial, los introduces una vez.
4. **Terminar sesión** permite revisar y guardar duración, series, volumen y récords. Solo cuentan las series completadas.
5. La sesión queda en Historial y se abre el editor de imagen. Elige una foto opcional, un PNG transparente o una tarjeta redondeada; guarda, copia o comparte la imagen según el soporte del navegador.
   En iPhone/iPad, **Guardar imagen** abre el menú del sistema: elige **Guardar imagen** para añadirla a Fotos. La web no puede escoger Fotos ni confirmar ese destino automáticamente. Si no se pueden compartir archivos, el PNG se descarga; si el menú falla, aparece **Descargar PNG** como alternativa. En escritorio se descarga directamente.

## Rutina y progreso

- Crea y edita días y ejercicios desde Rutina, importa una rutina de un entrenador o utiliza el plan original del repositorio. Cambiar el plan conserva el historial.
- Puedes revisar y elegir plantillas editables: full body de 2 o 3 días, torso/pierna de 4 y push/pull/legs de 3 o 6 días.
- Con dos mancuernas introduces el peso de una. El volumen cuenta ambas, y carga, récords y 1RM se muestran por mancuerna. Una sola mancuerna, una barra o una máquina utilizan carga total. Puedes elegir el modo en el editor; el historial mantiene el modo con el que se registró y no compara marcas entre modos distintos.
- Peso máximo, volumen y 1RM aproximado se calculan por ejercicio. Epley se aplica a series de 1–12 repeticiones; una repetición utiliza el peso real. Es una estimación, no una marca medida.
- Los récords comparan sesiones anteriores del mismo ejercicio. La primera sesión establece la referencia.
- Durante el entrenamiento y en Progreso se compara la mejor serie con la última sesión del mismo ejercicio y modo de peso. Con la misma carga se muestra el cambio de repeticiones; con las mismas repeticiones, el cambio de carga. Si cambian ambas, se muestran los dos resultados sin afirmar una mejora. Los registros antiguos sin repeticiones no generan comparaciones inventadas.
- Al superar un récord de carga o de 1RM estimado aparece un aviso breve y una insignia. El descanso empieza primero; desmarcar y volver a completar no repite la celebración. La insignia desaparece si se desmarca la serie que sostenía el récord.
- El resumen semanal cuenta días reales del calendario local. Las siluetas resaltan el grupo muscular principal indicado en los ejercicios realizados; los registros sin grupo se conservan sin inventarlo.
- Los temas oscuro y claro se eligen en Perfil o con el botón del encabezado.
- El @usuario guardado en Perfil se usa por defecto en los PNG, junto con la fecha del entrenamiento.

## Intercambio de datos

En Perfil puedes exportar **Solo la rutina**, **Seguimiento y progresión** o **Copia completa**. Los archivos JSON tienen versión y se validan antes de importar. La fusión conserva sesiones distintas y evita duplicar importaciones repetidas.

Al abrir un seguimiento, **Ver sin mezclar** permite revisar las gráficas y sesiones de un cliente o amigo sin añadirlo a tus datos. Esta consulta es temporal: conserva el archivo para volver a abrirlo.

La app recupera la rutina y las cargas guardadas por la versión anterior (`customRoutineData` y `rutina-fuerza-elegante-v7-final`) cuando se abre en el mismo navegador y origen. También importa sus archivos JSON antiguos. Esos registros no tenían repeticiones ni sesiones completas: se mantienen como cargas antiguas y no se inventan volumen ni 1RM. Las claves originales se conservan; una fuente corrupta se copia para recuperación antes de guardar nuevos datos.

Los datos no se sincronizan entre dispositivos. Exporta una copia completa para trasladarlos o recuperarlos. Las fotos elegidas se procesan localmente y no se almacenan en el historial.

En Perfil, **Borrar todo mi historial** abre una confirmación con **Cancelar**, **Exportar copia antes** y **Sí, borrar mi historial**. Elimina sesiones, cargas antiguas y copias de recuperación del navegador. Conserva rutina, perfil y sesión en curso. Para recuperar el historial después necesitas una copia exportada.

## Desarrollo y comprobaciones

```sh
npm test
```

La lógica está separada en `data.js` (migración, cálculos e intercambio), `app.js` (interfaz), `share.js` (PNG), `default-routine.js` (plan original) y `routine-templates.js` (plantillas). No hay compilación ni bibliotecas de interfaz. Los diálogos utilizan el elemento nativo `dialog`.

`motion.js` coordina transiciones breves de navegación y la respuesta al completar series mediante Web Animations API. Los datos y el temporizador se actualizan antes del efecto visual. Cambios rápidos cancelan animaciones anteriores; el teclado funciona de forma inmediata y movimiento reducido utiliza solo fundidos suaves. `motion.css` evita duplicar la entrada CSS de las páginas.

`sw.js` almacena el conjunto completo de archivos para uso sin conexión. En localhost intenta la red primero para facilitar el desarrollo. Al publicar cambios, incrementa el nombre de caché del service worker para actualizar todos los módulos juntos.

Las pruebas cubren importaciones repetidas y erróneas, migración, recuperación, sesiones, estimaciones, récords, fechas, formatos de imagen y el inicio inmediato de compartir/copiar. Las vistas y el flujo de entrenamiento también se han comprobado en navegador con tamaños móviles y de escritorio. Compartir, copiar PNG, áreas seguras, teclado y uso en segundo plano quedan pendientes de una prueba física en iPhone; el temporizador se recalcula al volver a la app, pero esta versión no envía una alarma con la app cerrada.

Publicar en App Store y las funciones de pago futuras pertenecen a una fase posterior. Esta versión permite probar y mejorar el producto como web instalable.
