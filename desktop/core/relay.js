// Acceso remoto desde cualquier lugar: el PC y el móvil se hablan a través de brókers MQTT públicos
// y gratuitos. Todo va cifrado (AES-256-GCM) con una clave derivada del código de vinculación,
// así que el bróker solo ve datos ilegibles.
const crypto = require('crypto');
const mqtt = require('mqtt');

// El primero usa el puerto 443 (el de las webs), así funciona aunque la red bloquee puertos raros
const BROKERS = ['wss://public:public@public.cloud.shiftr.io', 'wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() { let s = ''; for (let i = 0; i < 12; i++) s += ALPHA[crypto.randomInt(ALPHA.length)]; return s.replace(/(.{4})(?=.)/g, '$1-'); }
function derive(code) {
  const c = String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return {
    topic: 'xth/' + crypto.createHash('sha256').update('xth:' + c).digest('hex').slice(0, 24),
    key: crypto.pbkdf2Sync(c, 'xito-truck-hub', 20000, 32, 'sha256')
  };
}
function enc(key, obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, ct]).toString('base64');
}
function dec(key, b64) {
  const buf = Buffer.from(String(b64), 'base64');
  const iv = buf.subarray(0, 12), tag = buf.subarray(buf.length - 16), ct = buf.subarray(12, buf.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(ct), d.final()]).toString());
}

class Relay {
  constructor(store, call, helloFn) {
    this.store = store; this.call = call; this.hello = helloFn;
    this.client = null; this.k = null; this.lastClient = 0; this.lastTel = 0; this.brokerIdx = 0; this.state = 'off'; this.error = '';
  }
  get cfg() { return this.store.data.settings.remote || {}; }
  status() { return { enabled: !!this.cfg.enabled, code: this.cfg.code || '', state: this.state, broker: (this.cfg.broker || BROKERS[this.brokerIdx]).replace(/\/\/[^@]*@/, '//'), clientsActive: Date.now() - this.lastClient < 60000, error: this.error }; }
  start() {
    this.stop();
    const c = this.cfg;
    if (!c.enabled || !c.code) { this.state = 'off'; return; }
    this.k = derive(c.code);
    this.state = 'connecting';
    const url = c.broker || BROKERS[this.brokerIdx];
    const cl = mqtt.connect(url, { clientId: 'xth-pc-' + crypto.randomBytes(4).toString('hex'), connectTimeout: 12000, reconnectPeriod: 8000, keepalive: 45, clean: true });
    this.client = cl;
    let failed = 0;
    cl.on('connect', () => {
      this.state = 'online'; this.error = ''; failed = 0;
      cl.subscribe([`${this.k.topic}/req`, `${this.k.topic}/hi`], { qos: 0 });
      this.publish({ t: 'pcup' });
    });
    cl.on('error', (e) => { this.error = e.message; console.warn('[remoto]', BROKERS[this.brokerIdx].replace(/\/\/[^@]*@/, '//'), e.message); });
    cl.on('offline', () => {
      this.state = 'connecting';
      // Si un bróker falla varias veces seguidas se prueba el siguiente
      if (++failed >= 2 && !c.broker) { this.brokerIdx = (this.brokerIdx + 1) % BROKERS.length; setTimeout(() => this.start(), 500); }
    });
    cl.on('message', async (topic, payload) => {
      let m; try { m = dec(this.k.key, payload.toString()); } catch { return; }
      this.lastClient = Date.now();
      if (topic.endsWith('/hi')) { this.publish(await this.hello()); return; }
      if (topic.endsWith('/req') && m && m.id && m.cid) {
        const r = await this.call(m.method || 'GET', m.path, m.body);
        cl.publish(`${this.k.topic}/res/${m.cid}`, enc(this.k.key, { id: m.id, ...r }), { qos: 0 });
      }
    });
  }
  stop() { if (this.client) { try { this.client.end(true); } catch {} this.client = null; } this.state = 'off'; }
  // Reenvía lo mismo que el WebSocket local, solo si hay algún móvil conectado en remoto
  publish(msg) {
    if (!this.client || this.state !== 'online') return;
    if (msg.t !== 'pcup' && Date.now() - this.lastClient > 60000) return;
    if (msg.t === 'tel') { const now = Date.now(); if (now - this.lastTel < 480) return; this.lastTel = now; }
    try { this.client.publish(`${this.k.topic}/pc`, enc(this.k.key, msg), { qos: 0 }); } catch {}
  }
}
module.exports = { Relay, newCode, derive, enc, dec, BROKERS };
