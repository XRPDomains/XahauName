import {normalizeDomainInput} from '../../packages/sdk/src/protocol';
export function registrationInput(value:string,tld='xah'){
 const cleaned=value.replace(/\s+/gu,'').toLowerCase(),parts=cleaned.split('.');
 if(parts.length===2){const name=normalizeDomainInput(cleaned);return{label:name.slice(0,name.lastIndexOf('.')),tld:name.slice(name.lastIndexOf('.')+1),name};}
 const name=normalizeDomainInput(cleaned+'.'+tld);return{label:cleaned,tld,name};
}
/** Label-only presentation with a visible suffix, including on an empty field. */
export function enhanceRegistrationInput(input:HTMLInputElement){
 let tld='xah';input.autocapitalize='none';input.spellcheck=false;input.maxLength=66;
 const shell=document.createElement('div');shell.className='domain-input-shell fixed-domain-suffix';input.replaceWith(shell);shell.append(input);
 const suffix=document.createElement('span');suffix.className='domain-input-suffix';suffix.textContent='.xah';suffix.setAttribute('aria-hidden','true');shell.append(suffix);input.classList.add('with-suffix');
 const clean=()=>{const before=input.value,caret=input.selectionStart??before.length,after=before.replace(/\s+/gu,'').toLowerCase();if(before!==after){input.value=after;const position=before.slice(0,caret).replace(/\s+/gu,'').length;input.setSelectionRange(position,position);}if(!input.value){tld='xah';suffix.textContent='.xah';}input.setCustomValidity('');};
 const name=()=>{const result=registrationInput(input.value,tld);tld=result.tld;input.value=result.label;suffix.textContent='.'+tld;return result.name;};
 input.addEventListener('input',clean);
 input.addEventListener('blur',()=>{if(input.value)try{name();}catch{/* Submission displays SDK validation. */}});
 input.addEventListener('paste',event=>{const text=event.clipboardData?.getData('text');if(!text)return;try{const result=registrationInput(text,tld);if(text.includes('.')){event.preventDefault();input.value=result.label;tld=result.tld;suffix.textContent='.'+tld;input.dispatchEvent(new Event('input',{bubbles:true}));}}catch{/* Preserve native paste for invalid input. */}});
 input.form?.addEventListener('submit',()=>{clean();if(input.value)try{name();}catch{}});
 return{name,setDomain(value:string){const result=registrationInput(value);input.value=result.label;tld=result.tld;suffix.textContent='.'+tld;},reset(){input.value='';input.readOnly=false;input.setCustomValidity('');tld='xah';suffix.textContent='.xah';}};
}
/** Clean pasted/typed input without adding a suffix on every keystroke or moving the caret. */
export function enhanceDomainInputs(inputs:HTMLInputElement[]){
 for(const input of inputs){
  input.autocapitalize='none';input.spellcheck=false;input.maxLength=66;
  const shell=document.createElement('div');shell.className='domain-input-shell';input.replaceWith(shell);shell.append(input);
  const suffix=document.createElement('span');suffix.className='domain-input-suffix';suffix.textContent='.xah';suffix.setAttribute('aria-hidden','true');shell.append(suffix);
  const clean=()=>{const before=input.value,caret=input.selectionStart??before.length,normalized=before.replace(/\s+/gu,'').toLowerCase();if(before!==normalized){input.value=normalized;const pos=before.slice(0,caret).replace(/\s+/gu,'').length;input.setSelectionRange(pos,pos);}suffix.hidden=!input.value||input.value.includes('.');input.classList.toggle('with-suffix',!suffix.hidden);input.setCustomValidity('');};
  input.addEventListener('input',clean);
  input.addEventListener('blur',()=>{if(!input.value)return;try{input.value=normalizeDomainInput(input.value);}catch{/* SDK validation explains malformed names on submission. */}clean();});
  input.form?.addEventListener('submit',()=>{if(!input.value)return;try{input.value=normalizeDomainInput(input.value);}catch{}clean();});
  clean();
 }
}
