// ==========================================================================
//  Xito Truck Hub → bot de Discord de la VTC (discord.js v14)
//  Recibe entregas, multas y tacógrafo desde el HUB de cada conductor,
//  los guarda en datos/xito-hub.json, los publica en un canal y añade /hub.
// ==========================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = function iniciarXitoHub(client, opciones = {}) {
  const cfg = {
    puerto: +(opciones.puerto || process.env.SERVER_PORT || process.env.PORT || 3099),
    clave: opciones.clave || process.env.XITO_HUB_CLAVE || '',
    canal: opciones.canal || '',             // canal donde se publican las entregas
    canalAvisos: opciones.canalAvisos || '', // canal para multas e infracciones de tacógrafo (opcional)
    guildId: opciones.guildId || '',
    archivo: opciones.archivo || path.join(process.cwd(), 'datos', 'xito-hub.json'),
    color: opciones.color || 0xffb547
  };
  if (!cfg.clave) console.warn('[xito-hub] Falta la clave secreta: cualquiera podría enviar datos. Pon la misma clave que en el HUB.');

  // ---------- datos ----------
  let db = { conductores: {}, entregas: [] };
  try { if (fs.existsSync(cfg.archivo)) db = JSON.parse(fs.readFileSync(cfg.archivo, 'utf8')); } catch (e) { console.error('[xito-hub] No se pudo leer', e.message); }
  let tGuardar = null;
  const guardar = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => { try { fs.mkdirSync(path.dirname(cfg.archivo), { recursive: true }); fs.writeFileSync(cfg.archivo, JSON.stringify(db, null, 1)); } catch (e) { console.error('[xito-hub]', e.message); } }, 800); };
  const clave = (c) => String(c?.discord_id || c?.tmp_id || c?.nombre || 'desconocido');
  const ficha = (c) => {
    const k = clave(c);
    const f = db.conductores[k] || (db.conductores[k] = { nombre: c?.nombre || k, discord_id: c?.discord_id || null, tmp_id: c?.tmp_id || null, entregas: 0, km: 0, ingresos: 0, multas: 0, importeMultas: 0, notaSuma: 0, notaN: 0, tacografoMin: 0, infracciones: 0, dias: {} });
    if (c?.nombre) f.nombre = c.nombre;
    return f;
  };
  const dia = (f, fecha) => { const k = String(fecha).slice(0, 10); return f.dias[k] || (f.dias[k] = { km: 0, entregas: 0, ingresos: 0 }); };

  async function publicar(canalId, embed) {
    if (!canalId) return;
    try { const ch = await client.channels.fetch(canalId); if (ch?.isTextBased()) await ch.send({ embeds: [embed] }); } catch (e) { console.error('[xito-hub] No se pudo publicar:', e.message); }
  }
  const menc = (c) => (c?.discord_id ? `<@${c.discord_id}>` : c?.nombre || 'Un conductor');

  async function procesar(p) {
    const c = p.conductor || {}, d = p.datos || {};
    const f = ficha(c);
    switch (p.evento) {
      case 'entrega': {
        f.entregas++; f.km += d.km || 0; f.ingresos += d.ingresos || 0;
        if (d.nota != null) { f.notaSuma += d.nota; f.notaN++; }
        const dd = dia(f, p.fecha); dd.km += d.km || 0; dd.entregas++; dd.ingresos += d.ingresos || 0;
        db.entregas.unshift({ ...d, conductor: clave(c), nombre: f.nombre, fecha: p.fecha });
        db.entregas = db.entregas.slice(0, 2000);
        await publicar(cfg.canal, new EmbedBuilder().setColor(cfg.color)
          .setTitle(`✅ ${d.origen} → ${d.destino}`)
          .setDescription(`${menc(c)} ha entregado **${d.carga}** (${d.toneladas} t)`)
          .addFields(
            { name: 'Distancia', value: `${d.km} km`, inline: true }, { name: 'Ingresos', value: `${(d.ingresos || 0).toLocaleString('es-ES')} €`, inline: true },
            { name: 'Nota', value: d.nota != null ? `${d.calificacion} (${d.nota})` : '—', inline: true },
            { name: 'Modo', value: d.modo === 'real' ? 'Real' : d.modo === 'race' ? 'Carrera' : '—', inline: true },
            { name: 'Daño carga', value: `${d.dano_carga_pct || 0} %`, inline: true }, { name: 'Multas', value: String(d.multas || 0), inline: true })
          .setFooter({ text: `${d.camion || ''} ${d.matricula ? '· ' + d.matricula : ''} · Xito Truck Hub` }).setTimestamp(new Date(p.fecha)));
        break;
      }
      case 'cancelacion':
        await publicar(cfg.canal, new EmbedBuilder().setColor(0xff6b7a).setTitle(`❌ Trabajo cancelado: ${d.origen} → ${d.destino}`).setDescription(`${menc(c)} · ${d.carga}`).setTimestamp(new Date(p.fecha)));
        break;
      case 'multa':
        f.multas++; f.importeMultas += d.importe || 0;
        await publicar(cfg.canalAvisos, new EmbedBuilder().setColor(0xffcf5c).setTitle('🚨 Multa').setDescription(`${menc(c)}: ${d.motivo} · ${(d.importe || 0).toLocaleString('es-ES')} €`).setTimestamp(new Date(p.fecha)));
        break;
      case 'tacografo_dia':
        f.tacografoMin += d.conduccion_min || 0;
        break;
      case 'tacografo_infraccion':
        f.infracciones++;
        await publicar(cfg.canalAvisos, new EmbedBuilder().setColor(0xff6b7a).setTitle('⏱️ Tacógrafo').setDescription(`${menc(c)}: ${d.aviso}\n${d.detalle || ''}`).setTimestamp(new Date(p.fecha)));
        break;
    }
    guardar();
  }

  // ---------- receptor HTTP ----------
  const server = http.createServer((req, res) => {
    const fin = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.method === 'GET') return fin(200, { ok: true, app: 'xito-hub-receptor' });
    if (req.method !== 'POST') return fin(405, { error: 'Solo POST' });
    if (cfg.clave && req.headers.authorization !== `Bearer ${cfg.clave}`) return fin(401, { error: 'Clave incorrecta' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2e5) req.destroy(); });
    req.on('end', async () => {
      let p; try { p = JSON.parse(body); } catch { return fin(400, { error: 'JSON no válido' }); }
      try { await procesar(p); fin(200, { ok: true }); } catch (e) { console.error('[xito-hub]', e); fin(500, { error: e.message }); }
    });
  });
  server.on('error', (e) => console.error(`[xito-hub] No se pudo abrir el puerto ${cfg.puerto}:`, e.message));
  server.listen(cfg.puerto, '0.0.0.0', () => console.log(`[xito-hub] Recibiendo datos del HUB en el puerto ${cfg.puerto}`));

  // ---------- comando /hub ----------
  const comando = new SlashCommandBuilder().setName('hub').setDescription('Estadísticas de Xito Truck Hub')
    .addSubcommand((s) => s.setName('perfil').setDescription('Ficha de un conductor').addUserOption((o) => o.setName('usuario').setDescription('Conductor')))
    .addSubcommand((s) => s.setName('ranking').setDescription('Ranking de la VTC').addStringOption((o) => o.setName('periodo').setDescription('Periodo').addChoices({ name: 'Semana', value: '7' }, { name: 'Mes', value: '30' }, { name: 'Todo', value: 'todo' })));
  client.once('ready', async () => {
    try {
      if (cfg.guildId) await client.application.commands.create(comando.toJSON(), cfg.guildId);
      else await client.application.commands.create(comando.toJSON());
    } catch (e) { console.error('[xito-hub] No se pudo registrar /hub:', e.message); }
  });
  client.on('interactionCreate', async (i) => {
    if (!i.isChatInputCommand() || i.commandName !== 'hub') return;
    try {
      if (i.options.getSubcommand() === 'perfil') {
        const u = i.options.getUser('usuario') || i.user;
        const f = db.conductores[u.id];
        if (!f) return i.reply({ content: `${u} todavía no tiene datos del HUB. En Xito Truck Hub: Ajustes → Bot de Discord de la VTC.`, ephemeral: true });
        const nota = f.notaN ? Math.round(f.notaSuma / f.notaN) : null;
        return i.reply({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(`🚚 ${f.nombre}`).setThumbnail(u.displayAvatarURL())
          .addFields({ name: 'Entregas', value: String(f.entregas), inline: true }, { name: 'Kilómetros', value: `${Math.round(f.km).toLocaleString('es-ES')} km`, inline: true },
            { name: 'Ingresos', value: `${Math.round(f.ingresos).toLocaleString('es-ES')} €`, inline: true }, { name: 'Nota media', value: nota != null ? String(nota) : '—', inline: true },
            { name: 'Multas', value: `${f.multas} (${Math.round(f.importeMultas).toLocaleString('es-ES')} €)`, inline: true }, { name: 'Tacógrafo', value: `${Math.round(f.tacografoMin / 60)} h · ${f.infracciones} infracciones`, inline: true })
          .setFooter({ text: 'Xito Truck Hub' })] });
      }
      const per = i.options.getString('periodo') || '7';
      const desde = per === 'todo' ? '' : new Date(Date.now() - +per * 864e5).toISOString().slice(0, 10);
      const filas = Object.values(db.conductores).map((f) => {
        const dias = Object.entries(f.dias).filter(([k]) => !desde || k >= desde).map(([, v]) => v);
        return { nombre: f.nombre, km: dias.reduce((a, v) => a + v.km, 0), entregas: dias.reduce((a, v) => a + v.entregas, 0) };
      }).filter((x) => x.km > 0).sort((a, b) => b.km - a.km).slice(0, 15);
      const medallas = ['🥇', '🥈', '🥉'];
      return i.reply({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(`🏆 Ranking ${per === '7' ? 'semanal' : per === '30' ? 'mensual' : 'total'}`)
        .setDescription(filas.length ? filas.map((x, n) => `${medallas[n] || `**${n + 1}.**`} ${x.nombre} — ${Math.round(x.km).toLocaleString('es-ES')} km · ${x.entregas} entregas`).join('\n') : 'Aún no hay datos en este periodo.')
        .setFooter({ text: 'Xito Truck Hub' })] });
    } catch (e) { console.error('[xito-hub]', e); if (!i.replied && !i.deferred) i.reply({ content: 'Error al consultar los datos.', ephemeral: true }).catch(() => {}); }
  });
  return { servidor: server, datos: () => db };
};
