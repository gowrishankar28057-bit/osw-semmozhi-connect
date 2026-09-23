'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Search, Plus } from 'lucide-react';
import { usePoll, Loading, ErrorBox, Empty, WorkshopCard } from './common';
import type { Role, Workshop } from '@/lib/types';
export function WorkshopList({role}:{role:Role}) {
  const [query,setQuery]=useState(''),[filter,setFilter]=useState('');
  const {data,error}=usePoll<Workshop[]>(`workshops?q=${encodeURIComponent(query)}&status=${filter}`);
  return <><div className="page-heading row-heading"><div><p className="eyebrow">LEARN · EXPLORE · PRESERVE</p><h1>{role==='ORGANIZER'?'My workshops':'Explore workshops'}</h1><p>Connect with Tamil knowledge and the people who share it.</p></div>{role==='ORGANIZER'&&<Link href="/workshops/new" className="button gold"><Plus size={18}/>Create workshop</Link>}</div><div className="filter-bar"><label className="search-field"><Search size={19}/><input aria-label="Search workshop titles" placeholder="Search workshop titles…" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="filter-tabs">{[['','All'],['PUBLISHED','Upcoming'],['ONGOING','Live now'],['COMPLETED','Completed']].map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={filter===value?'selected':''}>{label}</button>)}</div></div><ErrorBox message={error}/>{!data?<Loading/>:data.length?<div className="workshop-grid">{data.map(w=><WorkshopCard key={w.id} workshop={w}/>)}</div>:<section className="panel"><Empty title="No workshops to show">{query?'Try another title or filter.':role==='ORGANIZER'?'Create your first workshop and publish it when you’re ready.':'Published workshops will appear here. We’ll notify you when a new one is available.'}</Empty></section>}</>;
}
