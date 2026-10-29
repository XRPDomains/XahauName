const celebrated=new Set<string>();
let cleanup:(()=>void)|undefined;
/** Decorative only: never changes a confirmed transaction's outcome or focus. */
export function celebrateRegistration(hash:string,target:HTMLElement){
 try{
  if(!/^[a-f0-9]{64}$/i.test(hash)||celebrated.has(hash)||!target.isConnected)return;
  if(celebrated.size>=20)celebrated.delete(celebrated.values().next().value!);
  celebrated.add(hash);
  if(document.hidden||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const rect=target.getBoundingClientRect();if(rect.bottom<0||rect.top>innerHeight)return;
  cleanup?.();
  const layer=document.createElement('div');layer.className='registration-fireworks';layer.setAttribute('aria-hidden','true');document.body.append(layer);
  const animations:Animation[]=[];
  const origins=[{x:.24,y:24,delay:0},{x:.75,y:8,delay:200},{x:.5,y:52,delay:400}];
  for(const origin of origins)for(let i=0;i<18;i++){
   const spark=document.createElement('i');spark.className='firework-spark';spark.dataset.color=String(i%3);
   spark.style.left=Math.max(24,Math.min(innerWidth-24,rect.left+rect.width*origin.x))+'px';
   spark.style.top=Math.max(64,Math.min(innerHeight-80,rect.top+origin.y))+'px';layer.append(spark);
   const angle=i*Math.PI*2/18,distance=50+Math.random()*62,x=Math.cos(angle)*distance,y=Math.sin(angle)*distance;
   animations.push(spark.animate([
    {transform:'translate(0,0) scale(.3)',opacity:0},
    {offset:.15,transform:`translate(${x*.3}px,${y*.3}px) scale(1)`,opacity:1},
    {offset:.6,transform:`translate(${x*.85}px,${y*.85+12}px) scale(.8)`,opacity:.85},
    {transform:`translate(${x}px,${y+45}px) scale(.2)`,opacity:0},
   ],{duration:1050,delay:origin.delay,easing:'cubic-bezier(.16,.6,.4,1)',fill:'both'}));
  }
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
  const stop=()=>{clearTimeout(timer);motion.removeEventListener('change',stop);document.removeEventListener('visibilitychange',onVisibility);animations.forEach(animation=>animation.cancel());layer.remove();if(cleanup===stop)cleanup=undefined;};
  const onVisibility=()=>{if(document.hidden)stop();};
  const timer=setTimeout(stop,1700);cleanup=stop;motion.addEventListener('change',stop);document.addEventListener('visibilitychange',onVisibility);
 }catch{cleanup?.();document.querySelectorAll('.registration-fireworks').forEach(layer=>layer.remove());}
}
export function clearCelebration(){cleanup?.();}
