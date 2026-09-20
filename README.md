# Xito Truck Hub

**Xito Truck Hub** es un centro de mando gratuito para **Euro Truck Simulator 2**, **American Truck Simulator** y **TruckersMP**, creado por **Xito Development**. Registra automáticamente todo lo que haces en la carretera, te acompaña dentro del juego con un overlay estilo HUD y te deja verlo todo en el móvil, estés donde estés.

Funciona en **Windows 10/11** y tiene app para **Android**.

## Qué hace

**En el PC**
- **Cabina en directo:** velocidad, límite, marcha, trabajo actual, depósitos, daños, mandos, sesión del día, objetivos y tacógrafo.
- **Historial de entregas:** cada viaje con su ruta en un mini mapa, ingresos, beneficio neto, consumo, multas, nota de conducción (A+ a E) y modo Real o Carrera.
- **Estadísticas y recorridos:** rangos y niveles de conductor, logros, calendario de actividad, mapa de todo lo que has recorrido, velocidad, horarios, países, ciudades y camiones.
- **Mapa en vivo:** jugadores de TruckersMP casi en tiempo real, tráfico, gasolineras, áreas de descanso, talleres, garajes y empresas, amigos, compañeros de VTC y convoy.
- **Ruta recomendada:** calcula el camino más concurrido y el más corto hasta tu destino, y se recalcula si te sales.
- **Overlay en el juego:** velocímetro, testigos, mini mapa con la ruta (zoom con F5), mensajes del camión, normas de TruckersMP, finanzas, combustible, tacógrafo y convoy. Tiene modo para directos (OBS).
- **Avisos:** descanso, combustible, velocidad, daños, normas de TruckersMP, tráfico, amigos, eventos y bloqueos del fútbol en España (hayahora.futbol), con sonido y voz.
- **TruckersMP:** perfil, sanciones, servidores, convoyes, tus eventos, VTC, noticias, normas y botón «Jugar».
- **Integraciones:** webhook y estado en Discord, bot de Discord de la VTC y actualizaciones automáticas.

**En el móvil (Android)**
- Todo lo anterior desde la Wi‑Fi o **desde cualquier lugar** con un código cifrado de extremo a extremo.
- **Botonera** para controlar el camión (luces, intermitentes, freno, crucero, bocinas, cámaras…) y **salpicadero** a pantalla completa.
- Notificaciones en segundo plano y estadísticas guardadas para consultarlas sin conexión.

## Instalación
1. Descarga `XitoTruckHub-Setup.exe` y `XitoTruckHub.apk` desde [Releases](https://github.com/Xito-Development/xito-truck-hub/releases/latest).
2. En el PC, ejecuta el instalador. El asistente te guía para conectar el juego, tu perfil de TruckersMP y el móvil.
3. En el móvil, instala el APK y conéctalo con el código de Ajustes → Ver en el móvil.

Las actualizaciones se instalan encima y conservan todos tus datos.

## Estructura del proyecto
- `desktop/`: programa de Windows (Electron): interfaz, overlay, servidor local y lógica.
- `bridge/`: lector de la telemetría del juego (C#, basado en el SDK de SCS y el plugin de RenCloud, licencia MIT).
- `mobile/`: app Android (Capacitor).
- `integraciones/bot-discord/`: módulo para el bot de Discord de la VTC.
- `.github/workflows/`: compila el instalador y el APK y publica cada versión automáticamente.

## Aviso
Xito Truck Hub no está afiliado con SCS Software, TruckersMP ni LaLiga. Euro Truck Simulator 2 y American Truck Simulator son marcas de SCS Software.

© Xito Development
