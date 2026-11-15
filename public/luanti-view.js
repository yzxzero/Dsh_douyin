export function mountLuanti(section) {
  const image=section.querySelector('img'), label=section.querySelector('[data-status]');
  let active=false, generation=0;
  async function status(gen) {
    try {const s=await fetch('/api/luanti/state').then(r=>r.json());if(gen!==generation)return;
      const names=s.voteLabels||{palace:'宫殿',pond:'鱼塘',garden:'花园'};
      const totals=s.project==='atlantis'?'城市 '+s.cityPlaced+' 块 · 工段 '+s.completed+'/'+s.tasksTotal:'放置 '+s.placed+' 块 · 建成 '+s.completed+' 座';
      const detail=s.phase==='building'?' · '+s.stage+' '+s.progress+'/'+s.total:s.phase==='voting'?' · '+['palace','pond','garden'].filter(k=>s.available?.[k]!==false).map(k=>names[k]+' '+s.votes[k]).join(' / ')+' · '+s.voteRemainingSec+'秒':'';
      label.textContent=['summarizing','waiting','closing'].includes(s.session?.phase)?'本局总结中，随后返回聊天…':s.gameOver?'本局结束，准备总结…':s.online?`${s.paused?'已暂停 · ':''}${s.activity || '准备世界'}${s.ready?' · '+totals+detail:''}`:'请在操作台启动亚特兰蒂斯建城';
    }catch{if(gen===generation)label.textContent='游戏连接中…';}
    if(active&&gen===generation)setTimeout(()=>status(gen),1500);
  }
  function frame(gen) {
    if(!active||gen!==generation)return;
    image.onload=()=>{if(gen!==generation)return;image.hidden=false;setTimeout(()=>frame(gen),250);};
    image.onerror=()=>{if(gen!==generation)return;image.hidden=true;setTimeout(()=>frame(gen),1500);};
    image.src='/api/luanti/frame?t='+Date.now();
  }
  return visible=>{
    section.hidden=!visible;
    if(visible===active)return;
    active=visible;generation++;
    if(active){status(generation);frame(generation);}else{image.onload=null;image.onerror=null;image.removeAttribute('src');}
  };
}
