# Avisos de terceros

Xito Truck Hub (licencia MIT) incluye o utiliza los siguientes componentes de terceros.

## Incluidos en el programa
| Componente | Uso | Licencia |
|---|---|---|
| SCS SDK Plugin / SCSSdkClient (RenCloud) | Lectura de la telemetría del juego | MIT |
| Electron | Programa de Windows | MIT |
| Capacitor (Ionic) | App de Android | MIT |
| ws | WebSocket del servidor local | MIT |
| MQTT.js | Acceso remoto y convoy | MIT |
| pngjs | Lectura de las teselas del mapa para calcular rutas | MIT |
| Barlow y Barlow Condensed (Jeremy Tribby) | Tipografías | SIL Open Font License 1.1 |

El texto completo de la licencia del plugin de telemetría está en
`desktop/resources/plugin/LICENSE-scs-sdk-plugin.txt` y en `bridge/SCSSdkClient/LICENSE-SCSSdkClient.txt`.

## Servicios consultados
- **TruckersMP** (`api.truckersmp.com`, `map.truckersmp.com`): perfiles, servidores, eventos, normas y datos del mapa. Uso de su API pública.
- **ets2map / tracker** (`tracker.ets2map.com`): posiciones de los jugadores en tiempo real.
- **Krashnz** (`traffic.krashnz.com`, `map-cdn.krashnz.com`): estado del tráfico y teselas del mapa.
- **hayahora.futbol**: estado de los bloqueos de LaLiga en España.
- **Brókers MQTT públicos** (shiftr.io, EMQX, HiveMQ, Mosquitto): transporte del acceso remoto y del convoy. Los mensajes viajan cifrados de extremo a extremo.
- **GitHub**: publicación y descarga de actualizaciones.

## Marcas
Xito Truck Hub no está afiliado con SCS Software, TruckersMP, LaLiga ni con los servicios anteriores.
Euro Truck Simulator 2 y American Truck Simulator son marcas registradas de SCS Software.
