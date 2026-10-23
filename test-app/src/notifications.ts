export type NotificationTone='waiting'|'success'|'warning'|'error';
export type NotificationAction={label:string;run:()=>void};
/** One application notification, updated in place with gentle phase transitions. */
export function createNotifications(){
 const root=document.createElement('aside');root.className='app-notifications';root.setAttribute('aria-label','Application notifications');root.hidden=true;
 root.innerHTML='<div class="app-toast"><span class="app-toast-icon" aria-hidden="true"></span><div class="app-toast-content"><p class="app-toast-title"></p><p class="app-toast-message"></p><button class="app-toast-action" type="button" hidden></button></div><button class="app-toast-close" type="button" aria-label="Dismiss notification">×</button></div>';
 const card=root.querySelector<HTMLElement>('.app-toast')!,content=root.querySelector<HTMLElement>('.app-toast-content')!,icon=root.querySelector<HTMLElement>('.app-toast-icon')!,title=root.querySelector<HTMLElement>('.app-toast-title')!,message=root.querySelector<HTMLElement>('.app-toast-message')!;
 let timer:ReturnType<typeof setTimeout>|undefined,fadeTimer:ReturnType<typeof setTimeout>|undefined,tone:NotificationTone|undefined;
 const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const mount=()=>{const parent=document.querySelector('dialog[open]')??document.body;if(root.parentElement!==parent)parent.append(root);};
 const cancelTimer=()=>{if(timer)clearTimeout(timer);timer=undefined;};
 const cancelFade=()=>{if(fadeTimer)clearTimeout(fadeTimer);fadeTimer=undefined;root.classList.remove('is-leaving');};
 const dismiss=()=>{
  cancelTimer();cancelFade();tone=undefined;
  if(root.hidden||reducedMotion()){root.hidden=true;return;}
  root.classList.add('is-leaving');fadeTimer=setTimeout(()=>{root.hidden=true;root.classList.remove('is-leaving');fadeTimer=undefined;},180);
 };
 const schedule=()=>{cancelTimer();if(tone==='success')timer=setTimeout(dismiss,5000);};
 root.querySelector('.app-toast-close')!.addEventListener('click',dismiss);
 root.addEventListener('mouseenter',cancelTimer);root.addEventListener('mouseleave',schedule);
 root.addEventListener('focusin',cancelTimer);root.addEventListener('focusout',schedule);
 // A notification in a native modal must remain in its top-layer subtree.
 document.addEventListener('close',mount,true);mount();
 return{
  show(text:string,next:NotificationTone,action?:NotificationAction){
   cancelTimer();cancelFade();mount();tone=next;
   const apply=()=>{
   fadeTimer=undefined;root.dataset.tone=next;
   card.setAttribute('role',next==='error'?'alert':'status');card.setAttribute('aria-live',next==='error'?'assertive':'polite');card.setAttribute('aria-atomic','true');
   title.textContent={waiting:'In progress',success:'Completed',warning:'Needs attention',error:'Action not completed'}[next];message.textContent=text;
   const actionButton=root.querySelector<HTMLButtonElement>('.app-toast-action')!;actionButton.hidden=!action;actionButton.disabled=false;actionButton.textContent=action?.label??'';actionButton.onclick=action?()=>{actionButton.disabled=true;action.run();}:null;
   icon.innerHTML=next==='waiting'?'<span class="app-toast-spinner"></span>':`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${next==='success'?'<path d="m5 12 4 4L19 6"/>':next==='error'?'<path d="m6 6 12 12M18 6 6 18"/>':'<path d="M12 5v8m0 4h.01"/>'}</svg>`;
   root.hidden=false;root.classList.remove('is-leaving');content.tabIndex=content.scrollHeight>content.clientHeight?0:-1;schedule();
   };
   if(!root.hidden&&!reducedMotion()){root.classList.add('is-leaving');fadeTimer=setTimeout(apply,180);}else apply();
  },
  clearWaiting(){if(tone==='waiting')dismiss();},
  dismiss,
 };
}
