// Local preview only: no event injection, public outbox or TTS.
import {loadConfig,getConfig} from '../lib/config.mjs';
import {chatCompletion} from '../lib/ai.mjs';
import {buildSystemPrompt} from '../lib/persona.mjs';
import {LiveAgent,AGENT_RULES,parseDecision} from '../lib/live-agent.mjs';
await loadConfig();
const cfg=getConfig(), agent=new LiveAgent(),events=[];
const scenarios=[
  {trigger:'reply',text:'今天加班好累，来这里坐一会儿',username:'预览观众'},
  {trigger:'proactive',scene:'chat',instruction:'刚才已问过观众喜欢蓝色还是金色，没有人回应；没有新消息，判断是否需要开口。'},
  {trigger:'reply',text:'今天加班好累，来这里坐一会儿',username:'预览观众',instruction:'相同观众的重复消息，没有新信息。'},
];
for (const context of scenarios) {
  if(context.trigger==='proactive') {agent.remember('你更喜欢蓝色还是金色？token来','颜色',true);events.push({kind:'ai',text:'你更喜欢蓝色还是金色？token来'});}
  else events.push({kind:'chat',username:context.username,text:context.text});
  const result=await chatCompletion({...cfg.ai,messages:[
    {role:'system',content:buildSystemPrompt(cfg,{events,playlist:[]})+'\n'+AGENT_RULES},
    {role:'user',content:JSON.stringify({trigger:context.trigger,context,memory:agent.context(events)})},
  ],maxTokens:650,timeoutMs:20000,retries:0});
  const decision=parseDecision(result.text);
  if(!decision)throw new Error('模型输出未通过智能体格式校验');
  const accepted=agent.accept(decision,context.trigger==='proactive');
  console.log(JSON.stringify({trigger:context.trigger,action:decision.action,accepted,text:accepted?decision.text:'',summary:decision.summary,usage:result.usage},null,2));
  if(accepted){agent.remember(decision.text,decision.topic,decision.question);events.push({kind:'ai',text:decision.text});}
}
