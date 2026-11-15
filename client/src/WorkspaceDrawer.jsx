import React,{useEffect,useRef} from 'react';
export default function WorkspaceDrawer({onClose,onNavigate,organizationId}){
 const dialog=useRef(null);
 useEffect(()=>{
  const element=dialog.current,previousOverflow=document.body.style.overflow;
  element.showModal();document.body.style.overflow='hidden';
  return()=>{element.close();document.body.style.overflow=previousOverflow;};
 },[]);
 return <dialog ref={dialog} id="workspace-drawer" className="workspace-drawer" aria-labelledby="drawer-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget){const bounds=event.currentTarget.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)onClose();}}}>
 <div className="drawer-heading"><div><span className="drawer-eyebrow">SUPPORTDESK</span><h2 id="drawer-title">Workspace menu</h2></div><button autoFocus className="drawer-close" aria-label="Close navigation menu" onClick={onClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
 <nav className="drawer-nav" aria-label="Workspace navigation"><button onClick={()=>onNavigate(null)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg>Home</button><button onClick={()=>onNavigate('company')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V3h12v18M16 9h4v12M8 7h4M8 11h4M8 15h4M2 21h20M9 21v-3h2v3"/></svg>Company Profile<span aria-hidden="true">&#8594;</span></button></nav>
 <div className="drawer-footer">Organization <strong>{organizationId}</strong></div>
 </dialog>;
}
