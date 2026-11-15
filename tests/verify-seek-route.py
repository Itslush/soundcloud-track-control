import json
import subprocess
from playwright.sync_api import sync_playwright
from userscript_fixture import ROOT, browser_options

modules = subprocess.check_output(['node', '-p', "require('./tests/module-fixture.cjs')(['soundcloud/tempo-wasm.js'])"], cwd=ROOT, text=True, encoding='utf8')
with sync_playwright() as p:
    browser = p.chromium.launch(**browser_options(), headless=True, args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    results = []
    for verified in [True, False]:
        page = browser.new_page()
        page.goto('about:blank')
        page.add_script_tag(content=modules)
        result = page.evaluate('''async verified => {
          const wait = ms=>new Promise(r=>setTimeout(r,ms));
          const ctx=new AudioContext({sampleRate:48000}); await ctx.resume();
          const bytes=new ArrayBuffer(44+48000*8*2), v=new DataView(bytes), text=(i,s)=>[...s].forEach((c,n)=>v.setUint8(i+n,c.charCodeAt(0)));
          text(0,'RIFF');v.setUint32(4,bytes.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,48000,true);v.setUint32(28,96000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,bytes.byteLength-44,true);
          for(let i=0;i<48000*8;i++)v.setInt16(44+i*2,Math.sin(2*Math.PI*440*i/48000)*.15*32767,true);
          const url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));const audio=new Audio(url);audio.volume=.8;
          const hostPause=ctx.createGain(), hostSeek=ctx.createGain(), hostGlitch=ctx.createGain(), analyser=ctx.createAnalyser(), silent=ctx.createGain();
          analyser.fftSize=4096;silent.gain.value=0;hostPause.connect(hostSeek).connect(hostGlitch).connect(analyser).connect(silent).connect(ctx.destination);
          const subscribers=new Set();const level=()=>({volume:audio.volume,muted:audio.muted,outputDb:0});audio.addEventListener('volumechange',()=>{for(const f of subscribers)f(level())});
          const graph=createWasmAudio({audioModules:{}, outputLevel:{subscribeLevel(_audio,fn){subscribers.add(fn);fn(level());return()=>subscribers.delete(fn)}},seekOutput:()=>verified && hostPause.gain.value>=.999?hostGlitch:null, createStretchNode:()=>{}, preservesKey:()=>false,readKeyShift:()=>0,readUseWasm:()=>false,references:new Set(),updateAll(){},apply(){},discover(){},onGraphReady(){}});
          ctx.createMediaElementSource(audio).connect(hostPause);await audio.play();
          const buffer=ctx.createBuffer(2,ctx.sampleRate*6,ctx.sampleRate);for(let c=0;c<2;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++)a[i]=.15*Math.sin(2*Math.PI*440*i/ctx.sampleRate)}
          const route=graph.beginCrossfade(audio,buffer,0,1,5,null,true);hostSeek.gain.value=0;
          const sample=async()=>{await wait(150);const a=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(a);return {rms:Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length),time:ctx.currentTime-route.startedAt}};
          const high=await sample();audio.volume=.2;const low=await sample();audio.muted=true;const mute=await sample();audio.muted=false;audio.volume=.8;const restored=await sample();hostGlitch.gain.value=.25;const downstream=await sample();hostGlitch.gain.value=1;hostSeek.gain.value=1;const reopened=await sample();
          hostPause.gain.value=.5;const pauseRouteValid=route.valid();route.dispose();audio.pause();await ctx.close();URL.revokeObjectURL(url);return {verified,high,low,mute,restored,downstream,reopened,pauseRouteValid};
        }''', verified)
        correct = lambda x: x['rms'] / max(.01, 1 - x['time']/5)
        if verified:
            assert result['pauseRouteValid'] is False, result
            assert result['high']['rms'] > .01, result
            assert .20 < correct(result['low']) / correct(result['high']) < .30, result
            assert result['mute']['rms'] < .00001, result
            assert .90 < correct(result['restored']) / correct(result['high']) < 1.10, result
            assert .20 < correct(result['downstream']) / correct(result['restored']) < .30, result
        else:
            assert result['pauseRouteValid'] is True, result
            assert max(result[k]['rms'] for k in ['high','low','mute','restored','downstream']) < .00001, result
            assert result['reopened']['rms'] > .01, result
        results.append(result)
        page.close()
    browser.close()
    print(json.dumps(results))
