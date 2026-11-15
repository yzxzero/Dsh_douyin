export function gameIdleSeconds(cfg, mode) {
  return Number(mode === 'openttd' ? cfg.openttd?.idleTalkSec ?? 60 : cfg.guide?.idleEverySec ?? 30);
}
export function gameProgress(s) {
  if (!s.online || !s.playing || s.gameOver) return '';
  if(s.paused) return '本鲸先暂停一下运输经营，陪你们聊聊线路规划。';
  if(!s.ready) return '本鲸正在准备运输公司，等真实经营数据回来再汇报。';
  return `本鲸正在${s.activity}，目前有${s.vehicles}辆公交、${s.stations}座车站，公司现金${s.money}英镑。`;
}
export function parseGameSuggestion(raw) {
 const t=String(raw||'').replace(/[，,。！!？?\s]/g,'').slice(0,100);
 if(/为什么|怎么|如何|不要|别|上次|刚才/.test(t))return null;
 if(/^(?:大肥鱼)?暂停(?:游戏|经营|自动操作)?(?:吧)?$/.test(t))return {strategy:'pause',label:'暂停经营，一起看看线路'};
 if(/^(?:大肥鱼)?(?:继续|恢复)(?:游戏|经营|自动玩|自动操作)?(?:吧)?$/.test(t))return {strategy:'auto',label:'继续自动经营公交线路'};
 return null;
}
export function roundSummary(s,reason='ended') {
 const intro=reason==='disconnected'?'游戏连接中断，本鲸按最后收到的数据汇报。':'这次运输经营先到这里。';
 const details=s.ready?`公司有${s.vehicles}辆公交、${s.stations}座车站，现金${s.money}英镑。`: '这次还没有收到完整经营数据。';
 return intro+details+'存档后回来陪大家聊天。';
}

/** Hooks keep native processes, voice and the clock replaceable in offline tests. */
export class OpenTTDDirector {
  constructor(hooks, saved = {}) {
    this.h = hooks;
    this.data = { lastFinishedAt:0, lastAttemptAt:0, lastRoundHandled:'', session:null, history:[], ...saved };
    this.suspended=false;this.stopping=null;this.stopEpoch=0;
    this.busy = false; this.starting = null; this.finishing = null; this.suggesting = false;
    this.lastSuggestionAt = 0;
    this.presenceSince = this.h.hasAudience() ? this.now() : null;
    this.awaySince = null;
    this.lastMode = this.h.mode();
    this.chatSince = this.lastMode === 'chat' && this.presenceSince !== null ? this.now() : null;
  }
  get phase() { return this.data.session?.phase || 'idle'; }
  observePresence() {
    const now=this.now(), mode=this.h.mode();
    if(this.h.hasAudience()) {
      if(this.presenceSince===null || this.awaySince!==null && now-this.awaySince>=300000) {
        this.presenceSince=now; this.chatSince=mode==='chat'?now:null;
      }
      this.awaySince=null;
    } else if(this.awaySince===null) this.awaySince=now;
    if(mode!==this.lastMode){this.chatSince=mode==='chat'?now:null;this.lastMode=mode;}
  }
  automaticStatus() {
    const cfg=this.h.config(),now=this.now();
    const waiting=(code,message)=>({code,message,remainingSec:null,dueAt:null});
    if(this.h.config().enabled===false)return waiting('not-allowed','已禁止主播玩游戏');
    if(this.phase!=='idle')return waiting(this.phase,this.phase==='active'?'正在游戏中':'正在总结并关闭游戏');
    if(cfg.autoStart===false)return waiting('disabled','自动开局已关闭');
    if(!this.h.hasAudience())return waiting('no-audience','等待直播画面连接');
    if(this.h.mode()!=='chat')return waiting('other-scene','当前不是聊天场景，不自动抢占');
    if(this.h.blocked())return waiting('fitness','健身场景在线，暂不切换');
    const since=this.presenceSince??now;
    const idleDue=this.h.activityAt()+Number(cfg.idleStartSec??300)*1000;
    const maxDue=(this.chatSince??now)+Number(cfg.maxWaitSec??600)*1000;
    // Cooldown from a previous disconnected broadcast must not delay this broadcast's first game.
    const gapDue=this.data.lastFinishedAt>=since?this.data.lastFinishedAt+Number(cfg.roundGapSec??600)*1000:0;
    const retryDue=this.data.lastAttemptAt>=since?this.data.lastAttemptAt+300000:0;
    const dueAt=Math.max(Math.min(idleDue,maxDue),gapDue,retryDue);
    const remainingSec=Math.max(0,Math.ceil((dueAt-now)/1000));
    const code=remainingSec===0?'ready':dueAt===gapDue?'cooldown':dueAt===retryDue?'retry':'waiting';
    const label=code==='cooldown'?'两局间隔':code==='retry'?'启动失败后重试':'自动开局倒计时';
    return {code,dueAt,remainingSec,message:remainingSec===0?'条件已满足，正在准备开局':label+'：约 '+Math.ceil(remainingSec/60)+' 分钟（'+remainingSec+' 秒）'};
  }
  view() { return {phase:this.phase,lastFinishedAt:this.data.lastFinishedAt,enabled:this.h.config().enabled!==false,autoStart:this.h.config().autoStart!==false,autoStatus:this.automaticStatus()}; }
  async persist() { await this.h.persist(structuredClone(this.data)); }
  now() { return this.h.now?.() ?? Date.now(); }
  async start(automatic = false) {
    if(this.h.config().enabled===false || this.suspended)throw new Error('允许主播玩游戏已关闭');
    if (this.starting) return this.starting;
    if (['summarizing','waiting','closing'].includes(this.phase)) throw new Error('正在总结并关闭上一局，请稍等');
    this.starting = (async () => {
      const previousForced = this.h.forced() === 'openttd' ? 'chat' : this.h.forced();
      this.data.lastAttemptAt = this.now(); await this.persist();
      await this.h.launch();
      if(this.h.config().enabled===false || this.suspended)throw new Error('游戏启动已取消');
      await this.h.command({ action:'start' });
      let s;
      for (let i=0; i<100; i++) {
        if(this.h.config().enabled===false || this.suspended)throw new Error('游戏启动已取消');
        s = await this.h.state();
        if (s.playing && !s.gameOver && s.roundId && s.ready !== false) break;
        await this.h.sleep(200);
      }
      if(this.h.config().enabled===false || this.suspended)throw new Error('游戏启动已取消');
      if (!s?.playing || s.gameOver || !s.roundId || s.ready === false) throw new Error('新局尚未就绪，请确认游戏已加载新版控制桥');
      const old = this.data.session;
      this.data.session = { phase:'active', roundId:s.roundId, previousForced:old ? old.previousForced : previousForced,
        startedAt:this.now(), stats:s, acceptedIdeas:old?.acceptedIdeas || 0 };
      await this.persist(); await this.h.setMode('openttd'); this.h.onStarted?.();
      if (automatic) this.h.announce('本鲸开一局 OpenTTD，从公交运输开始。你们可以发“暂停经营”或“继续经营”，一起讨论线路。','openttd-start').catch(err=>this.h.log?.(err));
    })().finally(() => { this.starting=null; });
    return this.starting;
  }
  async tick() {
    if(this.suspended || this.stopping)return;
    if(this.h.config().enabled===false){await this.stop();return;}
    if (this.busy || this.starting || this.finishing) return;
    this.busy=true;
    const epoch=this.stopEpoch;
    this.observePresence();
    try {
      const session=this.data.session;
      if (session) {
        if (session.phase === 'summarizing') { // interrupted restart: do not repeat a published summary
          session.phase='closing'; await this.close(); return;
        }
        if (session.phase === 'waiting') {
          if (this.now() >= session.closeAt) { session.phase='closing'; await this.close(); }
          return;
        }
        if (session.phase === 'closing') { await this.close(); return; }
        const s=await this.h.state();
        if(epoch!==this.stopEpoch || this.suspended)return;
        if (this.h.mode() !== 'openttd') return await this.finish(s, 'manual');
        if (!s.online) return await this.finish(session.stats, 'disconnected');
        if (s.roundId && s.roundId !== session.roundId) {
          session.roundId=s.roundId; session.startedAt=this.now(); session.acceptedIdeas=0;
        }
        session.stats=s; await this.persist();
        if (s.gameOver || !s.playing) await this.finish(s, s.gameOver?'ended':'manual');
        return;
      }
      // Adopt an existing game after a service restart or a direct scene switch.
      if (this.h.mode() === 'openttd') {
        const s=await this.h.state();
        if(epoch!==this.stopEpoch || this.suspended)return;
        if (s.online && s.roundId && s.roundId !== this.data.lastRoundHandled) {
          this.data.session={phase:'active',roundId:s.roundId,previousForced:'chat',startedAt:this.now(),stats:s,acceptedIdeas:0};
          await this.persist(); this.h.onStarted?.(); if(s.gameOver) await this.finish(s); return;
        }
        if(this.h.config().autoStart!==false && this.h.hasAudience() && !this.h.blocked() &&
            (!this.data.lastAttemptAt || this.now()-this.data.lastAttemptAt>=300000) && (!s.online || !s.playing)) await this.start(true);
        return;
      }
      if(this.automaticStatus().code!=='ready')return;
      await this.start(true);
    } finally { this.busy=false; }
  }
  async finish(s, reason='ended') {
    if(this.suspended || this.h.config().enabled===false)return;
    if (this.finishing) return this.finishing;
    if (!this.data.session || this.phase !== 'active') return;
    const epoch=this.stopEpoch;
    this.finishing = (async()=>{
      const session=this.data.session;
      session.phase='summarizing'; this.data.lastRoundHandled=session.roundId;
      session.stats=s?.online ? s : session.stats; await this.persist();
      const text=roundSummary(session.stats || {},reason);
      let event;
      try { event=await this.h.announce(text,'openttd-summary'); }
      catch(e) { this.h.log?.(e); }
      if(epoch!==this.stopEpoch)return;
      session.summaryEventId=event?.id;
      session.phase='waiting'; session.closeAt=this.now()+(event?.voice?90000:5000);
      session.earliestCloseAt=this.now()+3000;
      this.data.history.push({roundId:session.roundId,at:this.now(),summary:text,stats:session.stats,acceptedIdeas:session.acceptedIdeas});
      this.data.history=this.data.history.slice(-20); await this.persist();
    })().finally(()=>{this.finishing=null;});
    return this.finishing;
  }
  summaryEnded(id, played) {
    const session=this.data.session;
    if (session?.phase !== 'waiting' || id !== session.summaryEventId) return false;
    session.closeAt=played ? Math.max(this.now(),session.earliestCloseAt) : Math.max(this.now()+5000,session.earliestCloseAt); return true;
  }
  async close() {
    if(this.suspended)return;
    const epoch=this.stopEpoch;
    const session=this.data.session;
    if(!session) return;
    const s=await this.h.state();
    if(epoch!==this.stopEpoch || this.suspended)return;
    if (s.online) {
      await this.h.command({action:'exit'});
      for(let i=0;i<30;i++){await this.h.sleep(200);if(!(await this.h.state()).online)break;}
      if((await this.h.state()).online)throw new Error('游戏仍在退出，稍后会重试');
    }
    if(epoch!==this.stopEpoch || this.suspended)return;
    if(this.h.mode() === 'openttd')await this.h.setMode(session.previousForced ?? null);
    this.data.lastFinishedAt=this.now(); this.data.session=null; await this.persist();
    this.h.onClosed?.();
  }
  async stop({permanent=false}={}) {
    if(this.stopping)return this.stopping;
    this.suspended=true;this.stopEpoch++;
    this.stopping=(async()=>{
      if(this.starting)await this.starting.catch(()=>{});
      const session=this.data.session;
      const state=await this.h.state();
      if(state.online){
        await this.h.command({action:'auto',enabled:false}).catch(()=>{});
        await this.h.command({action:'exit'});
        for(let i=0;i<30;i++){await this.h.sleep(200);if(!(await this.h.state()).online)break;}
        if((await this.h.state()).online)throw new Error('游戏仍在退出，稍后重试');
      }
      if(session){this.data.lastRoundHandled=session.roundId;this.data.lastFinishedAt=this.now();}
      const forced=this.h.forced();
      if(['openttd','game'].includes(forced)||['openttd','game'].includes(this.h.mode()))
        await this.h.setMode(session && !['game','openttd'].includes(session.previousForced) ? session.previousForced : 'chat');
      this.data.session=null;await this.persist();
      if(session)this.h.onClosed?.();
    })().finally(()=>{this.stopping=null;if(!permanent)this.suspended=false;});
    return this.stopping;
  }
  async suggest(text, username) {
    const idea=parseGameSuggestion(text);
    if(!idea || this.h.config().enabled===false || this.suspended || this.h.config().audienceControl === false || this.phase !== 'active')return null;
    if(this.suggesting || this.lastSuggestionAt && this.now()-this.lastSuggestionAt < Number(this.h.config().suggestionGapSec ?? 10)*1000)
      return { text:'建议收到，本鲸先把刚才那一步处理完，再听下一条。', applied:false };
    this.suggesting=true;
    try {
      const session=this.data.session, s=await this.h.state();
      if(this.h.config().enabled===false || this.suspended || session!==this.data.session)return null;
      if(!s.online || s.gameOver || !s.playing || s.roundId!==session.roundId)return null;
      if(s.ready===false)return {applied:false,text:'运输公司还在准备中，请稍后再发一次建议。'};
      await this.h.command({action:'strategy',strategy:idea.strategy});
      if(this.h.config().enabled===false || this.suspended || session!==this.data.session)return null;
      this.lastSuggestionAt=this.now();session.acceptedIdeas++;await this.persist();
      return {text:`听${String(username).slice(0,18)}的，接下来${idea.label}。`,applied:true};
    } finally {this.suggesting=false;}
  }
}
