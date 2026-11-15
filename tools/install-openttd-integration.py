from pathlib import Path
import json, shutil
root=Path('D:/dafeiyu/Dsh_douyin')
backup=root/'data/backups/openttd-migration-20261113'
backup.mkdir(parents=True,exist_ok=True)
files=['server.mjs','lib/config.mjs','lib/mindustry-director.mjs','lib/mindustry.mjs','public/app.js','public/admin.js','public/admin.html','public/app.css','public/index.html','public/mindustry-view.js','config.json','config.example.json','README.md','tools/start-mindustry.mjs','启动Mindustry直播.cmd']
for f in files:
 p=root/f
 if p.exists():
  dest=backup/f;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
for f in files:
 if f in ['config.json','README.md','lib/mindustry.mjs']:continue
 p=root/f
 if not p.exists():continue
 s=p.read_text(encoding='utf-8-sig').replace('MINDUSTRY','OPENTTD').replace('Mindustry','OpenTTD').replace('mindustry','openttd')
 new=root/f.replace('mindustry','openttd').replace('Mindustry','OpenTTD')
 new.write_text(s,encoding='utf-8')
 if new!=p:p.unlink()
cfg=json.loads((root/'config.json').read_text(encoding='utf-8-sig'))
cfg['openttd']=cfg.pop('mindustry',{})
cfg['gameplay']={'enabled':True}
cfg['broadcast']['forced']='chat'
(root/'config.json').write_text(json.dumps(cfg,ensure_ascii=False,indent=2),encoding='utf-8')
p=root/'lib/openttd-director.mjs';s=p.read_text(encoding='utf-8');idx=s.index('/** Hooks')
prefix='''export function gameIdleSeconds(cfg, mode) {
  return Number(mode === 'openttd' ? cfg.openttd?.idleTalkSec ?? 60 : cfg.guide?.idleEverySec ?? 30);
}
export function gameProgress(s) {
  if (!s.online || !s.playing) return '';
  if(s.paused) return '本鲸先暂停一下运输经营，陪你们聊聊线路规划。';
  if(!s.ready) return '本鲸正在准备运输公司，等真实经营数据回来再汇报。';
  return `本鲸正在${s.activity}，目前有${s.vehicles}辆公交、${s.stations}座车站，公司现金${s.money}英镑。`;
}
export function parseGameSuggestion(raw) {
 const t=String(raw||'').replace(/[，,。！!？?\\s]/g,'').slice(0,100);
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

'''
s=prefix+s[idx:];s=s.replace('本鲸开一局 OpenTTD，你们可以建议先挖铜、加炮塔，或者补弹药。','本鲸开一局 OpenTTD，从公交运输开始。你们可以发“暂停经营”或“继续经营”，一起讨论线路。').replace('本鲸的单位还在重生，等回来后再给本鲸发一次建议吧。','运输公司还在准备中，请稍后再发一次建议。')
p.write_text(s,encoding='utf-8')
p=root/'public/openttd-view.js';s=p.read_text(encoding='utf-8');s=s.replace("`${s.paused?'已暂停 · ':''}${s.activity} · 波次 ${s.wave || 1}${s.core?' · 铜 '+s.core.copper:''}`", "`${s.paused?'已暂停 · ':''}${s.activity || '准备经营'}${s.ready?' · 公交 '+s.vehicles+' · 车站 '+s.stations+' · £'+s.money:''}`")
p.write_text(s,encoding='utf-8')
p=root/'public/admin.html';s=p.read_text(encoding='utf-8').replace('先挖铜 / 挖铅 / 多建炮塔 / 加固防线 / 补弹药 / 继续自动玩','暂停经营 / 继续经营').replace('固定策略自动采集铜矿、运回核心并建设基础防线','固定策略自动修建公交站、购车并安排客运；当前从城市公交起步，铁路、飞机和港口可在原生游戏里手动经营')
p.write_text(s,encoding='utf-8')
