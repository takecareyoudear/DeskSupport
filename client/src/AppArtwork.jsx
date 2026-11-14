import React, { useId } from 'react';

// Small illustrations keep every app recognizable at tablet and phone sizes.
export default function AppArtwork({ name }) {
  const id = useId().replace(/:/g, '');
  const palettes = {
    ticket: ['#49c8ff', '#2262e5', '#142b91'],
    plus: ['#4de1b2', '#0a9c79', '#075044'],
    chat: ['#c99cff', '#8651e9', '#472184'],
    book: ['#ffd46b', '#f49b28', '#99451b'],
    activity: ['#ff9ab5', '#eb4c80', '#912249'],
    team: ['#6ce2ed', '#159dbb', '#07566e'],
    chart: ['#a4b6ff', '#6471eb', '#303285'],
    settings: ['#eea9ee', '#b45bcb', '#692779'],
  };
  const [light, mid, dark] = palettes[name] || palettes.ticket;
  const front = `url(#${id}-front)`;
  const paper = `url(#${id}-paper)`;
  const art = {
    ticket: <><path d="m12 24 37-7 6 30-37 7-2-9a5 5 0 0 0-2-10Z" fill={dark} opacity=".28"/><path d="m9 19 37-7 6 30-37 7-2-9a5 5 0 0 0-2-10Z" fill={front}/><path d="m36 17 4 23" stroke="white" strokeOpacity=".7" strokeWidth="2" strokeDasharray="3 4"/><path d="m21 26 2 4 5-1-3 4 2 5-5-2-4 3 1-5-3-3 5-1Z" fill={paper}/></>,
    plus: <><rect x="15" y="15" width="38" height="39" rx="11" fill={dark} opacity=".25"/><rect x="10" y="10" width="40" height="40" rx="11" fill={front}/><path d="M30 21v18M21 30h18" stroke={paper} strokeWidth="5" strokeLinecap="round"/><circle cx="49" cy="48" r="10" fill={paper}/><path d="m45 48 3 3 5-6" fill="none" stroke={dark} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></>,
    chat: <><path d="M27 24h20a11 11 0 0 1 11 11v7a11 11 0 0 1-9 11l4 7-14-7H27a11 11 0 0 1-11-11v-7a11 11 0 0 1 11-11" fill={dark} opacity=".85"/><path d="M16 10h23a12 12 0 0 1 12 12v9a12 12 0 0 1-12 12H24L10 51l3-9a12 12 0 0 1-9-11v-9a12 12 0 0 1 12-12" fill={front}/>{[18,28,38].map(x=><circle key={x} cx={x} cy="27" r="2.5" fill={paper}/>)}</>,
    book: <><path d="M9 17q12-5 23 2 11-7 23-2v35q-12-4-23 2-11-6-23-2Z" fill={dark} opacity=".3"/><path d="M7 12q13-4 25 3 12-7 25-3v34q-13-4-25 3-12-7-25-3Z" fill={front}/><path d="M32 15v34" stroke={dark} strokeOpacity=".35" strokeWidth="2"/><path d="m14 22 11 2m-11 6 11 2m15-10 10-2m-10 10 10-2" stroke={paper} strokeWidth="2.5" strokeLinecap="round"/><path d="M41 11v17l4-4 4 2V9" fill="#fff3c7"/></>,
    activity: <><rect x="13" y="15" width="41" height="40" rx="11" fill={dark} opacity=".25"/><rect x="9" y="10" width="43" height="41" rx="11" fill={front}/><path d="M16 33h8l5-13 7 23 5-10h6" fill="none" stroke={paper} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/><circle cx="50" cy="14" r="7" fill="#ffdf9a"/><circle cx="50" cy="14" r="3" fill="#f19b32"/></>,
    team: <><circle cx="46" cy="22" r="9" fill={dark}/><path d="M34 51V40a12 12 0 0 1 24 0v8q-9 5-24 3" fill={dark}/><circle cx="18" cy="24" r="8" fill={light}/><path d="M5 49v-8a13 13 0 0 1 26 0v10Z" fill={light}/><circle cx="32" cy="17" r="11" fill={paper}/><path d="M15 52V40a17 17 0 0 1 34 0v12q-16 6-34 0" fill={front}/><path d="m27 34 5 6 5-6" fill="none" stroke="white" strokeOpacity=".8" strokeWidth="2.5" strokeLinecap="round"/></>,
    chart: <><rect x="8" y="10" width="46" height="43" rx="10" fill={paper}/><rect x="16" y="32" width="7" height="14" rx="2" fill={light}/><rect x="28" y="25" width="7" height="21" rx="2" fill={front}/><rect x="40" y="17" width="7" height="29" rx="2" fill={dark}/><path d="m15 25 12-7 8 3 12-12m-7 0h7v7" fill="none" stroke={mid} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></>,
    settings: <><path d="m27 7 10 1 2 7 6 3 7-1 5 9-5 6 1 7 4 5-7 8-7-2-6 3-3 6-10-2-2-7-6-3-7 1-4-10 5-5v-7l-4-6 7-7 7 2 6-3Z" fill={dark} opacity=".25" transform="translate(2 2)"/><path d="m26 5 10 1 2 7 6 3 7-1 5 9-5 6 1 7 4 5-7 8-7-2-6 3-3 6-10-2-2-7-6-3-7 1-4-10 5-5v-7l-4-6 7-7 7 2 6-3Z" fill={front}/><circle cx="30" cy="31" r="12" fill={paper}/><circle cx="30" cy="31" r="6" fill={dark}/></>,
  };
  return <svg className="app-artwork" viewBox="0 0 64 64" fill="none" aria-hidden="true"><defs><linearGradient id={`${id}-front`} x1="10" y1="7" x2="51" y2="55" gradientUnits="userSpaceOnUse"><stop stopColor={light}/><stop offset=".55" stopColor={mid}/><stop offset="1" stopColor={dark}/></linearGradient><linearGradient id={`${id}-paper`} x1="14" y1="8" x2="51" y2="53" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset="1" stopColor="#e7edff"/></linearGradient></defs>{art[name] || art.ticket}</svg>;
}
