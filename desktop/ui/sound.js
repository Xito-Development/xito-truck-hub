/* Sonidos y voz de los avisos (compartido por la app y el overlay) */
'use strict';
window.HubSound = (() => {
  let ac = null, master = null;
  const ctx = () => {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createDynamicsCompressor(); master.connect(ac.destination); } catch { return null; } }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  };
  // Una nota con envolvente y armónicos
  function note(a, t, f, d, vol, type = 'sine', harm = [], attack = 0.012) {
    const g = a.createGain(); g.connect(master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    const add = (freq, v, tp) => { const o = a.createOscillator(), og = a.createGain(); o.type = tp; o.frequency.setValueAtTime(freq, t); og.gain.value = v; o.connect(og).connect(g); o.start(t); o.stop(t + d + 0.05); };
    add(f, 1, type);
    harm.forEach(([mult, v]) => add(f * mult, v, 'sine'));
  }
  const PACKS = {
    suave: { name: 'Suave', play(a, t, lv, v) {
      const seq = { good: [[784, 0], [1047, 0.12], [1319, 0.24]], bad: [[622, 0], [466, 0.16]], warn: [[740, 0], [740, 0.2]], info: [[880, 0], [1175, 0.12]], rule: [[523, 0], [415, 0.15], [523, 0.3]], sys: [[988, 0]] }[lv] || [[880, 0]];
      seq.forEach(([f, dt]) => note(a, t + dt, f, 0.45, 0.22 * v, 'sine', [[2, 0.18], [3, 0.05]]));
    } },
    campana: { name: 'Campana', play(a, t, lv, v) {
      const seq = { good: [1318, 1760], bad: [659, 523], warn: [1047, 1047], info: [1568], rule: [880, 659, 880], sys: [1760] }[lv] || [1568];
      seq.forEach((f, i) => note(a, t + i * 0.22, f, 1.4, 0.2 * v, 'sine', [[2.76, 0.35], [5.4, 0.18], [8.93, 0.08]], 0.004));
    } },
    digital: { name: 'Digital', play(a, t, lv, v) {
      const seq = { good: [[1200, 0], [1600, 0.08]], bad: [[400, 0], [400, 0.14], [300, 0.28]], warn: [[900, 0], [900, 0.1], [900, 0.2]], info: [[1000, 0]], rule: [[500, 0], [800, 0.1], [500, 0.2], [800, 0.3]], sys: [[1400, 0]] }[lv] || [[1000, 0]];
      seq.forEach(([f, dt]) => note(a, t + dt, f, 0.07, 0.12 * v, 'square', [], 0.003));
    } },
    camion: { name: 'Claxon de camión', play(a, t, lv, v) {
      // Bocina de aire: dos tonos graves en diente de sierra
      const dur = lv === 'bad' || lv === 'rule' ? 0.55 : lv === 'warn' ? 0.35 : 0.22;
      const reps = lv === 'rule' ? 2 : 1;
      for (let r = 0; r < reps; r++) { note(a, t + r * 0.7, lv === 'good' ? 233 : 185, dur, 0.1 * v, 'sawtooth', [[1.26, 0.8], [1.5, 0.5]], 0.03); }
    } },
    minimal: { name: 'Minimalista', play(a, t, lv, v) { note(a, t, lv === 'bad' || lv === 'rule' ? 330 : 660, 0.12, 0.18 * v, 'triangle', [], 0.004); } }
  };
  function beep(level = 'info', volume = 0.6, pack = 'suave') {
    const a = ctx(); if (!a) return;
    (PACKS[pack] || PACKS.suave).play(a, a.currentTime + 0.02, level, Math.max(0, Math.min(1, volume)));
  }
  let voice = null;
  function pickVoice(lang = 'es') {
    const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    voice = vs.find((v) => v.lang.toLowerCase().startsWith(lang) && /natural|online|google|neural/i.test(v.name)) || vs.find((v) => v.lang.toLowerCase().startsWith(lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = () => pickVoice(); }
  function say(text, volume = 0.8, lang = 'es') {
    if (!window.speechSynthesis || !text) return;
    pickVoice(lang);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang || (lang === 'es' ? 'es-ES' : lang); if (voice) u.voice = voice; u.volume = Math.min(1, volume + 0.2); u.rate = 1.05;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  // Reproduce un aviso según los ajustes. where: 'pc' (overlay) o 'movil'
  function alert(a, settings, where) {
    const s = settings?.alerts || {};
    const target = s.target || 'pc';
    if (!(target === 'ambos' || target === where)) return;
    const lv = a.kind === 'sys' ? 'sys' : String(a.id || '').startsWith('rule') ? 'rule' : a.level === 'bad' ? 'bad' : a.level === 'good' ? 'good' : a.level === 'warn' ? 'warn' : 'info';
    if (s.sound !== false) beep(lv, s.volume ?? 0.6, s.pack || 'suave');
    if (s.voice) setTimeout(() => say(`${a.title}. ${a.text || ''}`, s.volume ?? 0.6, (settings?.language || 'es').slice(0, 2)), 450);
  }
  return { beep, say, alert, PACKS };
})();
