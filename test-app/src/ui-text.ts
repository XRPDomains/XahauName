/** Product wording only. Never apply to user records, API fields, URLs or protocol bytes. */
export function nameCopy(message:string):string{
 const casing=(original:string,replacement:string)=>original===original.toUpperCase()?replacement.toUpperCase():/^[A-Z]/.test(original)?replacement[0].toUpperCase()+replacement.slice(1):replacement;
 return message.replace(/(?<![A-Za-z0-9_./-])domain names?(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])/gi,term=>casing(term,term.toLowerCase().endsWith('names')?'names':'name'))
  .replace(/(?<![A-Za-z0-9_./-])domains?(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])/gi,term=>casing(term,term.toLowerCase()==='domains'?'names':'name'));
}
