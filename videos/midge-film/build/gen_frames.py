#!/usr/bin/env python3
"""Generates the 14 frame sub-compositions of the Midge film. One shared look, one timeline per frame.
Run from the project root:  python3 build/gen_frames.py"""
import os, re, urllib.parse
OUT = 'compositions/frames'
FRAMES = [("01-in-the-open",7),("02-two-bad-choices",7),("03-the-idea",8),("04-who",6),("05-auction-seal",9),
          ("06-auction-rules",10),("07-auction-result",7),("08-payroll",9),("09-one-pattern",5),("10-hosts",9),
          ("11-on-near",10),("12-the-exit",11),("13-network",7),("14-close",7)]

NOISE = "data:image/svg+xml," + urllib.parse.quote(
 "<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='7'/>"
 "<feColorMatrix values='0 0 0 0 .45  0 0 0 0 .47  0 0 0 0 .46  0 0 0 .55 0'/></filter><rect width='256' height='256' filter='url(#n)'/></svg>")

KIT_CSS = """
@font-face{font-family:'Geist';font-weight:400 500;font-style:normal;font-display:block;src:url('assets/fonts/Geist-400.woff2') format('woff2');}
@font-face{font-family:'Geist Mono';font-weight:400;font-style:normal;font-display:block;src:url('assets/fonts/GeistMono-400.woff2') format('woff2');}
@font-face{font-family:'Newsreader';font-weight:300 400;font-style:normal;font-display:block;src:url('assets/fonts/Newsreader-300.woff2') format('woff2');}
#root{position:relative;width:1920px;height:1080px;overflow:hidden}
#root *{box-sizing:border-box;margin:0;padding:0}
.P-stage{position:absolute;left:0;top:0;width:1920px;height:1080px;overflow:hidden;background:#eef0ec}
.P-stage *{position:absolute}
.P-cam{left:0;top:0;width:1920px;height:1080px;transform-origin:50% 45%}
.P-vig{left:0;top:0;width:1920px;height:1080px;pointer-events:none;background:radial-gradient(120% 90% at 50% 45%,rgba(21,24,26,0) 55%,rgba(21,24,26,.07) 100%)}
.P-noise{left:0;top:0;width:1920px;height:1080px;pointer-events:none;opacity:.22;background-image:url("NOISEURL");background-size:256px 256px}
.P-d{font-family:'Newsreader',serif;font-weight:300;letter-spacing:-.025em;line-height:1.04;color:#15181a;white-space:nowrap}
.P-m{font-family:'Geist Mono',monospace;font-weight:400;font-size:28px;color:#5f6764;white-space:nowrap}
.P-b{font-family:'Geist',sans-serif;font-weight:400;color:#4a5250;white-space:nowrap}
.P-ink{color:#15181a}
.P-w{position:relative !important;display:inline-block;white-space:pre}
.P-hl{background:rgba(21,24,26,.13)}
.P-fld{overflow:hidden;background:#0f2b2d;border-radius:10px}
.P-fld i{border-radius:50%;filter:blur(50px)}
.P-fld.P-grey{background:#c9cfc9}
.P-edge{border-radius:10px;box-shadow:0 0 0 1px rgba(21,24,26,.55),0 46px 96px -30px rgba(15,43,45,.45)}
.P-pt{width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;background:#f4f6f1;box-shadow:0 0 10px rgba(244,246,241,.9),0 0 34px rgba(190,235,225,.55)}
.P-dot{width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:#15181a}
.P-warm{width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#f3a56b;box-shadow:0 0 14px #f6b98a,0 0 50px rgba(217,130,74,.85),0 0 130px rgba(217,130,74,.5)}
.P-glow{border-radius:50%;pointer-events:none}
"""

KIT_JS = """
var ID="FRAMEID",DUR=FRAMEDUR;
var R=document.querySelector('[data-composition-id="'+ID+'"]');
function $(s){return R.querySelectorAll(s)}
var tl=gsap.timeline({paused:true});
function inb(s,t,o){o=o||{};tl.fromTo($(s),{opacity:0,filter:"blur(16px)",y:o.y==null?16:o.y},{opacity:o.to==null?1:o.to,filter:"blur(0px)",y:0,duration:o.d||0.9,ease:"power3.out",stagger:o.st||0},t)}
function outb(s,t,d){tl.to($(s),{opacity:0,filter:"blur(14px)",y:-10,duration:d||0.5,ease:"power2.in"},t)}
function words(s,t,st){tl.fromTo($(s+" .P-w"),{opacity:0,filter:"blur(14px)",y:20},{opacity:1,filter:"blur(0px)",y:0,duration:0.85,ease:"power3.out",stagger:st||0.07},t)}
function fade(s,t,to,d){tl.fromTo($(s),{opacity:0},{opacity:to==null?1:to,duration:d||0.8,ease:"power2.out"},t)}
function growX(s,t,d,st){tl.fromTo($(s),{scaleX:0},{scaleX:1,duration:d||0.9,ease:"power3.inOut",stagger:st||0},t)}
function growY(s,t,d,st){tl.fromTo($(s),{scaleY:0},{scaleY:1,duration:d||0.9,ease:"power3.inOut",stagger:st||0},t)}
function pop(s,t,st){tl.fromTo($(s),{scale:0,opacity:0},{scale:1,opacity:1,duration:0.7,ease:"back.out(2)",stagger:st||0.09},t)}
function drift(s,amp){Array.prototype.forEach.call($(s),function(el,i){var a=((i*137.5+40)%360)*Math.PI/180;tl.fromTo(el,{x:-Math.cos(a)*amp*0.5,y:-Math.sin(a)*amp*0.4},{x:Math.cos(a)*amp*0.5,y:Math.sin(a)*amp*0.4,duration:DUR,ease:"sine.inOut"},0)})}
function draw(s,t,d){Array.prototype.forEach.call($(s),function(p){var L=p.getTotalLength();tl.fromTo(p,{strokeDasharray:L,strokeDashoffset:L},{strokeDashoffset:0,duration:d||1,ease:"power2.inOut"},t)})}
function cam(a,b){tl.fromTo($(".P-cam"),{scale:a},{scale:b,duration:DUR,ease:"sine.inOut"},0)}
drift(".P-fld i",90);
"""

def W(text):
    return ''.join(f'<span class="P-w">{w} </span>' for w in text.split(' '))

TEAL = [(-12,-8,62,58,'#8fd4c4'),(52,6,46,70,'#2f8f86'),(8,58,44,40,'#58b3a5'),(58,66,38,34,'#bfe9dc'),(30,30,26,26,'#103a3b')]
GREY = [(-10,-6,60,56,'#dfe4de'),(50,10,46,66,'#aab3ad'),(10,58,46,40,'#bcc4be')]
PTS6 = [(34,42),(50,31),(63,49),(45,63),(71,29),(27,59)]
def field(cls,x,y,w,h,blobs=TEAL,pts=PTS6,extra='',grey=False,edge=True):
    b=''.join(f'<i style="left:{l}%;top:{t}%;width:{bw}%;height:{bh}%;background:{c}"></i>' for l,t,bw,bh,c in blobs)
    p=''.join(f'<b class="P-pt {cls}-pt" style="left:{px}%;top:{py}%"></b>' for px,py in pts)
    return (f'<div class="{cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">'
            f'<div class="P-fld {"P-grey" if grey else ""} {"P-edge" if edge else ""}" style="left:0;top:0;width:{w}px;height:{h}px">{b}{p}{extra}</div></div>')
def hl_h(cls,y,x=0,w=1920): return f'<i class="P-hl {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:1px;transform-origin:0 50%"></i>'
def hl_v(cls,x,y=0,h=1080): return f'<i class="P-hl {cls}" style="left:{x}px;top:{y}px;width:1px;height:{h}px;transform-origin:50% 0"></i>'
def glow(cls,x,y,w,h,rgba): return f'<i class="P-glow {cls}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px;background:radial-gradient(closest-side,{rgba},rgba(255,255,255,0))"></i>'

F = {}

# ---------------- 01 in the open ----------------
g01=[(905,400),(965,372),(1010,418),(948,455),(1042,378),(880,446)]
start01=[(420,180),(1500,150),(1640,640),(300,700),(1180,90),(700,820)]
edges01=[(0,60),(1920,40),(1920,900),(0,980),(1300,0),(560,1080)]
html=''.join(f'<b class="P-dot a-dot a-d{i}" style="left:{x}px;top:{y}px"></b><i class="a-ring a-r{i}" style="left:{x-26}px;top:{y-26}px"></i>' for i,(x,y) in enumerate(g01))
svg='<svg class="a-svg" viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px">'+''.join(f'<path class="a-sight" d="M {ex} {ey} L {x} {y}" fill="none" stroke="rgba(21,24,26,.22)" stroke-width="1.2"/>' for (ex,ey),(x,y) in zip(edges01,g01))+'</svg>'
F["01-in-the-open"]=dict(css="""
.a-ring{width:52px;height:52px;border-radius:50%;border:1.2px solid rgba(21,24,26,.5)}
.a-h{left:0;top:660px;width:1920px;text-align:center;font-size:104px}
.a-s{left:0;top:812px;width:1920px;text-align:center;font-size:38px}
""",html=glow('a-wash',560,60,800,640,'rgba(190,205,225,.5)')+svg+html+f'<p class="P-d a-h">{W("A group decides together.")}</p><p class="P-b a-s">{W("On a public chain, everyone is watching.")}</p>',
js="cam(1,1.05);fade('.a-wash',0,1,2);var S="+str([[sx-gx,sy-gy] for (sx,sy),(gx,gy) in zip(start01,g01)])+""";
S.forEach(function(d,i){tl.fromTo($('.a-d'+i),{x:d[0],y:d[1],opacity:0},{x:0,y:0,opacity:1,duration:1.7,ease:"power3.out"},0.1+i*0.08)});
words('.a-h',0.9);draw('.a-sight',2.6,1.3);
tl.fromTo($('.a-ring'),{scale:2.2,opacity:0},{scale:1,opacity:1,duration:0.6,ease:"power3.out",stagger:0.12},3.5);
words('.a-s',4.3,0.06);""")

# ---------------- 02 two bad choices ----------------
F["02-two-bad-choices"]=dict(css="""
.b-lab{left:140px;top:120px}
.b-stem{left:140px;top:486px;font-size:84px}
.b-br{left:640px;top:372px;width:60px;height:330px;border:1.4px solid rgba(21,24,26,.3);border-right:0;border-radius:10px 0 0 10px;transform-origin:0 50%}
.b-o{font-size:84px;left:730px}.b-o1{top:316px}.b-o2{top:646px}
.b-e{font-size:84px;left:730px;color:#5f6764}.b-e1{top:412px}.b-e2{top:742px}
.b-x{height:2px;background:#15181a;transform-origin:0 50%;left:724px}
.b-x1{top:466px;width:660px}.b-x2{top:796px;width:900px}
""",html='<p class="P-m b-lab">before</p>'+f'<p class="P-d b-stem">{W("A group can")}</p><i class="b-br"></i>'
 f'<p class="P-d b-o b-o1">{W("act in the open")}</p><p class="P-d b-e b-e1">{W("and show its hand.")}</p><i class="b-x b-x1"></i>'
 f'<p class="P-d b-o b-o2">{W("trust an operator")}</p><p class="P-d b-e b-e2">{W("and hand over the money.")}</p><i class="b-x b-x2"></i>',
js="""cam(1.03,1);fade('.b-lab',0.2);words('.b-stem',0.3);
tl.fromTo($('.b-br'),{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:0.7,ease:"power3.out"},1.0);
words('.b-o1',1.3);words('.b-e1',2.1);growX('.b-x1',3.0,0.6);tl.to($('.b-e1,.b-o1'),{opacity:0.38,duration:0.6},3.3);
words('.b-o2',3.6);words('.b-e2',4.4);growX('.b-x2',5.3,0.6);tl.to($('.b-e2,.b-o2'),{opacity:0.38,duration:0.6},5.6);""")

# ---------------- 03 the idea ----------------
rx,ry,rs=700,112,520
F["03-the-idea"]=dict(css=f"""
.c-door{{left:{rx+rs-4}px;top:{ry+135}px;width:9px;height:250px;background:#15181a;border-radius:2px;box-shadow:0 0 26px rgba(190,235,225,.8);transform-origin:50% 0}}
.c-h{{left:0;top:716px;width:1920px;text-align:center;font-size:92px}}
.c-t{{left:0;top:908px;width:1920px;text-align:center}}
""",html=glow('c-wash',340,-130,1240,1000,'rgba(124,196,184,.5)')+glow('c-wash2',1000,216,700,580,'rgba(200,222,240,.6)')
 +hl_h('c-hh',ry)+hl_h('c-hh',ry+rs)+hl_v('c-hv',rx,0,660)+hl_v('c-hv',rx+rs,0,660)
 +field('c-room',rx,ry,rs,rs)+'<i class="c-door"></i>'
 +f'<p class="P-d c-h">{W("Midge separates deciding from holding.")}</p><p class="P-m c-t">Private rooms with public rules</p>',
js="""cam(1.06,1);growX('.c-hh',0.1,1.1,0.15);growY('.c-hv',0.3,1.1,0.15);
tl.fromTo($('.c-room'),{opacity:0,scale:0.9,filter:"blur(24px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:1.4,ease:"power3.out"},0.4);
fade('.c-wash',0.8,1,2.2);fade('.c-wash2',1.4,1,2.2);pop('.c-room-pt',1.3,0.12);
tl.fromTo($('.c-door'),{scaleY:0,opacity:1},{scaleY:1,duration:1.0,ease:"power4.inOut"},2.7);
tl.fromTo($('.c-room'),{y:0},{y:0,duration:0.1},3.7);
words('.c-h',4.0);fade('.c-t',5.6);""")

# ---------------- 04 who ----------------
names=["AI agents","Funds","Businesses","People"]
F["04-who"]=dict(css="""
.d-n{left:1010px;font-size:104px}
.d-s{left:1014px;top:810px;font-size:36px}
""",html=glow('d-wash',-60,60,1000,960,'rgba(124,196,184,.42)')+hl_h('d-hh',250)+hl_h('d-hh',770)+field('d-room',220,250,520,520,pts=PTS6+[(56,74)])
 +''.join(f'<p class="P-d d-n d-n{i}" style="top:{232+i*128}px">{n}</p>' for i,n in enumerate(names))
 +f'<p class="P-b d-s">{W("The rules treat every member the same.")}</p>',
js="""cam(1,1.04);growX('.d-hh',0,1.2,0.1);fade('.d-wash',0,1,1.5);
tl.fromTo($('.d-room'),{opacity:0,x:-40},{opacity:1,x:0,duration:1,ease:"power3.out"},0);
tl.fromTo($('.d-n'),{opacity:0,filter:"blur(14px)",x:30},{opacity:0.26,filter:"blur(0px)",x:0,duration:0.8,ease:"power3.out",stagger:0.1},0.2);
var P=$('.d-room-pt');
[0,1,2,3].forEach(function(i){var t=1.0+i*0.85;tl.to($('.d-n'+i),{opacity:1,duration:0.3,ease:"power2.out"},t);tl.to($('.d-n'+i),{opacity:0.26,duration:0.4},t+0.7);
 tl.fromTo(P[i+1],{scale:1},{scale:1.9,duration:0.3,ease:"power2.out"},t);tl.to(P[i+1],{scale:1,duration:0.5},t+0.4);});
tl.to($('.d-n'),{opacity:1,duration:0.6,stagger:0.05},4.5);words('.d-s',3.0,0.05);""")

# ---------------- 05 auction: the bids ----------------
bids=[("4.20","a9f3·e1"),("3.75","07bc·4d"),("5.10","c2e8·9a")]
ys=[360,540,720]
h5='<p class="P-m e-lab">a sealed auction</p>'+glow('e-wash',760,120,860,860,'rgba(124,196,184,.45)')
for i,((v,c),y) in enumerate(zip(bids,ys)):
    h5+=f'<b class="P-dot e-dot" style="left:200px;top:{y}px"></b>'+hl_h('e-tr',y,250,690)
    h5+=f'<p class="P-m e-bid e-b{i}" style="left:262px;top:{y-64}px">{v}</p><p class="P-m e-cip e-c{i}" style="left:262px;top:{y-58}px">{c}</p>'
h5+=field('e-room',940,280,520,520,pts=[])
h5+=f'<p class="P-b e-t1">Each bid is sealed<br>and signed.</p><p class="P-b P-ink e-t2">Only the room<br>can open it.</p>'
F["05-auction-seal"]=dict(css="""
.e-lab{left:140px;top:120px}
.e-bid{font-size:48px;color:#15181a}.e-cip{z-index:3;font-size:38px;color:#eaf6f1;text-shadow:0 0 18px rgba(190,235,225,.8)}
.e-tr{background:rgba(21,24,26,.16)}
.e-t1,.e-t2{left:1540px;font-size:36px;line-height:1.3;white-space:normal;width:340px}.e-t1{top:372px}.e-t2{top:600px}
""",html=h5,js="""cam(1,1.04);fade('.e-lab',0.2);fade('.e-wash',0,1,1.6);pop('.e-dot',0.2,0.15);growX('.e-tr',0.5,1.0,0.15);
tl.fromTo($('.e-room'),{opacity:0,scale:0.94,filter:"blur(20px)"},{opacity:1,scale:1,filter:"blur(0px)",duration:1.2,ease:"power3.out"},0.2);
[0,1,2].forEach(function(i){var t=1.3+i*1.35;
 tl.fromTo($('.e-b'+i),{opacity:0,x:0,filter:"blur(8px)"},{opacity:1,filter:"blur(0px)",duration:0.4},t-0.45);
 tl.to($('.e-b'+i),{x:520,opacity:0,filter:"blur(12px)",duration:1.1,ease:"power2.in"},t);
 tl.fromTo($('.e-c'+i),{x:300,opacity:0,filter:"blur(14px)"},{x:790,opacity:1,filter:"blur(0px)",duration:1.5,ease:"power3.inOut"},t+0.25);});
inb('.e-t1',2.2);inb('.e-t2',6.0);
tl.to($('.e-cip'),{scale:1.06,duration:0.5,ease:"sine.inOut",stagger:0.1},6.4);tl.to($('.e-cip'),{scale:1,duration:0.6,stagger:0.1},6.9);""")

# ---------------- 06 auction: the rules ----------------
plane=('<i class="f-gl" style="top:0"></i><i class="f-gl" style="top:25%"></i><i class="f-gl" style="top:50%"></i><i class="f-gl" style="top:75%"></i><i class="f-gl" style="top:100%"></i>'
 '<i class="f-gv" style="left:0"></i><i class="f-gv" style="left:100%"></i><i class="f-gv" style="left:52%"></i>'
 '<div class="f-bar f-key f-k1" style="top:8%;width:100%"><div class="P-fld f-kf" style="left:0;top:0;width:100%;height:100%;border-radius:5px">'
 '<i style="left:-4%;top:-120%;width:30%;height:340%;background:#8fd4c4"></i><i style="left:26%;top:-100%;width:26%;height:300%;background:#1f5f5b"></i>'
 '<i style="left:50%;top:-140%;width:24%;height:380%;background:#58b3a5"></i><i style="left:72%;top:-100%;width:30%;height:300%;background:#17494a"></i></div><span class="f-lab" data-layout-allow-overlap>Pay only these accounts</span></div>'
 '<div class="f-bar f-k2" style="top:25%;width:100%"><span class="f-lab" data-layout-allow-overlap>up to this much</span></div>'
 '<div class="f-bar f-k3" style="top:42%;width:100%"><span class="f-lab" data-layout-allow-overlap>before this date</span></div>'
 '<div class="f-bar f-deny" style="top:63%;width:78%"><span class="f-lab" data-layout-allow-overlap>to: a stranger</span><i class="f-strike"></i></div>')
F["06-auction-rules"]=dict(css="""
.f-scene{left:0;top:0;width:1920px;height:1080px;perspective:2880px;perspective-origin:62% 30%}
.f-plane{left:430px;top:0px;width:1420px;height:768px;transform:rotateX(58deg) rotateZ(-27deg);transform-style:preserve-3d}
.f-soft{left:0;top:0;width:1920px;height:1080px;filter:blur(10px);-webkit-mask-image:linear-gradient(64deg,#000 12%,transparent 46%);mask-image:linear-gradient(64deg,#000 12%,transparent 46%)}
.f-sharp{left:0;top:0;width:1920px;height:1080px;-webkit-mask-image:linear-gradient(64deg,transparent 14%,#000 44%);mask-image:linear-gradient(64deg,transparent 14%,#000 44%)}
.f-bar{left:0;height:88px;border-radius:5px;background:rgba(21,24,26,.06);transform-origin:100% 50%}
.f-lab{right:28px;top:16px;font-family:'Geist',sans-serif;font-size:42px;color:#15181a;white-space:nowrap}
.f-key{background:none;box-shadow:0 30px 50px -24px rgba(15,43,45,.5)}
.f-key .f-lab{color:#f4f6f1;font-family:'Newsreader',serif;font-weight:400;font-size:50px;top:10px}
.f-deny{background:rgba(224,103,90,.10);box-shadow:inset 0 0 0 1.4px rgba(224,103,90,.6)}
.f-deny .f-lab{color:#b8463a}
.f-strike{left:-1%;top:43px;width:102%;height:3px;background:#e0675a;box-shadow:0 0 22px rgba(224,103,90,.7);transform-origin:0 50%}
.f-gl{left:0;width:100%;height:1px;background:rgba(21,24,26,.10)}
.f-gv{top:-30%;height:160%;width:1px;background:rgba(21,24,26,.10)}
.f-tag{left:126px;top:120px}
.f-h{left:122px;font-size:108px}.f-h1{top:724px}.f-h2{top:836px}
.f-ref{right:126px;top:936px;color:#b8463a}
""",html=glow('f-teal',920,-90,860,560,'rgba(124,196,184,.42)')+glow('f-red',480,440,560,330,'rgba(224,103,90,.34)')
 +f'<div class="f-soft"><div class="f-scene"><div class="f-plane">{plane}</div></div></div><div class="f-sharp"><div class="f-scene"><div class="f-plane">{plane}</div></div></div>'
 +'<p class="P-m f-tag">the rules, posted in public</p>'
 +f'<p class="P-d f-h f-h1">{W("The room can propose.")}</p><p class="P-d f-h f-h2">{W("The contract decides.")}</p><p class="P-m f-ref">to: a stranger · refused</p>',
js="""fade('.f-teal',0,1,2);fade('.f-tag',0.3);
tl.fromTo($('.f-plane'),{rotationX:58,rotationZ:-30,y:20},{rotationX:58,rotationZ:-26,y:-10,duration:DUR,ease:"sine.inOut"},0);
fade('.f-gl,.f-gv',0.1,1,1.2);
tl.fromTo($('.f-k1'),{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:1.2,ease:"power3.out"},0.6);
tl.fromTo($('.f-k2'),{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:1.0,ease:"power3.out"},1.9);
tl.fromTo($('.f-k3'),{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:1.0,ease:"power3.out"},3.0);
tl.fromTo($('.f-deny'),{scaleX:0,opacity:0},{scaleX:1,opacity:1,duration:0.9,ease:"power3.out"},4.4);
tl.fromTo($('.f-strike'),{scaleX:0},{scaleX:1,duration:0.45,ease:"power4.in"},5.5);
fade('.f-red',5.8,1,0.7);tl.fromTo($('.f-deny'),{x:0},{x:-14,duration:0.08,yoyoEase:false},5.95);tl.to($('.f-deny'),{x:0,duration:0.5,ease:"elastic.out(1,0.4)"},6.03);
fade('.f-ref',6.1);words('.f-h1',6.7);words('.f-h2',7.7);""")

# ---------------- 07 auction: the result ----------------
members7=[(330,300),(330,650),(1590,300)]
win7=(1590,650)
h7=glow('g-wash',480,0,960,900,'rgba(124,196,184,.42)')+field('g-room',740,230,440,440,pts=[(50,50)])
svg7='<svg viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px">'
for i,(x,y) in enumerate(members7):
    ex = 740 if x<960 else 1180
    svg7+=f'<path class="g-back" d="M {ex} {450+(y-475)*0.35:.0f} L {x} {y}" fill="none" stroke="rgba(217,130,74,.55)" stroke-width="1.6"/>'
svg7+=f'<path class="g-pay" d="M 1180 {450+(650-475)*0.35:.0f} L {win7[0]} {win7[1]}" fill="none" stroke="#1f5f5b" stroke-width="2"/></svg>'
h7+=svg7+''.join(f'<b class="P-dot g-dot" style="left:{x}px;top:{y}px"></b><b class="P-warm g-ret g-ret{i}" style="left:{x}px;top:{y}px"></b>' for i,(x,y) in enumerate(members7))
h7+=f'<b class="P-dot g-dot" style="left:{win7[0]}px;top:{win7[1]}px"></b><b class="P-pt g-res" style="left:{win7[0]}px;top:{win7[1]}px;background:#1f5f5b;box-shadow:0 0 20px rgba(31,95,91,.8)"></b>'
h7+='<p class="P-m g-l1" style="left:1420px;top:690px">paid, under the rules</p><p class="P-m g-l2" style="left:236px;top:206px">deposit returned</p>'
h7+=f'<p class="P-d g-h g-h1">{W("One result comes out.")}</p><p class="P-d g-h g-h2">{W("The others get their deposits back.")}</p><p class="P-d g-h g-h3">{W("Nobody in the room holds the cash.")}</p>'
F["07-auction-result"]=dict(css="""
.g-h{left:0;top:800px;width:1920px;text-align:center;font-size:88px}
.g-ret{width:18px;height:18px;margin:-9px 0 0 -9px}
""",html=h7,js="""cam(1.04,1);fade('.g-wash',0,1,1.2);
tl.fromTo($('.g-room'),{opacity:0,scale:0.95},{opacity:1,scale:1,duration:0.9,ease:"power3.out"},0);pop('.g-dot',0.2,0.1);
words('.g-h1',0.3);draw('.g-pay',0.9,1.1);
tl.fromTo($('.g-res'),{x:-410,y:-139,opacity:0},{x:0,y:0,opacity:1,duration:1.1,ease:"power2.inOut"},0.9);
tl.to($('.g-res'),{scale:1.8,duration:0.25},2.0);tl.to($('.g-res'),{scale:1,duration:0.5},2.25);fade('.g-l1',2.0);
outb('.g-h1',1.9);words('.g-h2',2.3,0.05);draw('.g-back',2.8,1.2);
var D=[[410,53],[410,-70],[-410,53]];D.forEach(function(d,i){tl.fromTo($('.g-ret'+i),{x:d[0],y:d[1],opacity:0},{x:0,y:0,opacity:1,duration:1.2,ease:"power2.inOut"},2.8+i*0.12);
 tl.to($('.g-ret'+i),{opacity:0,scale:2.2,duration:0.7,ease:"power2.out"},4.05+i*0.12);});
fade('.g-l2',3.9);outb('.g-h2',3.9);words('.g-h3',4.3,0.06);""")

# ---------------- 08 payroll ----------------
rows=[("7f3a…c91e","1.20"),("b04d…22a7","0.85"),("e91c…5d03","1.60"),("3c7e…a418","0.95")]
h8='<p class="P-m h-lab">a pay run</p>'+glow('h-wash',900,80,900,760,'rgba(217,130,74,.30)')
for i,(a,v) in enumerate(rows):
    y=236+i*96
    h8+=f'<div class="h-row h-r{i}" style="top:{y}px"><p class="P-m h-a">{a}</p><p class="P-m h-v">{v} NEAR</p><i class="P-hl h-ru"></i></div>'
h8+='<i class="h-link"></i><div class="h-rec"><p class="P-m h-rl">receipt · for one payee only</p><i class="h-ln" style="top:112px;width:86%"></i><i class="h-ln" style="top:168px;width:54%"></i><i class="h-ln" style="top:224px;width:78%"></i><i class="h-ln" style="top:280px;width:42%"></i></div>'
h8+=f'<p class="P-b h-t h-t1">{W("The chain cannot name who was paid.")}</p><p class="P-b h-t h-t2">{W("Each payee holds a private receipt.")}</p><p class="P-b P-ink h-t h-t3">{W("The amounts stay public.")}</p>'
F["08-payroll"]=dict(css="""
.h-lab{left:140px;top:120px}
.h-row{left:140px;width:800px;height:70px}.h-a{left:0;top:10px;font-size:32px}.h-v{right:0;top:10px;font-size:32px;color:#15181a}.h-ru{left:0;top:68px;width:800px;height:1px}
.h-link{left:940px;top:400px;width:180px;height:1.6px;background:#d9824a;transform-origin:0 50%}
.h-rec{left:1120px;top:226px;width:600px;height:388px;border:1.6px solid #d9824a;background:rgba(217,130,74,.09);border-radius:6px;transform-origin:0 45%}
.h-rl{left:36px;top:36px;color:#a85a28;font-size:28px}.h-ln{left:36px;height:1.6px;background:rgba(217,130,74,.7);transform-origin:0 50%}
.h-t{left:140px;font-size:44px}.h-t1{top:690px}.h-t2{top:760px}.h-t3{top:830px}
""",html=h8,js="""cam(1,1.03);fade('.h-lab',0.2);
tl.fromTo($('.h-row'),{opacity:0,y:18,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.7,ease:"power3.out",stagger:0.4},0.5);
words('.h-t1',2.6,0.05);
tl.to($('.h-r1 .h-a'),{color:"#a85a28",duration:0.4},4.0);growX('.h-link',4.0,0.5);
tl.fromTo($('.h-rec'),{scaleX:0.02,scaleY:0.1,opacity:0},{scaleX:1,scaleY:1,opacity:1,duration:0.9,ease:"power3.out"},4.4);fade('.h-wash',4.4,1,1.4);
fade('.h-rl',5.0);growX('.h-ln',5.1,0.6,0.12);words('.h-t2',5.0,0.05);
words('.h-t3',6.8,0.06);tl.to($('.h-v'),{scale:1.12,duration:0.35,ease:"power2.out",stagger:0.08,transformOrigin:"100% 50%"},6.9);tl.to($('.h-v'),{scale:1,duration:0.5,stagger:0.08},7.3);""")

# ---------------- 09 one pattern ----------------
cols=[["Quotes","Votes","Block trades","Payroll","Auctions","Votes"],["Auctions","Agent budgets","Quotes","Votes","Pooled investing","Payroll"],["Votes","Payroll","Pooled investing","Auctions","Agent budgets","Block trades"]]
xs=[150,640,1290]
h9=''
for i,(c,x) in enumerate(zip(cols,xs)):
    h9+=f'<div class="i-win" style="left:{x}px"><div class="i-strip i-s{i}">'+''.join(f'<p class="P-d i-wd" style="top:{j*130}px">{w}</p>' for j,w in enumerate(c))+'</div></div>'
h9+=f'<p class="P-d i-h">{W("One pattern.")}</p>'
F["09-one-pattern"]=dict(css="""
.i-win{top:200px;width:620px;height:390px;overflow:hidden;-webkit-mask-image:linear-gradient(transparent 4%,#000 38%,#000 62%,transparent 96%);mask-image:linear-gradient(transparent 4%,#000 38%,#000 62%,transparent 96%)}
.i-strip{left:0;top:0;width:620px;height:780px}.i-wd{left:0;font-size:92px}
.i-h{left:0;top:720px;width:1920px;text-align:center;font-size:120px}
""",html=h9,js="""cam(1.03,1);
[0,1,2].forEach(function(i){tl.fromTo($('.i-s'+i),{y:260,opacity:0},{y:-390,opacity:1,duration:1.5+i*0.55,ease:"power4.out"},0.1+i*0.12);});
words('.i-h',3.0,0.1);""")

# ---------------- 10 hosts ----------------
h10='<p class="P-m j-lab">a room runs on secure hardware</p>'+glow('j-wash',460,-60,1000,840,'rgba(124,196,184,.42)')+field('j-room',760,130,400,400,pts=PTS6[:5])
h10+='<i class="j-stem"></i>'
h10+='<div class="j-slab j-s1"><div class="j-box" style="left:0;width:560px"><p class="P-m">our program · Phala</p></div></div>'
h10+='<div class="j-slab j-s2"><div class="j-box" style="left:0;width:560px"><p class="P-m">a model · NEAR AI Cloud</p></div></div>'
h10+='<div class="j-slab j-s3"><div class="j-box" style="left:0;width:268px"><p class="P-m">host one</p><i class="j-tk"></i></div><div class="j-box" style="left:292px;width:268px"><p class="P-m">host two</p><i class="j-tk"></i></div></div>'
h10+=f'<p class="P-d j-h j-h1">{W("Our program, hosted on Phala.")}</p><p class="P-d j-h j-h2">{W("Or sealed to a model on NEAR AI Cloud.")}</p><p class="P-d j-h j-h3">{W("Or two hosts that must both sign.")}</p>'
F["10-hosts"]=dict(css="""
.j-lab{left:140px;top:120px}
.j-stem{left:959px;top:530px;width:1.4px;height:56px;background:rgba(21,24,26,.4);transform-origin:50% 0}
.j-slab{left:680px;top:586px;width:560px;height:76px}
.j-box{top:0;height:76px;border:1.4px solid #15181a;border-radius:6px;background:#f7f8f5}
.j-box p{left:0;width:100%;text-align:center;top:19px;font-size:28px;color:#15181a}
.j-tk{right:18px;top:26px;width:22px;height:22px;border-radius:50%;background:#1f5f5b}
.j-s3 .j-box p{left:-14px}
.j-h{left:0;top:760px;width:1920px;text-align:center;font-size:88px}
""",html=h10,js="""cam(1,1.03);fade('.j-lab',0.2);fade('.j-wash',0,1,1.4);
tl.fromTo($('.j-room'),{opacity:0,scale:0.95},{opacity:1,scale:1,duration:0.9,ease:"power3.out"},0);growY('.j-stem',0.5,0.5);
function slab(s,t,last){tl.fromTo($(s),{opacity:0,y:40,filter:"blur(10px)"},{opacity:1,y:0,filter:"blur(0px)",duration:0.7,ease:"power3.out"},t);if(!last)tl.to($(s),{opacity:0,y:-30,filter:"blur(10px)",duration:0.5,ease:"power2.in"},t+2.25);}
slab('.j-s1',0.8);words('.j-h1',0.9,0.05);outb('.j-h1',3.05);
slab('.j-s2',3.4);words('.j-h2',3.5,0.05);outb('.j-h2',5.65);
slab('.j-s3',6.0,true);words('.j-h3',6.1,0.05);pop('.j-tk',7.0,0.35);""")

# ---------------- 11 on NEAR ----------------
calls=[("NEAR","holds the money<br>and the rules.",150,150),("Phala","keeps the door closed.",1330,150),("NEAR AI Cloud","advises. It sees the total,<br>never the bids.",150,690),("Chain Signatures","carries a decision<br>to other chains.",1330,690)]
h11=glow('k-wash',460,60,1000,900,'rgba(124,196,184,.42)')+'<i class="k-frame"></i>'+field('k-room',770,300,380,380,pts=PTS6[:5])+'<i class="k-door"></i>'
h11+='<i class="k-adv"></i>'
h11+='<svg viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px">'
paths=["M 600 250 L 700 250","M 1318 250 L 1210 250 L 1152 420","M 600 790 L 660 720","M 1220 700 L 1318 790"]
for i,d in enumerate(paths): h11+=f'<path class="k-p k-p{i}" d="{d}" fill="none" stroke="rgba(21,24,26,.4)" stroke-width="1.4"/>'
h11+='<path class="k-out" d="M 1220 640 L 1500 640" fill="none" stroke="#1f5f5b" stroke-width="2" stroke-dasharray="2 10" stroke-linecap="round"/><path class="k-tot" d="M 672 708 L 770 620" fill="none" stroke="#1f5f5b" stroke-width="1.6"/></svg>'
h11+='<b class="P-dot k-ch" style="left:1520px;top:640px;width:14px;height:14px;margin:-7px 0 0 -7px"></b><b class="P-dot k-ch" style="left:1560px;top:640px;width:14px;height:14px;margin:-7px 0 0 -7px"></b>'
for i,(k,v,x,y) in enumerate(calls): h11+=f'<div class="k-c k-c{i}" style="left:{x}px;top:{y}px"><p class="P-m k-k">{k}</p><p class="P-b P-ink k-v">{v}</p></div>'
F["11-on-near"]=dict(css="""
.k-frame{left:700px;top:230px;width:520px;height:520px;border:1.4px solid rgba(21,24,26,.45);border-radius:14px}
.k-door{left:1146px;top:400px;width:8px;height:180px;background:#15181a;border-radius:2px}
.k-adv{left:642px;top:694px;width:40px;height:40px;border-radius:50%;border:1.6px solid #1f5f5b;background:rgba(124,196,184,.25)}
.k-c{width:460px;height:200px}.k-k{left:0;top:0;color:#1f5f5b;font-size:28px}.k-v{left:0;top:48px;font-size:40px;line-height:1.22;white-space:normal;width:460px}
""",html=h11,js="""cam(1.04,1);fade('.k-wash',0,1,1.4);
tl.fromTo($('.k-room'),{opacity:0,scale:0.95},{opacity:1,scale:1,duration:0.9,ease:"power3.out"},0);
function call(i,t){inb('.k-c'+i,t,{d:0.8});draw('.k-p'+i,t+0.2,0.7)}
tl.fromTo($('.k-frame'),{opacity:0,scale:1.12},{opacity:1,scale:1,duration:0.9,ease:"power3.out"},0.5);call(0,0.7);
tl.fromTo($('.k-door'),{scaleY:0},{scaleY:1,duration:0.6,ease:"power4.inOut",transformOrigin:"50% 0"},2.9);call(1,2.9);
pop('.k-adv',5.1);call(2,5.1);draw('.k-tot',5.7,0.6);
call(3,7.3);fade('.k-out',7.6,1,0.8);pop('.k-ch',8.1,0.2);""")

# ---------------- 12 the exit ----------------
ox,oy,os_=330,140,480
h12=glow('l-bloom',940,20,780,640,'rgba(240,170,115,.55)')+hl_h('l-hh',oy)+hl_h('l-hh',oy+os_)+hl_v('l-hv',ox,0,650)+hl_v('l-hv',ox+os_,0,650)
h12+=f'<div class="l-wrap">'+field('l-grey',0,0,os_,os_,blobs=GREY,pts=PTS6[:4]+[PTS6[5]],grey=True,edge=False)+field('l-teal',0,0,os_,os_,pts=[],edge=False)+'</div>'
h12+='<svg viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px"><defs><linearGradient id="l-g" x1="0" x2="1"><stop offset="0" stop-color="#d9824a" stop-opacity="0"/><stop offset=".55" stop-color="#d9824a" stop-opacity=".6"/><stop offset="1" stop-color="#f3a56b"/></linearGradient></defs>'
h12+='<path class="l-trail" d="M 671 279 Q 1000 180 1290 294" fill="none" stroke="url(#l-g)" stroke-width="2.6" stroke-linecap="round"/>'
h12+='<circle class="l-ringbg" cx="198" cy="228" r="42" fill="none" stroke="rgba(21,24,26,.16)" stroke-width="1.6"/><path class="l-ring" d="M 198 186 A 42 42 0 1 1 197.9 186" fill="none" stroke="#15181a" stroke-width="2"/></svg>'
h12+='<b class="P-warm l-warm" style="left:0;top:0"></b><p class="P-m l-rl">the timer has run</p><p class="P-m l-own">their own share</p>'
h12+=f'<p class="P-d l-q">{W("And if the room stops?")}</p><p class="P-d l-h l-h1">{W("Any member leaves")}</p><p class="P-d l-h l-h2">{W("with their own share.")}</p><p class="P-b l-s">{W("Alone. No permission needed.")}</p>'
F["12-the-exit"]=dict(css=f"""
.l-wrap{{left:{ox}px;top:{oy}px;width:{os_}px;height:{os_}px;border-radius:10px;box-shadow:0 0 0 1px rgba(21,24,26,.3)}}
.l-rl{{left:140px;top:300px}}.l-own{{left:1330px;top:276px;color:#a85a28}}
.l-q{{left:150px;top:724px;font-size:112px}}
.l-h{{left:150px;font-size:104px}}.l-h1{{top:690px}}.l-h2{{top:798px}}
.l-s{{left:154px;top:930px;font-size:36px}}
""",html=h12,js="""cam(1,1.035);growX('.l-hh',0,1.1,0.1);growY('.l-hv',0.1,1.1,0.1);
tl.fromTo($('.l-wrap'),{opacity:0},{opacity:1,duration:0.8},0);
tl.fromTo($('.l-teal'),{opacity:1},{opacity:0,duration:2.2,ease:"power2.inOut"},0.5);
tl.fromTo($('.l-grey-pt'),{opacity:1},{opacity:0.75,duration:2},0.5);
words('.l-q',0.6);draw('.l-ring',1.9,2.7);
tl.fromTo($('.l-wrap'),{filter:"blur(0px)"},{filter:"blur(8px)",duration:2.4,ease:"sine.inOut"},2.2);
outb('.l-q',3.9);fade('.l-rl',4.6);
var W=$('.l-warm')[0],p={t:0};
function at(t){var u=1-t;return [u*u*671+2*u*t*1000+t*t*1290,u*u*279+2*u*t*180+t*t*294]}
gsap.set(W,{x:671,y:279});
tl.fromTo(W,{opacity:0,scale:0.4},{opacity:1,scale:1,duration:0.7,ease:"power2.out"},4.9);
tl.fromTo(p,{t:0},{t:1,duration:2.3,ease:"power2.inOut",onUpdate:function(){var q=at(p.t);gsap.set(W,{x:q[0],y:q[1]})}},5.4);
draw('.l-trail',5.4,2.3);fade('.l-bloom',5.8,1,2.2);fade('.l-own',7.7);
words('.l-h1',6.6);words('.l-h2',7.3);words('.l-s',9.0,0.06);""")

# ---------------- 13 network ----------------
rooms=[(860,250),(360,150),(620,430),(1160,120),(1350,340),(140,420),(1620,160),(1120,470),(390,470),(1614,500)]
h13='<div class="m-world"><i class="m-frame"></i>'
for i,(x,y) in enumerate(rooms):
    warm = '<b class="P-warm m-w" style="left:50%;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px"></b>' if i in (0,2,4) else ''
    h13+=field(f'm-room m-r{i}',x,y,200,200,blobs=[],pts=[(32,40),(60,32),(64,64),(38,68)],extra=warm,edge=True)
h13+='</div>'+f'<p class="P-d m-h">{W("One contract. Many rooms.")}</p><p class="P-b m-s">{W("A member can sit in several.")}</p>'
F["13-network"]=dict(css="""
.m-world{left:0;top:0;width:1920px;height:1080px;transform-origin:960px 350px}
.m-frame{left:90px;top:80px;width:1740px;height:640px;border:1.4px solid rgba(21,24,26,.4);border-radius:18px}
.m-room .P-pt{width:11px;height:11px;margin:-5.5px 0 0 -5.5px}
.m-room .P-fld{background:radial-gradient(70% 70% at 18% 14%,#8fd4c4,rgba(143,212,196,0) 70%),radial-gradient(60% 80% at 82% 40%,#2f8f86,rgba(47,143,134,0) 72%),radial-gradient(60% 55% at 30% 88%,#58b3a5,rgba(88,179,165,0) 70%),radial-gradient(50% 45% at 84% 90%,#bfe9dc,rgba(191,233,220,0) 70%),#143f40}
.m-h{left:0;top:770px;width:1920px;text-align:center;font-size:96px}
.m-s{left:0;top:900px;width:1920px;text-align:center;font-size:36px}
""",html=h13,js="""tl.fromTo($('.m-world'),{scale:4.2},{scale:1,duration:4.2,ease:"power3.inOut"},0);
[1,2,3,4,5,6,7,8,9].forEach(function(i){tl.fromTo($('.m-r'+i),{opacity:0},{opacity:1,duration:0.7,ease:'power2.out'},0.9+i*0.12)});
fade('.m-frame',3.0,1,1.2);words('.m-h',3.7);
tl.fromTo($('.m-w'),{scale:1},{scale:1.8,duration:0.4,ease:"power2.out",stagger:0.25},4.8);tl.to($('.m-w'),{scale:1,duration:0.6,stagger:0.25},5.2);words('.m-s',5.0,0.06);""")

# ---------------- 14 close ----------------
S=11;OX=960-37*S;OY=60
md=[(22,31,3.6),(30,25,3),(28,37,3.2),(18,41,2.6),(35,32,2.6)]
h14=glow('n-bloom',826,66,620,480,'rgba(240,170,115,.45)')
st14=[(-420,-60),(200,-160),(-160,260),(-520,180),(420,220)]
for i,(cx,cy,r) in enumerate(md):
    h14+=f'<b class="n-d n-d{i}" style="left:{OX+cx*S-r*S:.0f}px;top:{OY+cy*S-r*S:.0f}px;width:{2*r*S:.0f}px;height:{2*r*S:.0f}px"></b>'
h14+=f'<svg viewBox="0 0 1920 1080" style="left:0;top:0;width:1920px;height:1080px"><path class="n-c" d="M {OX+37*S} {OY+30.5*S} Q {OX+44*S} {OY+25*S} {OX+50*S} {OY+23.2*S}" fill="none" stroke="#15181a" stroke-width="5" stroke-linecap="round"/></svg>'
h14+=f'<b class="n-x" style="left:{OX+53*S-3.4*S:.0f}px;top:{OY+22.4*S-3.4*S:.0f}px;width:{6.8*S:.0f}px;height:{6.8*S:.0f}px"></b>'
h14+=f'<p class="P-d n-wm">Midge</p><p class="P-b P-ink n-t">{W("Private rooms with public rules.")}</p><p class="P-m n-u">Live on NEAR testnet</p>'
F["14-close"]=dict(css="""
.n-d{border-radius:50%;background:#15181a}
.n-x{border-radius:50%;background:#e8935a;box-shadow:0 0 30px rgba(217,130,74,.8),0 0 90px rgba(217,130,74,.45)}
.n-wm{left:0;top:560px;width:1920px;text-align:center;font-size:220px;letter-spacing:-.035em}
.n-t{left:0;top:826px;width:1920px;text-align:center;font-size:44px}
.n-u{left:0;top:912px;width:1920px;text-align:center;font-size:28px}
""",html=h14,js="var ST="+str(st14)+""";
ST.forEach(function(d,i){tl.fromTo($('.n-d'+i),{x:d[0],y:d[1],scale:2.4,opacity:0,borderRadius:"18%",backgroundColor:"#58b3a5"},{x:0,y:0,scale:1,opacity:1,borderRadius:"50%",backgroundColor:"#15181a",duration:1.5,ease:"power3.inOut"},0.1+i*0.08)});
draw('.n-c',1.5,0.8);
tl.fromTo($('.n-x'),{x:-176,y:89,scale:0.3,opacity:0},{x:0,y:0,scale:1,opacity:1,duration:1.0,ease:"power2.inOut"},1.5);fade('.n-bloom',1.9,1,1.6);
tl.fromTo($('.n-wm'),{opacity:0,filter:"blur(22px)",y:24},{opacity:1,filter:"blur(0px)",y:0,duration:1.3,ease:"power3.out"},2.5);
words('.n-t',3.7,0.06);fade('.n-u',4.7);""")

def build(fid,dur):
    f=F[fid]; pfx='f'+fid[:2]+'-'
    css=(KIT_CSS.replace('NOISEURL',NOISE)+f['css'])
    js=(KIT_JS+f['js']).replace('FRAMEID',fid).replace('FRAMEDUR',str(dur))
    html=f['html']
    # namespace: shared 'P-' classes and each frame's own letter-prefixed classes
    letter=re.search(r'\.([a-n])-',f['css']).group(1)
    def ns(s):
        s=s.replace('P-',pfx+'P-')
        s=re.sub(r'(?<![A-Za-z0-9/_])'+letter+r'-(?=[a-z0-9])',pfx+letter+'-',s)
        return s
    css,js,html=ns(css),ns(js),ns(html)
    P=pfx+'P-'
    doc=f'''<template>
<div id="root" data-composition-id="{fid}" data-width="1920" data-height="1080" data-duration="{dur}">
<style>{css}</style>
<div id="stage-{fid}" class="clip {P}stage" data-start="0" data-duration="{dur}" data-track-index="0">
<div class="{P}cam">{html}</div>
<div class="{P}vig"></div><div class="{P}noise"></div>
</div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<script>(function(){{{js}
window.__timelines=window.__timelines||{{}};window.__timelines[ID]=tl;}})();</script>
</div>
</template>
'''
    open(os.path.join(OUT,fid+'.html'),'w').write(doc)

os.makedirs(OUT,exist_ok=True)
for fid,dur in FRAMES: build(fid,dur)
print('wrote',len(FRAMES),'frames')
