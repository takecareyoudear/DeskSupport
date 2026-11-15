import React, { useEffect, useRef, useState } from 'react';
import { readApiResponse, requestJson } from './api.mjs';

const API=import.meta.env.DEV?(import.meta.env.VITE_API_URL||''):'';
const kinds=[['departments','Department'],['categories','Category'],['projects','Project']];
export default function Settings({user,onBack}) {
  const [section,setSection]=useState('master');
  const [kind,setKind]=useState('departments');
  const [data,setData]=useState(null);
  const [users,setUsers]=useState(null);
  const [name,setName]=useState('');
  const [editing,setEditing]=useState(null);
  const [deleting,setDeleting]=useState(null);
  const [account,setAccount]=useState({fullName:'',username:'',email:'',password:'',role:'member'});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const nameInput=useRef(null);
  const admin=user.role==='admin';
  const label=kinds.find(item=>item[0]===kind)[1];
  async function load(signal) {
    const result=await fetch(`${API}/api/auth/workspace/masters`,{credentials:'include',signal}).then(readApiResponse);
    setData(result);
    if(admin)setUsers((await fetch(`${API}/api/auth/workspace/users`,{credentials:'include',signal}).then(readApiResponse)).users);
  }
  useEffect(()=>{
    const controller=new AbortController();
    load(controller.signal).catch(err=>{if(err.name!=='AbortError')setError(err.message);});
    return ()=>controller.abort();
  },[]);
  function navigate(next) {setSection(next);setError('');setNotice('');setEditing(null);setDeleting(null);setName('');}
  async function perform(action,success) {
    setBusy(true);setError('');setNotice('');
    try {await action();setNotice(success);}
    catch(err){setError(err instanceof TypeError?'Cannot reach the server. Please try again.':err.message);}
    finally{setBusy(false);}
  }
  async function save(event) {
    event.preventDefault();
    await perform(async()=>{
      const {record}=await requestJson(`${API}/api/auth/workspace/masters/${kind}/${editing?'update':'create'}`,{id:editing,name});
      setData(previous=>({...previous,[kind]:(editing?previous[kind].map(row=>row.id===record.id?record:row):[...previous[kind],record]).sort((a,b)=>a.name.localeCompare(b.name))}));
      setName('');setEditing(null);
    },`${label} saved.`);
  }
  async function remove() {
    await perform(async()=>{
      await requestJson(`${API}/api/auth/workspace/masters/${kind}/delete`,{id:deleting.id});
      setData(previous=>({...previous,[kind]:previous[kind].filter(row=>row.id!==deleting.id)}));
      if(editing===deleting.id){setEditing(null);setName('');}
      setDeleting(null);
    },`${label} deleted.`);
  }
  async function createUser(event) {
    event.preventDefault();
    await perform(async()=>{
      const result=await requestJson(`${API}/api/auth/workspace/users`,account);
      setUsers(previous=>[...(previous||[]),result.user]);
      setAccount({fullName:'',username:'',email:'',password:'',role:'member'});
    },'User created. They can sign in with their username or email.');
  }
  return <main className="settings-main">
    <div className="settings-heading"><div><span className="launcher-eyebrow">WORKSPACE ADMINISTRATION</span><h1>Settings</h1><p>Organization ID <strong>{user.organizationId}</strong></p></div><button className="settings-button" onClick={onBack} disabled={busy}>Back to workspace</button></div>
    <div className="settings-layout"><nav className="settings-nav" aria-label="Settings menu"><span className="settings-nav-title">MANAGE</span><button aria-current={section==='master'?'page':undefined} disabled={busy} onClick={()=>navigate('master')}><span className="settings-nav-icon" aria-hidden="true">&#9638;</span>Master</button>{admin&&<button aria-current={section==='users'?'page':undefined} disabled={busy} onClick={()=>navigate('users')}><span className="settings-nav-icon" aria-hidden="true">&#9823;</span>Users</button>}</nav>
      <section className="settings-panel" aria-labelledby="settings-title"><h2 id="settings-title">{section==='master'?'Master':'User logins'}</h2><p className="settings-muted">{section==='master'?'Manage departments, categories, and projects independently for your organization.':'Create a login in this organization. Share the initial password with the user privately.'}</p>
      {error&&<p className="error" role="alert">{error}</p>}{notice&&<p className="notice" role="status">{notice}</p>}
      {section==='master'?<><div className="master-tabs" aria-label="Master type">{kinds.map(([key,title])=><button key={key} aria-pressed={kind===key} disabled={busy} onClick={()=>{setKind(key);setEditing(null);setDeleting(null);setName('');setNotice('');setError('');}}>{title}{data&&<span className="master-count">{data[key].length}</span>}</button>)}</div>
        {admin?<form className="master-form" onSubmit={save}><label>{editing?'Edit':'Create'} {label.toLowerCase()}<input ref={nameInput} value={name} onChange={event=>setName(event.target.value)} required maxLength={100} disabled={busy} placeholder={`${label} name`}/></label><button className="settings-button primary-action" disabled={busy||!data}>{busy?'Saving…':editing?'Update':'Create'}</button>{editing&&<button className="settings-button" type="button" disabled={busy} onClick={()=>{setEditing(null);setName('');}}>Cancel edit</button>}</form>:<p className="settings-muted">Your admin can create, edit, and delete Master records.</p>}
        {deleting&&<div className="delete-confirm" role="alert"><p>Delete <strong>{deleting.name}</strong>? This cannot be undone. Records in use cannot be deleted.</p><button className="settings-button danger" disabled={busy} onClick={remove}>Confirm delete</button><button className="settings-button" disabled={busy} onClick={()=>setDeleting(null)}>Cancel</button></div>}
        {!data?<p role="status">{error?'Records could not be loaded.':'Loading records…'}</p>:!data[kind].length?<p className="settings-empty">No {kind} yet.{admin?' Create the first one above.':''}</p>:<div className="settings-table-wrap"><table className="settings-table"><thead><tr><th scope="col">{label} name</th>{admin&&<th scope="col">Actions</th>}</tr></thead><tbody>{data[kind].map(row=><tr key={row.id}><td>{row.name}</td>{admin&&<td><button className="settings-button" disabled={busy} aria-label={`Edit ${row.name}`} onClick={()=>{setEditing(row.id);setName(row.name);setDeleting(null);setNotice('');nameInput.current?.focus();}}>Edit</button><button className="settings-button danger" disabled={busy} aria-label={`Delete ${row.name}`} onClick={()=>{setDeleting(row);setError('');setNotice('');}}>Delete</button></td>}</tr>)}</tbody></table></div>}
      </>:<><form className="user-form" onSubmit={createUser}>{[['fullName','Full name','text','name'],['username','Username','text','username'],['email','Email address','email','email'],['password','Initial password','password','new-password']].map(([key,title,type,complete])=><label key={key}>{title}<input type={type} autoComplete={complete} required value={account[key]} disabled={busy} minLength={key==='password'?12:key==='username'?3:key==='fullName'?2:undefined} maxLength={key==='password'?128:key==='username'?40:key==='email'?254:100} pattern={key==='username'?'[a-z0-9][a-z0-9_.]{2,39}':undefined} onChange={event=>setAccount({...account,[key]:key==='username'?event.target.value.toLowerCase():event.target.value})}/></label>)}<label>User level<select value={account.role} disabled={busy} onChange={event=>setAccount({...account,role:event.target.value})}><option value="member">User</option><option value="admin">Admin</option></select><span className="role-help">{account.role==='admin'?'Admins can manage Master records and create user and admin logins.':'Users can view Master records. They cannot manage records or create logins.'}</span></label><p className="settings-muted">Username: 3-40 letters, numbers, dots or underscores. Password: at least 12 characters. Choose the access level for this login.</p><button className="settings-button primary-action" disabled={busy}>{busy?'Creating…':'Create user'}</button></form>
      {!users?<p role="status">Loading users…</p>:<div className="settings-table-wrap"><table className="settings-table"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th></tr></thead><tbody>{users.map(person=><tr key={person.id}><td>{person.fullName}</td><td>{person.username}</td><td>{person.email}</td><td><span className={`role-badge ${person.role}`}>{person.role==='admin'?'Admin':'User'}</span></td></tr>)}</tbody></table></div>}</>}
      </section></div>
  </main>;
}
