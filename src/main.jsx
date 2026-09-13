import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer,GeoJSON,TileLayer,Marker,useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const KEY='vendas-d12-data-v1';
const GEO='vendas-d12-pr-municipios-v1';
const NFAE='https://nfae.fazenda.pr.gov.br/nfae/avulsa/emitir/emitente';
const products=[
 ['1000','Pote de 1 kg'],
 ['500','Pote de 500 g'],
 ['200','Bisnaga de 200 g'],
 ['Bear250','Bisnaga urso de 250 g']
];

const id=()=>crypto.randomUUID();
const today=()=>{
 const d=new Date();
 return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=s=>s?s.split('-').reverse().join('/'):'Sem registro';
const parseMoney=v=>{
 let s=String(v??'').trim().replace(/\s/g,'');
 if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'').replace(',','.');
 else if(s.includes(','))s=s.replace(',','.');
 const n=Number(s);
 return Number.isFinite(n)?n:NaN;
};
const last=(m,s)=>s.filter(x=>x.marketId===m.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
const daysSince=s=>{
 if(!s)return Infinity;
 const n=Math.round((new Date(today()+'T12:00:00')-new Date(s+'T12:00:00'))/86400000);
 return Number.isFinite(n)?n:Infinity;
};
const color=(m,visits)=>m.active===false?'#777777':daysSince(visits[m.id])<=30?'#24b96f':'#f2a41d';
const cityColor=(name,markets,visits)=>{
 const active=markets.filter(x=>x.active!==false&&norm(x.city)===norm(name));
 if(!active.length)return '#454545';
 const latest=active.map(x=>visits[x.id]).filter(Boolean).sort().reverse()[0];
 return daysSince(latest)<=30?'#24b96f':'#f2a41d';
};
const itemLines=s=>products
 .filter(([k])=>Number(s['qty'+k]||0)>0)
 .map(([k,n])=>{
  const q=Number(s['qty'+k]||0);
  const p=s['price'+k];
  return p===null||p===undefined||p===''?`${q} × ${n}`:`${q} × ${n} a ${money(p)}`;
 });
const items=s=>itemLines(s).join(' • ')||`${s.qty||0} unidades`;
const wa=p=>{
 let n=String(p||'').replace(/\D/g,'');
 if(n.length===10||n.length===11)n='55'+n;
 return /^55\d{10,11}$/.test(n)?'https://wa.me/'+n:null;
};
const cityName=f=>f.properties?.NM_MUN||f.properties?.nome||f.properties?.name||f.properties?.NM_MUNICIP||'';

function load(){
 try{
  const d=JSON.parse(localStorage.getItem(KEY))||{};
  return {...d,markets:d.markets||[],sales:d.sales||[],visits:d.visits||{},trips:d.trips||[]};
 }catch{
  return {markets:[],sales:[],visits:{},trips:[]};
 }
}

function Fit({geo}){
 const map=useMap();
 useEffect(()=>{
  map.fitBounds(L.geoJSON(geo).getBounds(),{padding:[8,8]});
 },[map,geo]);
 return null;
}

function CityLabels({geo,minZoom=9}){
 const map=useMap();
 const [view,setView]=useState({zoom:map.getZoom(),bounds:map.getBounds()});
 useEffect(()=>{
  const update=()=>setView({zoom:map.getZoom(),bounds:map.getBounds()});
  map.on('zoomend',update);
  map.on('moveend',update);
  update();
  return()=>{
   map.off('zoomend',update);
   map.off('moveend',update);
  };
 },[map]);
 if(view.zoom<minZoom)return null;
 const bounds=view.bounds.pad(.12);
 return <>
  {geo.features.map((f,i)=>{
   const n=cityName(f);
   if(!n)return null;
   const c=L.geoJSON(f).getBounds().getCenter();
   if(!bounds.contains(c))return null;
   const safe=n.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
   return <Marker key={n+i} position={[c.lat,c.lng]} interactive={false}
    icon={L.divIcon({
     className:'dcityLabelIcon',
     html:`<span>${safe}</span>`,
     iconSize:[124,28],iconAnchor:[62,14]
    })}/>;
  })}
 </>;
}

function FollowLocation({position,recenterToken}){
 const map=useMap();
 const first=useRef(true);
 useEffect(()=>{
  if(position&&first.current){
   first.current=false;
   map.setView([position.lat,position.lng],Math.max(map.getZoom(),15));
  }
 },[map,position]);
 useEffect(()=>{
  if(position&&recenterToken>0){
   map.setView([position.lat,position.lng],Math.max(map.getZoom(),15));
  }
 },[map,position,recenterToken]);
 return null;
}

async function dbAction(dbName,storeName,mode,action){
 const db=await new Promise((ok,no)=>{
  const r=indexedDB.open(dbName,1);
  r.onupgradeneeded=()=>{
   if(!r.result.objectStoreNames.contains(storeName)){
    r.result.createObjectStore(storeName,{keyPath:'id'});
   }
  };
  r.onsuccess=()=>ok(r.result);
  r.onerror=()=>no(r.error);
 });
 return new Promise((ok,no)=>{
  const t=db.transaction(storeName,mode);
  const request=action(t.objectStore(storeName));
  t.oncomplete=()=>{db.close();ok(request?.result)};
  t.onabort=t.onerror=()=>{db.close();no(t.error)};
 });
}
const photosDb=(mode,action)=>dbAction('vendas-d12-fotos','photos',mode,action);
const docsDb=(mode,action)=>dbAction('vendas-d12-documentos','docs',mode,action);

async function compress(file){
 const image=await createImageBitmap(file);
 try{
  const c=document.createElement('canvas');
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  c.width=Math.round(image.width*scale);
  c.height=Math.round(image.height*scale);
  c.getContext('2d').drawImage(image,0,0,c.width,c.height);
  return c.toDataURL('image/jpeg',.85);
 }finally{
  image.close();
 }
}

function App(){
 const [d,setD]=useState(load);
 const [tab,setTab]=useState('map');
 const [city,setCity]=useState('');
 const [center,setCenter]=useState([-24.7,-51.6]);
 const [list,setList]=useState(false);
 const [marketId,setMarket]=useState(null);
 const [modal,setModal]=useState(null);
 const [geo,setGeo]=useState(null);
 const [geoError,setGeoError]=useState(false);
 const [search,setSearch]=useState('');
 const [photos,setPhotos]=useState([]);
 const [viewer,setViewer]=useState(null);
 const [docsMeta,setDocsMeta]=useState([]);
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [online,setOnline]=useState(navigator.onLine);
 const [install,setInstall]=useState(null);
 const [myPos,setMyPos]=useState(null);
 const [locStatus,setLocStatus]=useState('');
 const [recenterToken,setRecenterToken]=useState(0);
 const photoLock=useRef(false);

 const save=next=>{
  try{
   localStorage.setItem(KEY,JSON.stringify(next));
   setD(next);
   return true;
  }catch{
   alert('Não foi possível salvar. Confira o espaço livre do aparelho.');
   return false;
  }
 };

 useEffect(()=>{
  let alive=true;
  (async()=>{
   try{
    const cache=JSON.parse(localStorage.getItem(GEO));
    if(cache){
     if(alive)setGeo(cache);
     return;
    }
   }catch{}
   for(const url of [
    import.meta.env.BASE_URL+'municipios-parana.geojson',
    'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-41-mun.json'
   ]){
    try{
     const r=await fetch(url);
     if(!r.ok)throw Error();
     const g=await r.json();
     if(!g.features?.length)throw Error();
     if(alive)setGeo(g);
     try{localStorage.setItem(GEO,JSON.stringify(g))}catch{}
     return;
    }catch{}
   }
   if(alive)setGeoError(true);
  })();

  photosDb('readonly',s=>s.getAll()).then(p=>{
   if(alive){setPhotos(p||[]);setReady(true)}
  }).catch(()=>{
   if(alive)setReady(true);
  });

  docsDb('readonly',s=>s.getAll()).then(rows=>{
   if(alive)setDocsMeta((rows||[]).map(({blob,...meta})=>meta));
  }).catch(()=>{});

  if('serviceWorker' in navigator){
   navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js').catch(()=>{});
  }

  const net=()=>setOnline(navigator.onLine);
  const prompt=e=>{e.preventDefault();setInstall(e)};
  window.addEventListener('online',net);
  window.addEventListener('offline',net);
  window.addEventListener('beforeinstallprompt',prompt);
  return()=>{
   alive=false;
   window.removeEventListener('online',net);
   window.removeEventListener('offline',net);
   window.removeEventListener('beforeinstallprompt',prompt);
  };
 },[]);

 useEffect(()=>{
  const shouldTrack=tab==='map'&&!!city&&!list&&!marketId;
  if(!shouldTrack){
   setLocStatus('');
   return;
  }
  if(!navigator.geolocation){
   setLocStatus('GPS indisponível neste aparelho.');
   return;
  }
  setLocStatus('Buscando sua localização…');
  const watch=navigator.geolocation.watchPosition(p=>{
   setMyPos({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy});
   setLocStatus('');
  },()=>{
   setLocStatus('Não foi possível usar o GPS. Libere a localização para este site.');
  },{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  return()=>navigator.geolocation.clearWatch(watch);
 },[tab,city,list,marketId]);

 const m=d.markets.find(x=>x.id===marketId);
 const sales=m?d.sales.filter(s=>s.marketId===m.id).sort((a,b)=>b.date.localeCompare(a.date)):[];
 const trip=d.trips.find(t=>!t.closed);
 const sold=(t,k,exclude)=>d.sales.filter(s=>s.tripId===t.id&&s.id!==exclude).reduce((a,s)=>a+Number(s['qty'+k]||0),0);
 const left=(t,k,exclude)=>Number(t['qty'+k]||0)-sold(t,k,exclude);
 const docMeta=(saleId,kind)=>docsMeta.find(x=>x.saleId===saleId&&x.kind===kind);

 const openCity=(name,c)=>{
  setCity(name);
  setList(false);
  setCenter(c||[-24.7,-51.6]);
  setMyPos(null);
  setRecenterToken(0);
 };

 const markets=d.markets.filter(x=>
  (!city||norm(x.city)===norm(city))&&
  (!search||norm(x.name+' '+x.city).includes(norm(search)))
 );

 const openSale=s=>setModal({
  kind:'sale',
  initial:s?{...s}:{
   date:today(),qty1000:0,qty500:0,qty200:0,qtyBear250:0,
   price1000:'',price500:'',price200:'',priceBear250:'',
   total:'',paymentMethod:'',invoiceName:''
  }
 });

 const submit=f=>{
  if(modal.kind==='market'){
   if(!f.name?.trim()||!f.city?.trim()||f.lat===''||f.lng===''||
    !Number.isFinite(Number(f.lat))||!Number.isFinite(Number(f.lng))||
    Math.abs(Number(f.lat))>90||Math.abs(Number(f.lng))>180){
    alert('Confira nome, cidade, latitude e longitude.');
    return;
   }
   const n={
    ...f,id:f.id||id(),name:f.name.trim(),city:f.city.trim(),
    lat:Number(f.lat),lng:Number(f.lng),active:f.active!==false
   };
   if(save({...d,markets:f.id?d.markets.map(x=>x.id===f.id?n:x):[...d.markets,n]}))setModal(null);
   return;
  }

  if(modal.kind==='sale'||modal.kind==='trip'){
   for(const [k] of products){
    f['qty'+k]=Number(f['qty'+k]||0);
    if(!Number.isSafeInteger(f['qty'+k])||f['qty'+k]<0){
     alert('Use quantidades inteiras, iguais ou maiores que zero.');
     return;
    }
   }
   if(!products.some(([k])=>f['qty'+k]>0)||!f.date){
    alert('Preencha a data e ao menos um produto.');
    return;
   }

   if(modal.kind==='trip'){
    if(trip||!f.city?.trim()){
     alert('Informe a cidade e encerre a carga anterior antes de iniciar outra.');
     return;
    }
    if(save({...d,trips:[...d.trips,{...f,city:f.city.trim(),id:id()}]}))setModal(null);
    return;
   }

   if(!f.paymentMethod&& !f.id){
    alert('Escolha a forma de pagamento.');
    return;
   }

   const legacy=f.id&&products.every(([k])=>f['price'+k]===undefined||f['price'+k]===null||String(f['price'+k]).trim()==='');
   let total=0;
   if(legacy){
    total=Number(f.total||0);
   }else{
    for(const [k,n] of products){
     if(f['qty'+k]>0){
      const p=parseMoney(f['price'+k]);
      if(!Number.isFinite(p)||p<0){
       alert(`Informe o preço unitário de ${n}.`);
       return;
      }
      f['price'+k]=p;
      total+=f['qty'+k]*p;
     }else{
      f['price'+k]=f['price'+k]===''||f['price'+k]===undefined?null:parseMoney(f['price'+k]);
     }
    }
   }

   const associated=f.id
    ?d.trips.find(t=>t.id===f.tripId)
    :trip&&norm(trip.city)===norm(m.city)?trip:null;
   if(associated&&products.some(([k])=>f['qty'+k]>left(associated,k,f.id))){
    alert('Venda maior que o estoque disponível.');
    return;
   }

   const sale={
    ...f,total,id:f.id||id(),marketId:m.id,
    paymentMethod:f.paymentMethod||'nao-informado',
    tripId:associated?.id||null,
    qty:products.reduce((a,[k])=>a+f['qty'+k],0)
   };
   if(save({
    ...d,
    markets:d.markets.map(x=>x.id===m.id?{...x,active:true}:x),
    sales:f.id?d.sales.map(s=>s.id===f.id?sale:s):[...d.sales,sale]
   }))setModal(null);
  }
 };

 const addPhotos=async files=>{
  if(photoLock.current||!ready)return;
  const selected=Array.from(files);
  if(selected.length+photos.length>10){
   alert('Escolha no máximo '+(10-photos.length)+' fotos.');
   return;
  }
  photoLock.current=true;
  setBusy(true);
  try{
   const added=[];
   for(const file of selected){
    added.push({id:id(),name:file.name,data:await compress(file),createdAt:Date.now()});
   }
   await photosDb('readwrite',s=>{
    for(const p of added)s.put(p);
    return s.count();
   });
   setPhotos(p=>[...p,...added]);
  }catch{
   alert('Não foi possível salvar. Tente uma foto JPG ou PNG e confira o espaço livre.');
  }finally{
   photoLock.current=false;
   setBusy(false);
  }
 };

 const removePhoto=async p=>{
  if(!confirm('Excluir esta foto?'))return;
  try{
   await photosDb('readwrite',s=>s.delete(p.id));
   setPhotos(a=>a.filter(x=>x.id!==p.id));
   setViewer(null);
  }catch{
   alert('Não foi possível excluir a foto.');
  }
 };

 const attachDoc=async(sale,kind,file)=>{
  if(!file)return;
  const isPdf=file.type==='application/pdf'||file.name.toLowerCase().endsWith('.pdf');
  if(!isPdf){
   alert('Escolha um arquivo PDF.');
   return;
  }
  if(file.size>20*1024*1024){
   alert('O PDF deve ter no máximo 20 MB.');
   return;
  }
  const record={
   id:`${sale.id}:${kind}`,saleId:sale.id,marketId:sale.marketId,kind,
   name:file.name,size:file.size,createdAt:Date.now(),blob:file
  };
  try{
   await docsDb('readwrite',s=>s.put(record));
   const {blob,...meta}=record;
   setDocsMeta(a=>[...a.filter(x=>x.id!==meta.id),meta]);
   alert(kind==='danfe'?'DANFE anexado.':'Boleto anexado.');
  }catch{
   alert('Não foi possível salvar o PDF neste aparelho. Confira o espaço livre.');
  }
 };

 const openDoc=async(saleId,kind)=>{
  try{
   const record=await docsDb('readonly',s=>s.get(`${saleId}:${kind}`));
   if(!record?.blob){
    alert('Arquivo não encontrado neste aparelho.');
    return;
   }
   const url=URL.createObjectURL(record.blob);
   const a=document.createElement('a');
   a.href=url;
   a.target='_blank';
   a.rel='noreferrer';
   a.click();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{
   alert('Não foi possível abrir o arquivo.');
  }
 };

 const deleteDocsForSales=async saleIds=>{
  if(!saleIds.length)return;
  try{
   const all=await docsDb('readonly',s=>s.getAll());
   const ids=(all||[]).filter(x=>saleIds.includes(x.saleId)).map(x=>x.id);
   if(ids.length){
    await docsDb('readwrite',s=>{
     ids.forEach(x=>s.delete(x));
     return s.count();
    });
    setDocsMeta(a=>a.filter(x=>!saleIds.includes(x.saleId)));
   }
  }catch{}
 };

 const fiscal=async()=>{
  try{
   await navigator.clipboard.writeText(
    `${m.name}\nCNPJ: ${m.cnpj||''}\nInscrição Estadual: ${m.ie||''}\nEndereço: ${m.address||''}`
   );
   alert('Dados copiados');
  }catch{
   alert('Não foi possível copiar automaticamente.');
  }
 };

 const cards=arr=>arr.map(x=>
  <article className="dcard" key={x.id}>
   <button className="drow" onClick={()=>setMarket(x.id)}>
    <span className="dstatusDot" style={{color:color(x,d.visits)}}>●</span>
    <div>
     <b>{x.name}</b>
     <small>{x.city} • {x.active===false?'Inativo':`Última visita: ${date(d.visits[x.id])}`}</small>
     {d.visits[x.id]===today()&&<small>✓ Visitado hoje</small>}
    </div>
    <b>›</b>
   </button>
   {wa(x.phone)&&<a className="dwa" href={wa(x.phone)} target="_blank" rel="noreferrer">WhatsApp</a>}
  </article>
 );

 const tabs=[
  ['map','Mapa'],['clients','Clientes'],['rank','Ranking'],
  ['notes','Notas'],['stock','Estoque'],['photos','Fotos']
 ];

 const noteSales=d.sales.filter(s=>s.invoiceName||docMeta(s.id,'danfe'));

 return <div className="d12">
  <style>{css}</style>
  <header>
   {m?<button onClick={()=>setMarket(null)}>← Voltar</button>:<img src={import.meta.env.BASE_URL+'logo-d12.png'} alt="D12"/>}
   <div>
    <h1>{m?m.name:'Vendas D12'}</h1>
    <small>{m?m.city:online?'Online':'Offline'}</small>
   </div>
   {install&&<button className="dinstall" onClick={async()=>{
    try{await install.prompt();}finally{setInstall(null);}
   }}>Instalar</button>}
  </header>

  <main>
  {m?<>
   <section className="dcard">
    <b style={{color:color(m,d.visits)}}>{m.active===false?'Cliente inativo':'Cliente ativo'}</b>
    <p>Última visita: {date(d.visits[m.id])}</p>
    <p>Última venda: {date(sales[0]?.date)}</p>
    {sales[0]&&<p>{items(sales[0])}</p>}
   </section>

   <div className="dactions dmarketActions">
    <button className="dprimary" onClick={()=>openSale()}>＋ Nova venda</button>
    <button onClick={()=>save({...d,visits:{...d.visits,[m.id]:today()}})}>
     {d.visits[m.id]===today()?'✓ Visitado hoje':'Marcar visita'}
    </button>
    <a href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`}
     target="_blank" rel="noreferrer">Como chegar</a>
   </div>

   <section className="dcard">
    <h2>Histórico de vendas</h2>
    {!sales.length&&<p>Sem vendas registradas.</p>}
    {sales.map(s=>{
     const danfe=docMeta(s.id,'danfe');
     const boleto=docMeta(s.id,'boleto');
     const isBoleto=norm(s.paymentMethod)==='boleto';
     return <article className="dsale" key={s.id}>
      <div className="dsaleHead">
       <b>{date(s.date)}</b>
       <strong>{money(s.total)}</strong>
      </div>
      {itemLines(s).map((line,i)=><p key={i}>{line}</p>)}
      <p><b>Pagamento:</b> {paymentLabel(s.paymentMethod)}</p>
      {s.invoiceName&&<p><b>Nota:</b> {s.invoiceName}</p>}

      <div className="ddocActions">
       <a className="dprimary" href={NFAE} target="_blank" rel="noreferrer">Emitir nota fiscal</a>
       <label className="dfileButton">{danfe?'Trocar DANFE':'Anexar DANFE'}
        <input type="file" accept="application/pdf,.pdf" onChange={e=>{
         attachDoc(s,'danfe',e.target.files?.[0]);
         e.target.value='';
        }}/>
       </label>
       {danfe&&<button onClick={()=>openDoc(s.id,'danfe')}>Abrir DANFE</button>}
       {isBoleto&&<label className="dfileButton">{boleto?'Trocar boleto':'Anexar boleto'}
        <input type="file" accept="application/pdf,.pdf" onChange={e=>{
         attachDoc(s,'boleto',e.target.files?.[0]);
         e.target.value='';
        }}/>
       </label>}
       {isBoleto&&boleto&&<button onClick={()=>openDoc(s.id,'boleto')}>Abrir boleto</button>}
      </div>
      {danfe&&<small>DANFE: {danfe.name}</small>}
      {isBoleto&&boleto&&<small>Boleto: {boleto.name}</small>}

      <div className="dsaleEdit">
       <button onClick={()=>openSale(s)}>Editar venda</button>
       <button onClick={async()=>{
        if(confirm('Excluir a venda e seus documentos anexados?')){
         await deleteDocsForSales([s.id]);
         save({...d,sales:d.sales.filter(x=>x.id!==s.id)});
        }
       }}>Excluir</button>
      </div>
     </article>;
    })}
   </section>

   <section className="dcard">
    <h2>Dados do mercado</h2>
    {[
     ['CNPJ',m.cnpj],['Inscrição Estadual',m.ie],
     ['Endereço',m.address],['Telefone',m.phone]
    ].map(([label,v])=><p key={label}>{label}: {v||'—'}</p>)}
    {wa(m.phone)&&<a className="dwa" href={wa(m.phone)} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
    <p><button onClick={fiscal}>Copiar dados fiscais</button></p>
    <div className="dactions">
     <button onClick={()=>setModal({kind:'market',initial:m})}>Editar cadastro</button>
     <button onClick={()=>save({...d,markets:d.markets.map(x=>x.id===m.id?{...x,active:x.active===false}:x)})}>
      {m.active===false?'Ativar cliente':'Inativar cliente'}
     </button>
    </div>
   </section>

   <button className="ddanger" onClick={async()=>{
    if(confirm('Excluir este mercado, todas as vendas e documentos anexados?')){
     const ids=d.sales.filter(s=>s.marketId===m.id).map(s=>s.id);
     await deleteDocsForSales(ids);
     if(save({...d,markets:d.markets.filter(x=>x.id!==m.id),sales:d.sales.filter(s=>s.marketId!==m.id)}))setMarket(null);
    }
   }}>Excluir mercado</button>
  </>:<>

   {(tab==='map'||tab==='clients')&&<>
    <div className="dtitleRow">
     <h2>{tab==='map'?city||'Paraná':'Clientes'}</h2>
     <button onClick={()=>setModal({kind:'market',initial:{name:'',city,lat:'',lng:'',active:false,phone:''}})}>＋ Mercado</button>
    </div>
   </>}

   {tab==='map'&&<>
    {city?<>
     <div className="dactions dcityActions">
      <button onClick={()=>{setCity('');setMyPos(null)}}>← Paraná</button>
      <button onClick={()=>setList(!list)}>{list?'Ver mapa':'Lista de mercados'}</button>
      {!list&&<button className="dlocateBtn" disabled={!myPos} onClick={()=>setRecenterToken(x=>x+1)}>📍 Minha localização</button>}
     </div>
     {!list&&locStatus&&<p className="dlocStatus">{locStatus}</p>}
     {!list&&myPos&&<small className="dlocStatus">GPS ativo • precisão aproximada: {Math.round(myPos.accuracy)} m</small>}
     <p className="dlegend">
      <span><b style={{color:'#24b96f'}}>●</b> Visitado há até 30 dias</span>
      <span><b style={{color:'#f2a41d'}}>●</b> Mais de 30 dias ou sem visita</span>
      <span><b style={{color:'#777'}}>●</b> Inativo</span>
     </p>
     {list?cards(markets):
      <MapContainer key={city}
       center={markets[0]?[markets[0].lat,markets[0].lng]:center}
       zoom={12} className="dmap dcityMap">
       <TileLayer attribution="© OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
       {markets.map(x=><Marker key={x.id} position={[x.lat,x.lng]}
        icon={L.divIcon({
         className:'dclientIcon',
         html:`<div style="background:${color(x,d.visits)}"></div>`,
         iconSize:[38,38],iconAnchor:[19,19]
        })}
        eventHandlers={{click:()=>setMarket(x.id)}}/>)}
       {myPos&&<Marker position={[myPos.lat,myPos.lng]} interactive={false}
        icon={L.divIcon({className:'dmyLocationIcon',html:'<div><span></span></div>',iconSize:[30,30],iconAnchor:[15,15]})}/>} 
       <FollowLocation position={myPos} recenterToken={recenterToken}/>
      </MapContainer>}
     {!markets.length&&<p>Nenhum mercado cadastrado nesta cidade.</p>}
    </>:<>
     <p className="dlegend">
      <span><b style={{color:'#777'}}>●</b> Cinza: sem cliente ativo</span>
      <span><b style={{color:'#24b96f'}}>●</b> Verde: cliente ativo, visita até 30 dias</span>
      <span><b style={{color:'#f2a41d'}}>●</b> Laranja: cliente ativo, mais de 30 dias sem visita</span>
     </p>
     {geo?
      <MapContainer key="estado" center={[-24.7,-51.6]} zoom={7}
       className="dmap dstateMap" minZoom={7} maxZoom={13}
       dragging={true} zoomControl={true} scrollWheelZoom={true}
       doubleClickZoom={true} touchZoom={true} attributionControl={false}>
       <Fit geo={geo}/>
       <GeoJSON key={d.markets.map(x=>x.id+x.city+x.active+(d.visits[x.id]||'')).join()}
        data={geo}
        style={f=>({color:'#777',weight:.6,fillOpacity:1,fillColor:cityColor(cityName(f),d.markets,d.visits)})}
        onEachFeature={(f,l)=>{
         const n=cityName(f);
         l.bindTooltip(n);
         l.on('click',()=>{
          const c=l.getBounds().getCenter();
          openCity(n,[c.lat,c.lng]);
         });
        }}/>
       <CityLabels geo={geo}/>
      </MapContainer>:
      <p>{geoError?'Não foi possível carregar o desenho. Confira a conexão ou use a lista abaixo.':'Carregando desenho do Paraná…'}</p>}
     {Array.from(new Set(d.markets.map(x=>x.city))).sort().map(n=><button className="dcity" key={n} onClick={()=>openCity(n)}>{n}</button>)}
    </>}
   </>}

   {tab==='clients'&&<>
    <input placeholder="Buscar mercado ou cidade" value={search} onChange={e=>setSearch(e.target.value)}/>
    {cards(d.markets.filter(x=>norm(x.name+' '+x.city).includes(norm(search))))}
   </>}

   {tab==='rank'&&<>
    <h2>Top 10 clientes</h2>
    {d.markets.map(x=>({
     ...x,total:d.sales.filter(s=>s.marketId===x.id).reduce((a,s)=>a+Number(s.total||0),0)
    })).sort((a,b)=>b.total-a.total).slice(0,10).map((x,i)=>
     <button className="drow dcard" key={x.id} onClick={()=>setMarket(x.id)}>
      {i+1}º — {x.name} — {money(x.total)}
     </button>
    )}
   </>}

   {tab==='notes'&&<>
    <h2>Notas fiscais</h2>
    <p>Os DANFEs ficam vinculados à venda e ao mercado neste aparelho.</p>
    {!noteSales.length&&<p>Nenhuma nota registrada.</p>}
    {noteSales.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{
     const market=d.markets.find(x=>x.id===s.marketId);
     const danfe=docMeta(s.id,'danfe');
     return <section className="dcard" key={s.id}>
      <b>{market?.name||'Mercado'} • {date(s.date)}</b>
      <p>{s.invoiceName||danfe?.name||'DANFE anexado'}</p>
      <div className="dactions">
       <button onClick={()=>setMarket(s.marketId)}>Abrir mercado</button>
       {danfe&&<button onClick={()=>openDoc(s.id,'danfe')}>Abrir DANFE</button>}
      </div>
     </section>;
    })}
   </>}

   {tab==='stock'&&<>
    <h2>Estoque à pronta entrega</h2>
    <p>Inicie uma carga. As novas vendas na mesma cidade descontam os produtos automaticamente.</p>
    {trip?
     <section className="dcard">
      <h3>{trip.city} • {date(trip.date)}</h3>
      <div className="dgrid">
       {products.map(([k,n])=>
        <div className="dcard" key={k}>
         <b>{n}</b>
         <h2 style={{color:left(trip,k)<=5?'#ff7373':'#53d995'}}>{left(trip,k)} disponíveis</h2>
         <small>Levados: {trip['qty'+k]||0} • Vendidos: {sold(trip,k)}</small>
        </div>
       )}
      </div>
      <button onClick={()=>{
       if(confirm('Encerrar esta viagem?'))save({...d,trips:d.trips.map(t=>t.id===trip.id?{...t,closed:today()}:t)});
      }}>Encerrar viagem</button>
     </section>:
     <button onClick={()=>setModal({kind:'trip',initial:{city,date:today()}})}>＋ Iniciar carga</button>}
    {d.trips.filter(t=>t.closed).slice().reverse().map(t=>
     <section className="dcard" key={t.id}>
      <h3>{t.city} — encerrada em {date(t.closed)}</h3>
      {products.map(([k,n])=><p key={k}>{n}: {t['qty'+k]||0} levados / {sold(t,k)} vendidos / {left(t,k)} restantes</p>)}
     </section>
    )}
   </>}

   {tab==='photos'&&<>
    <h2>Fotos dos produtos — {photos.length}/10</h2>
    <p>Toque na imagem para mostrar ao cliente. As fotos ficam neste aparelho, disponíveis offline.</p>
    <label className="dupload">Adicionar fotos
     <input disabled={!ready||busy||photos.length>=10} type="file" accept="image/*" multiple
      onChange={e=>{addPhotos(e.target.files);e.target.value=''}}/>
    </label>
    {busy&&<p>Salvando fotos…</p>}
    <div className="dgrid">
     {photos.map(p=><button className="dphotoButton" key={p.id} onClick={()=>setViewer(p)}>
      <img className="dphoto" src={p.data} alt={p.name}/>
     </button>)}
    </div>
   </>}
  </>}
  </main>

  <nav>
   {tabs.map(([key,label])=>
    <button key={key} className={tab===key?'active':''}
     onClick={()=>{setTab(key);setMarket(null);setSearch('')}}>{label}</button>
   )}
  </nav>

  {modal&&<Form key={modal.kind+(modal.initial?.id||'')}
   modal={modal} onClose={()=>setModal(null)} onSave={submit}
   stockHint={trip&&m&&norm(trip.city)===norm(m.city)
    ?'Carga ativa: '+products.map(([k,n])=>`${left(trip,k)} ${n}`).join(' • ')
    :'Sem carga ativa para esta cidade. A venda será registrada sem descontar estoque.'}/>}

  {viewer&&<div className="dviewer">
   <button onClick={()=>setViewer(null)}>✕ Fechar</button>
   <img src={viewer.data} alt={viewer.name}/>
   <button onClick={()=>removePhoto(viewer)}>Excluir foto</button>
  </div>}
 </div>;
}

function paymentLabel(v){
 return ({boleto:'Boleto',pix:'Pix',dinheiro:'Dinheiro',cartao:'Cartão',outro:'Outro','nao-informado':'Não informado'})[v]||v||'Não informado';
}

function Form({modal,onClose,onSave,stockHint}){
 const [f,setF]=useState({...modal.initial});
 const [locating,setLocating]=useState(false);
 const set=(k,v)=>setF(a=>({...a,[k]:v}));
 const input=(k,label,type='text',opts={})=>
  <label key={k}>{label}
   <input type={type} step={opts.step??(type==='number'?'any':undefined)}
    min={opts.min??(type==='number'&&k.startsWith('qty')?'0':undefined)}
    inputMode={opts.inputMode}
    value={f[k]??''} onChange={e=>set(k,e.target.value)}/>
  </label>;
 const kind=modal.kind;

 const calcTotal=()=>products.reduce((sum,[k])=>{
  const q=Number(f['qty'+k]||0);
  const p=parseMoney(f['price'+k]);
  return sum+(q>0&&Number.isFinite(p)?q*p:0);
 },0);

 const locate=()=>{
  if(!navigator.geolocation){
   alert('Localização indisponível.');
   return;
  }
  setLocating(true);
  navigator.geolocation.getCurrentPosition(p=>{
   setF(a=>({...a,lat:p.coords.latitude.toFixed(6),lng:p.coords.longitude.toFixed(6)}));
   setLocating(false);
  },()=>{
   setLocating(false);
   alert('Não foi possível obter sua localização. Verifique a permissão de localização do navegador.');
  },{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
 };

 return <div className="doverlay">
  <section className="dmodal">
   <button className="dclose" onClick={onClose}>✕ Fechar</button>
   <h2>{kind==='market'?'Cadastro do mercado':kind==='sale'?'Registrar venda':'Nova carga'}</h2>
   <form onSubmit={e=>{e.preventDefault();onSave({...f})}}>
    {kind==='market'&&<>
     {input('name','Nome do mercado')}
     {input('city','Cidade')}
     <label>Situação
      <select value={f.active===false?'no':'yes'} onChange={e=>set('active',e.target.value==='yes')}>
       <option value="yes">Cliente ativo</option>
       <option value="no">Cadastrado / inativo</option>
      </select>
     </label>
     <div className="dgrid">
      {input('lat','Latitude','number')}
      {input('lng','Longitude','number')}
     </div>
     <button type="button" disabled={locating} onClick={locate}>{locating?'Obtendo localização…':'Usar localização atual'}</button>
     {input('cnpj','CNPJ')}
     {input('ie','Inscrição Estadual')}
     {input('address','Endereço')}
     {input('phone','Telefone com DDD','tel')}
    </>}

    {(kind==='sale'||kind==='trip')&&<>
     {kind==='trip'?input('city','Cidade da viagem'):<p>{f.id?'Ao editar, o saldo da carga vinculada será recalculado.':stockHint}</p>}
     {input('date','Data','date')}
     {kind==='trip'?<div className="dgrid">
      {products.map(([k,n])=>input('qty'+k,n,'number',{step:'1',min:'0',inputMode:'numeric'}))}
     </div>:<>
      <h3>Produtos vendidos</h3>
      <div className="dproductList">
       {products.map(([k,n])=><section className="dsaleProduct" key={k}>
        <b>{n}</b>
        <div className="dproductFields">
         {input('qty'+k,'Quantidade','number',{step:'1',min:'0',inputMode:'numeric'})}
         {input('price'+k,'Preço por unidade (R$)','text',{inputMode:'decimal'})}
        </div>
       </section>)}
      </div>
      <label>Forma de pagamento
       <select value={f.paymentMethod||''} onChange={e=>set('paymentMethod',e.target.value)}>
        <option value="">Selecione</option>
        <option value="boleto">Boleto</option>
        <option value="pix">Pix</option>
        <option value="dinheiro">Dinheiro</option>
        <option value="cartao">Cartão</option>
        <option value="outro">Outro</option>
       </select>
      </label>
      {input('invoiceName','Número/identificação da nota (opcional)')}
      <div className="dtotalBox">
       <small>Total calculado</small>
       <strong>{money(calcTotal() || Number(f.total||0))}</strong>
      </div>
     </>}
    </>}

    <button className="dsave" type="submit">Salvar</button>
   </form>
  </section>
 </div>;
}

const css=`
.d12{background:#101010;color:#eee;min-height:100vh;font:15px system-ui;padding-bottom:86px}
.d12 *{box-sizing:border-box}
.d12 header{display:flex;gap:10px;align-items:center;padding:10px 12px;min-height:66px;position:sticky;top:0;z-index:1001;background:#101010f3;border-bottom:1px solid #2d2d2d}
.d12 header img{width:46px;height:46px;object-fit:contain}
.d12 header>div{flex:1;min-width:0}
.d12 h1{font-size:19px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.d12 h2{font-size:20px;margin:12px 0}
.d12 h3{margin:14px 0 8px}
.d12 main{max-width:950px;margin:auto;padding:12px}
.d12 button,.d12 a,.dfileButton{cursor:pointer;color:#eee;background:#242424;border:1px solid #454545;border-radius:10px;padding:11px;text-decoration:none;font:inherit;min-height:44px}
.d12 button:disabled{opacity:.45;cursor:not-allowed}
.d12 input,.d12 select{width:100%;padding:12px;border:1px solid #555;border-radius:9px;background:#202020;color:#fff;font:inherit;margin:6px 0 12px;min-height:46px}
.d12 label{display:block}
.d12 small{display:block;color:#bbb}
.dinstall{margin-left:auto!important}
.dcard{background:#181818;border:1px solid #393939;border-radius:14px;padding:13px;margin:12px 0}
.drow{display:flex!important;width:100%;gap:12px;align-items:center;text-align:left}
.drow>div{flex:1;min-width:0}
.dstatusDot{font-size:20px;line-height:1}
.dwa{display:block;text-align:center;background:#143826!important;color:#7becad!important;margin-top:8px}
.dprimary{background:#a83d19!important;border-color:#d95b2b!important}
.dactions,.dgrid,.ddocActions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0}
.dactions a,.ddocActions a,.dfileButton{text-align:center}
.dmarketActions{grid-template-columns:repeat(3,minmax(0,1fr))}
.dmap{height:55vh;min-height:330px;background:#141414;border-radius:12px;z-index:1;overflow:hidden;border:1px solid #333}
.dsale{border-top:1px solid #444;padding:16px 0}
.dsale:first-of-type{border-top:0}
.dsale p{font-size:13px;margin:7px 0}
.dsaleHead{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:8px}
.dsaleHead strong{font-size:17px;color:#7becad}
.dsaleEdit{display:flex;gap:8px;margin-top:10px}
.dfileButton{display:flex!important;align-items:center;justify-content:center}
.dfileButton input{display:none!important}
.dcity{margin:4px}
.dupload{display:block;background:#242424;border:1px solid #454545;border-radius:10px;padding:11px;text-align:center;cursor:pointer}
.dupload input{margin:10px 0 0}
.dphotoButton{padding:0!important;overflow:hidden}
.dphoto{display:block;width:100%;height:180px;object-fit:cover}
.dtitleRow{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dtitleRow h2{flex:1}
.dlegend{display:flex;flex-wrap:wrap;gap:7px 14px;line-height:1.4;font-size:13px}
.dcityLabelIcon{background:transparent!important;border:0!important}
.dcityLabelIcon span{display:block;width:124px;text-align:center;color:#fff;background:#111e;border:1px solid #fff5;border-radius:6px;padding:3px 4px;font-size:11px;font-weight:700;text-shadow:0 1px 2px #000;box-shadow:0 1px 4px #0008}
.dclientIcon{background:transparent!important;border:0!important}
.dclientIcon>div{width:38px;height:38px;border:4px solid #fff;border-radius:50%;box-shadow:0 3px 9px #000b}
.dmyLocationIcon{background:transparent!important;border:0!important}
.dmyLocationIcon>div{width:30px;height:30px;border-radius:50%;background:#2176ff55;display:grid;place-items:center;box-shadow:0 0 0 6px #2176ff22}
.dmyLocationIcon span{width:15px;height:15px;border-radius:50%;background:#2176ff;border:3px solid #fff;display:block;box-shadow:0 1px 5px #000}
.dlocStatus{margin:6px 0;color:#bcd2ff}
.dproductList{display:grid;gap:10px}
.dsaleProduct{background:#191919;border:1px solid #3c3c3c;border-radius:12px;padding:11px}
.dproductFields{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}
.dproductFields label{font-size:12px;color:#ccc}
.dproductFields input{margin-bottom:0}
.dtotalBox{background:#101d17;border:1px solid #2a6848;border-radius:12px;padding:12px;margin:10px 0;display:flex;align-items:center;justify-content:space-between}
.dtotalBox strong{font-size:22px;color:#7becad}
.d12 nav{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));position:fixed;bottom:0;left:0;right:0;background:#111;z-index:1000;min-height:66px;padding:4px;padding-bottom:max(4px,env(safe-area-inset-bottom));border-top:1px solid #2d2d2d}
.d12 nav button{padding:4px 1px;border:0;background:none;border-radius:0;font-size:10px;min-width:0;white-space:nowrap;color:#bbb}
.d12 nav button.active{color:#ff895d;font-weight:700}
.doverlay{position:fixed;inset:0;background:#000c;display:flex;align-items:center;justify-content:center;z-index:2000;padding:8px}
.dmodal{background:#141414;width:100%;max-width:620px;max-height:94vh;overflow:auto;padding:16px;border:1px solid #555;border-radius:18px}
.dclose{position:sticky;top:0;z-index:2;float:right}
.dsave{width:100%;background:#bb421b!important;margin-top:12px;font-weight:700}
.ddanger{background:#421b1b!important;border-color:#773535!important;color:#ffb0b0!important;width:100%}
.dviewer{position:fixed;inset:0;background:black;z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:12px}
.dviewer img{max-height:78vh;max-width:100%;object-fit:contain}
@media(max-width:600px){
 .d12{padding-bottom:78px;font-size:14px}
 .d12 main{padding:9px}
 .d12 header{min-height:62px;padding:8px 10px}
 .d12 header img{width:42px;height:42px}
 .d12 h1{font-size:18px}
 .d12 h2{font-size:18px}
 .dactions,.dgrid,.ddocActions{grid-template-columns:1fr 1fr;gap:8px}
 .dmarketActions{grid-template-columns:1fr 1fr}
 .dmarketActions .dprimary{grid-column:1/-1}
 .dmap{height:clamp(260px,42vh,370px);min-height:0;max-height:370px}
 .dstateMap{height:clamp(300px,46vh,410px);max-height:410px}
 .dcityActions{position:sticky;top:62px;z-index:900;background:#101010f5;padding:7px 0;margin:3px 0 7px}
 .dcityActions .dlocateBtn{grid-column:1/-1}
 .dcityActions button{font-weight:700}
 .dlegend{font-size:11px;margin:7px 0}
 .d12 nav{min-height:62px}
 .d12 nav button{font-size:clamp(8px,2.55vw,10px);padding:4px 0}
 .dcard{padding:11px;margin:9px 0}
 .dsaleProduct{padding:10px}
 .dproductFields{grid-template-columns:1fr 1fr;gap:7px}
 .dproductFields input{padding:10px;font-size:16px}
 .dmodal{max-height:100dvh;height:100dvh;border-radius:0;padding:12px 10px 90px}
 .ddocActions{grid-template-columns:1fr 1fr}
 .dfileButton,.ddocActions button,.ddocActions a{font-size:13px;padding:9px 6px}
}
@media(max-width:360px){
 .d12 nav button{font-size:8px}
 .dproductFields{grid-template-columns:1fr}
 .dactions,.ddocActions{grid-template-columns:1fr 1fr}
}
`;

createRoot(document.getElementById('root')).render(<App/>);
