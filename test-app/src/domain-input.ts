import {normalizeDomainInput} from '../../sdk/src/protocol';
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
