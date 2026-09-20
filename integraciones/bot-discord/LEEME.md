# Conectar Xito Truck Hub con el bot de la VTC

Este módulo recibe automáticamente las entregas (con nota y modo Real/Carrera), multas y horas de tacógrafo de cada conductor que use Xito Truck Hub, las publica en un canal y añade `/hub perfil` y `/hub ranking`.

## En el bot
1. Copia `xito-hub.js` dentro de la carpeta `modulos/` del bot.
2. En `index.js`, justo después de crear el `client`, añade:
   ```js
   require('./modulos/xito-hub')(client, {
     clave: 'UNA-CLAVE-SECRETA-LARGA',
     canal: 'ID_DEL_CANAL_DE_ENTREGAS',
     canalAvisos: 'ID_DEL_CANAL_DE_AVISOS',
     guildId: 'ID_DEL_SERVIDOR'
   });
   ```
3. El puerto se toma solo del panel (variable `SERVER_PORT`). Mira en el panel (pestaña Red / Network) la IP y el puerto asignados.

## En cada Xito Truck Hub
Ajustes → **Bot de Discord de la VTC**:
- Dirección: `http://IP-DEL-PANEL:PUERTO/`
- Clave secreta: la misma que en el bot.
- Tu ID de Discord (clic derecho en tu perfil → Copiar ID de usuario).
- Pulsa «Enviar prueba».

Si el bot está apagado, el HUB guarda los envíos y los manda solos cuando vuelve.
Para meterlo directamente en los módulos de tacógrafo y nóminas del bot, pasa el ZIP del bot y se integra dentro.
