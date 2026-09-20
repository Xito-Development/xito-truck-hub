# Xito Truck Hub 1.4.0

HUB para Euro Truck Simulator 2 / American Truck Simulator y TruckersMP — Xito Development.

## Generar el instalador y el APK
Sube esta carpeta a tu repositorio de GitHub (por ejemplo con GitDeploy). La acción «Compilar Xito Truck Hub» crea `XitoTruckHub-Setup-1.1.0.exe` y el APK en la pestaña *Actions* → última ejecución → *Artifacts*.

## Actualizar sin perder datos
- **Windows:** ejecuta el instalador nuevo. Detecta la versión instalada y te pregunta si quieres actualizar. Tus datos están en `%APPDATA%\Xito Truck Hub` y nunca se borran.
- **Android:** instala el APK nuevo encima. Todos los APK se firman con la misma clave (`mobile/android/app/xito.keystore`), así que Android ofrece «Actualizar» y conserva tus datos.
- **Aviso automático:** escribe tu repositorio de GitHub en Ajustes → Actualizaciones. Cada vez que subas código, GitHub publica una versión nueva y el HUB te avisa con un botón de descarga.

## Novedades de la 1.4.0
- Acceso remoto desde cualquier lugar, cifrado y gratis; búsqueda automática del PC en la Wi‑Fi.
- Overlay estilo HUD del juego con mini mapa, mensajes del camión, normas de TruckersMP, finanzas, combustible, tacógrafo y convoy.
- Nota de conducción, niveles, viajes Real/Carrera y tacógrafo realista.
- Botonera en el móvil, modo convoy y conexión con el bot de Discord de la VTC.
- Más TruckersMP: amigos, compañeros de VTC, recordatorios de eventos, normas y mapa oficial.
- Beneficio neto, «Mis camiones», botón Jugar, asistente propio, 6 idiomas y tonos nuevos.
- Android: notificaciones, pantalla encendida y pantalla de inicio propia.

## Novedades de la 1.3.0
- Mapa de tráfico en tiempo real (se va afinando con los minutos: dibuja las carreteras más usadas).
- Ruta recomendada: lee las carreteras del mapa y calcula el camino más concurrido y el más corto hasta tu destino, con la lista de ciudades por las que pasar.
- Planificador de rutas entre dos ciudades cualesquiera.
- La cabina, el overlay y la voz te indican la siguiente ciudad de la ruta.
- Android: búsqueda automática del PC, vibración, barra de estado a juego y peticiones que ya no se quedan colgadas.

## Novedades de la 1.2.0
- Mapa en vivo: jugadores de TruckersMP, tus rutas, ciudades, destino y amigos (ETS2, ProMods y ATS).
- Amigos por ID de TruckersMP, con estado y distancia. Buscador de jugadores.
- Recorrido de cada entrega en un mini mapa, con notas y valoración.
- Sesión de hoy, objetivos diarios y semanales, calendario de actividad y racha.
- Apariencia: color de acento, densidad, esquinas, tamaño del texto, animaciones, brillo, menú compacto y pantalla de inicio.
- Unidades: km/h o mph, °C o °F, litros o galones, toneladas o libras.
- Tarjetas de la cabina a elegir.
- Avisos con sonido y voz en español, umbrales configurables y elección de PC, móvil o ambos.
- Overlay completo, compacto o solo velocidad; en cualquier esquina; duración de avisos y tiempo de descanso.

## Novedades de la 1.1.0
- Avisos de conducción en el overlay y en el móvil: descanso, combustible bajo, exceso de velocidad y daños.
- Logros (18) con aviso al desbloquearlos.
- Estadísticas por periodo: 7 días, 30 días, 12 meses o todo, y ganancia por km.
- Publicación automática de entregas, cancelaciones y multas en un canal de Discord (webhook).
- Estado en tu perfil de Discord con la ruta que estás haciendo (Rich Presence).
- Modo salpicadero a pantalla completa (el móvil no se apaga mientras está abierto).
- Exportar entregas a Excel (CSV) e importar copias de seguridad.
- Copia de seguridad automática del historial.
- Botón atrás de Android, reconexión al volver a la app y aviso si el PIN del PC cambia.

## Errores corregidos
- La API local podía usarse desde cualquier web abierta en el navegador del PC: ahora solo la app o quien tenga el PIN.
- El modo demostración guardaba viajes falsos en tu historial.
- Al activar y desactivar la demostración podían quedar dos lectores de telemetría a la vez.
- «Borrar historial» no funcionaba en el programa de Windows.
- Los días de las estadísticas se cortaban a las 00:00 UTC en vez de a medianoche de España.
- La barra de progreso del trabajo empezaba mal si el GPS tardaba en calcular la ruta.
- La cabina reconstruía todo 5 veces por segundo (ahora solo actualiza los valores y las barras se animan).
- Búsquedas de entregas que llegaban desordenadas y listado limitado a 500 (ahora con «Cargar más»).
- El overlay tapaba el menú de pausa y podía quedar fuera de pantalla al quitar un monitor.
- Conexiones de móviles "fantasma" que nunca se cerraban.
- Mensaje claro si el puerto 25580 está ocupado y reintento si la ventana abre antes que el servidor.
- Tiempos de espera en las APIs externas para que nada se quede colgado.

## Atajos en el juego
- `Ctrl + Mayús + O` — mostrar u ocultar el overlay
- `Ctrl + Mayús + L` — mover el overlay (vuelve a pulsarlo para fijarlo)
