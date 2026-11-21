export const MENU_TREE=[
 {id:'home',label:'Home',alwaysAvailable:true},
 {id:'tickets',label:'My tickets',alwaysAvailable:true}, {id:'create',label:'New ticket'},
 {id:'inbox',label:'Inbox'}, {id:'knowledge',label:'Knowledge base'},
 {id:'activity',label:'Activity'}, {id:'team',label:'Team'}, {id:'reports',label:'Reports'},
 {id:'assets',label:'Assets',children:[{id:'assets.register',label:'Asset register'},{id:'assets.categories',label:'Category master'}]},
 {id:'payble',label:'Payble'},
 {id:'settings',label:'System Settings',children:[{id:'settings.master',label:'Master'},{id:'settings.users',label:'Users',adminOnly:true},{id:'settings.roles',label:'Role master',adminOnly:true}]},
 {id:'company',label:'Company Profile (drawer)'}
];
export const MENU_LEAVES=MENU_TREE.flatMap(node=>node.children||[node]);
export const ROLE_MENU_IDS=MENU_LEAVES.filter(node=>!node.adminOnly&&!node.alwaysAvailable).map(node=>node.id);
export const ALL_MENU_IDS=MENU_LEAVES.map(node=>node.id);
export function canAccess(user,id){return MENU_TREE.some(menu=>menu.id===id&&menu.alwaysAvailable)||user.role==='admin'||(user.menus||[]).some(menu=>menu===id||menu.startsWith(id+'.'));}
