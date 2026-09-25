// Appearance has one owner; every switch reflects the same saved preference.
export function initTheme({storage, notify=()=>{}}) {
  const controls=[...document.querySelectorAll('button[data-theme-toggle]')];
  function apply(light, save=false) {
    document.body.classList.toggle('light',light);
    document.body.classList.toggle('light-mode',light);
    document.body.classList.toggle('dark-mode',!light);
    document.documentElement.classList.toggle('dark',!light);
    document.documentElement.style.colorScheme=light?'light':'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',light?'#f5f0e6':'#101110');
    for(const control of controls) {
      control.setAttribute('role','switch');
      control.setAttribute('aria-label','日光模式');
      control.setAttribute('aria-checked',String(light));
      control.title=light?'当前：日光。点击进入夜场。':'当前：夜场。点击切换日光。';
      if(control.hasAttribute('data-theme-footer'))control.textContent=light?'☾ 切换夜场':'☼ 切换日光';
    }
    document.querySelectorAll('[data-theme-edition]').forEach(label=>{label.textContent=light?'DAYLIGHT / 日光排练':'AFTER HOURS / 夜场';});
    if(save&&!storage.set('cc-theme',light?'light':'dark'))notify('模式已切换；浏览器未允许保存偏好。');
    document.dispatchEvent(new CustomEvent('atelier:theme',{detail:{light}}));
  }
  apply(storage.get('cc-theme')==='light');
  controls.forEach(control=>control.addEventListener('click',()=>apply(!document.body.classList.contains('light'),true)));
  window.addEventListener('storage',event=>{
    if(event.key==='cc-theme'||event.key===null)apply(storage.get('cc-theme')==='light');
  });
}
