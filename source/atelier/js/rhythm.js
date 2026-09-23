import {$, $$, toast} from './ui.js';

export function initRhythm() {
  let audioContext, master, noiseBuffer, sequenceTimer, playing = false, beat = 0;
  async function readyAudio() {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) { toast('当前浏览器暂不支持节奏音频'); return false; }
    try {
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioEngine(); master = audioContext.createGain(); master.gain.value = .12; master.connect(audioContext.destination);
        noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * .18, audioContext.sampleRate);
        const channel = noiseBuffer.getChannelData(0);
        for (let i = 0; i < channel.length; i++) channel[i] = Math.random() * 2 - 1;
      }
      if (audioContext.state !== 'running') await audioContext.resume();
      return true;
    } catch { toast('音频暂时无法开启'); return false; }
  }
  function drum(type) {
    if (!audioContext || audioContext.state !== 'running') return;
    const time = audioContext.currentTime, gain = audioContext.createGain(); gain.connect(master);
    let source;
    if (type === 'kick') {
      source = audioContext.createOscillator(); source.type = 'sine'; source.frequency.setValueAtTime(125,time); source.frequency.exponentialRampToValueAtTime(45,time+.15);
      gain.gain.setValueAtTime(.85,time); gain.gain.exponentialRampToValueAtTime(.001,time+.23);
      source.connect(gain); source.start(time); source.stop(time+.24);
    } else {
      source = audioContext.createBufferSource(); source.buffer = noiseBuffer;
      const filter = audioContext.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = type === 'hat' ? 6500 : 1300;
      const duration = type === 'hat' ? .055 : .14;
      gain.gain.setValueAtTime(type === 'hat' ? .22 : .55,time); gain.gain.exponentialRampToValueAtTime(.001,time+duration);
      source.connect(filter); filter.connect(gain); source.start(time); source.stop(time+duration+.01);
      source.addEventListener('ended',()=>filter.disconnect(),{once:true});
    }
    source.addEventListener('ended',()=>{source.disconnect();gain.disconnect();},{once:true});
    const pad = $(`[data-drum="${type}"]`); pad.classList.add('hit'); setTimeout(()=>pad.classList.remove('hit'),110);
  }
  $$('[data-drum]').forEach(button => button.addEventListener('click',async()=>{if(await readyAudio() && $('#rhythm-dialog').open) drum(button.dataset.drum);}));
  function stopSequence() {
    playing = false; clearTimeout(sequenceTimer);
    $('#rhythm-play').textContent = '播放'; $('#rhythm-play').setAttribute('aria-pressed','false');
    $$('.beat-light').forEach(light=>light.classList.remove('lit'));
  }
  function tick() {
    if (!playing || !$('#rhythm-dialog').open || document.hidden) { stopSequence(); return; }
    drum(beat % 2 === 0 ? 'kick' : 'snare'); drum('hat');
    $$('.beat-light').forEach((light,index)=>light.classList.toggle('lit',index===beat)); beat=(beat+1)%4;
    sequenceTimer=setTimeout(tick,60000/Number($('#tempo').value));
  }
  $('#rhythm-play').addEventListener('click',async()=>{
    if (playing) {stopSequence();return;}
    if (!await readyAudio() || !$('#rhythm-dialog').open || playing) return;
    playing=true;beat=0;$('#rhythm-play').textContent='暂停';$('#rhythm-play').setAttribute('aria-pressed','true');tick();
  });
  $('#tempo').addEventListener('input',()=>{$('#tempo-output').value=$('#tempo').value;});
  $('#rhythm-dialog').addEventListener('close',stopSequence);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) stopSequence();});
  window.addEventListener('pagehide',()=>{stopSequence();if(audioContext) audioContext.close();});
}
