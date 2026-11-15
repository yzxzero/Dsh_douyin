export function mountOpenTTD(section) {
  const image=section.querySelector('img'), label=section.querySelector('[data-status]');
  let active=false, generation=0;
  async function status(gen) {
    try {const s=await fetch('/api/openttd/state').then(r=>r.json());if(gen!==generation)return;
      label.textContent=['summarizing','waiting','closing'].includes(s.session?.phase)?'本局总结中，随后返回聊天…':s.gameOver?'本局结束，准备总结…':s.online?`${s.paused?'已暂停 · ':''}${s.activity || '准备经营'}${s.ready?' · 公交 '+s.vehicles+' · 车站 '+s.stations+' · £'+s.money:''}`:'请在操作台启动 OpenTTD';
    }catch{if(gen===generation)label.textContent='游戏连接中…';}
    if(active&&gen===generation)setTimeout(()=>status(gen),1500);
  }
  function frame(gen) {
    if(!active||gen!==generation)return;
    image.onload=()=>{if(gen!==generation)return;image.hidden=false;setTimeout(()=>frame(gen),250);};
    image.onerror=()=>{if(gen!==generation)return;image.hidden=true;setTimeout(()=>frame(gen),1500);};
    image.src='/api/openttd/frame?t='+Date.now();
  }
  return visible=>{
    section.hidden=!visible;
    if(visible===active)return;
    active=visible;generation++;
    if(active){status(generation);frame(generation);}else{image.onload=null;image.onerror=null;image.removeAttribute('src');}
  };
}
