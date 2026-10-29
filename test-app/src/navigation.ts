/** Connect to the collection unless a discovery draft/checkout or public profile is already open. */
export function connectedWalletView(currentView:string,hasDiscoveryContext:boolean){
 if(currentView==='profile-section')return currentView;
 if(currentView==='discover'&&hasDiscoveryContext)return currentView;
 return 'portfolio';
}

export const profileSections={addresses:'wallet-records',profile:'profile-links',records:'custom-records',settings:'advanced'} as const;
export type ProfileSection=keyof typeof profileSections;
export type AppRoute={view:'discover';section?:'lookup'}|{view:'portfolio';section?:'claims'}|{view:'profile-section';name:string;section?:ProfileSection};
export function routeHash(route:AppRoute){
 if(route.view==='portfolio')return '#/my-names'+(route.section?'/'+route.section:'');
 if(route.view==='discover')return '#/find'+(route.section?'/'+route.section:'');
 return '#/name/'+encodeURIComponent(route.name)+(route.section?'/'+route.section:'');
}
export function parseRoute(hash:string):AppRoute|null{
 if(!hash||hash==='#'||hash==='#/find')return{view:'discover'};
 if(hash==='#/find/lookup')return{view:'discover',section:'lookup'};
 if(hash==='#/my-names')return{view:'portfolio'};
 if(hash==='#/my-names/claims')return{view:'portfolio',section:'claims'};
 const match=/^#\/name\/([^/]+)(?:\/(addresses|profile|records|settings))?$/.exec(hash);
 if(!match)return null;
 try{
  const name=decodeURIComponent(match[1]);
  if(!/^[a-z0-9](?:[a-z0-9-]{0,55}[a-z0-9])?\.[a-z0-9]{2,8}$/.test(name))return null;
  return{view:'profile-section',name,...(match[2]?{section:match[2] as ProfileSection}:{})};
 }catch{return null;}
}
