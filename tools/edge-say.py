"""Microsoft Edge synthesis and optional local effects; no local model."""
import argparse
import asyncio
import json
from pathlib import Path
import subprocess
import urllib.request
import edge_tts

FILTERS={
 'sweet':'rubberband=pitch=1.122462:tempo=1:formant=shifted,highpass=f=80,alimiter=limit=0.92:level=false',
 'electro':'rubberband=pitch=1.189207:tempo=1:formant=shifted,highpass=f=100,chorus=0.7:0.9:15|23:0.12|0.08:0.7|1.0:0.4|0.3,tremolo=f=40:d=0.12,alimiter=limit=0.92:level=false',
 'electro_strong':'rubberband=pitch=1.189207:tempo=1:formant=shifted,highpass=f=100,chorus=0.7:0.9:14|24:0.20|0.14:0.8|1.2:0.8|0.6,tremolo=f=45:d=0.40,alimiter=limit=0.92:level=false'}

async def main():
 p=argparse.ArgumentParser();p.add_argument('--list',action='store_true');p.add_argument('--text');p.add_argument('--raw');p.add_argument('--out');p.add_argument('--voice');p.add_argument('--pitch',default='+0Hz');p.add_argument('--rate',default='+0%');p.add_argument('--effect',choices=['normal',*FILTERS],default='normal');p.add_argument('--ffmpeg',default='ffmpeg');a=p.parse_args()
 proxy=urllib.request.getproxies().get('https')
 if a.list:
  voices=await asyncio.wait_for(edge_tts.list_voices(proxy=proxy),45)
  print(json.dumps(voices,ensure_ascii=True));return
 raw=Path(a.raw);out=Path(a.out)
 try:
  if not raw.exists() or raw.stat().st_size<2048:
   tmp=raw.with_suffix('.part.mp3')
   try:
    client=edge_tts.Communicate(Path(a.text).read_text(encoding='utf-8'),a.voice,pitch=a.pitch,rate=a.rate,proxy=proxy,connect_timeout=15,receive_timeout=60)
    await client.save(str(tmp))
    if tmp.stat().st_size<2048: raise RuntimeError('微软服务返回的音频为空')
    tmp.replace(raw)
   finally:
    tmp.unlink(missing_ok=True)
  if a.effect!='normal':
   tmp=out.with_suffix('.part.wav')
   try:
    result=subprocess.run([a.ffmpeg,'-y','-hide_banner','-loglevel','error','-threads','1','-filter_threads','1','-i',str(raw),'-af',FILTERS[a.effect],'-ar','44100','-ac','1','-c:a','pcm_s16le',str(tmp)],capture_output=True,timeout=600,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode: raise RuntimeError('电音处理失败：'+result.stderr.decode('utf-8',errors='replace')[-500:])
    tmp.replace(out)
   finally: tmp.unlink(missing_ok=True)
 except Exception as exc:
  raise RuntimeError(f'Edge TTS / 音效处理失败：{exc}') from exc

if __name__=='__main__':asyncio.run(main())
