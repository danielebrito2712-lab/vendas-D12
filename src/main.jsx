import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MapContainer,GeoJSON,TileLayer,Marker,useMap} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const KEY='vendas-d12-data-v1',GEO='vendas-d12-pr-municipios-v1';
const products=[
 ['1000','Pote de 1 kg'],
 ['500','Pote de 500 g'],
 ['200','Bisnaga de 200 g'],
 ['Bear250','Bisnaga urso de 250 g']
];
const id=()=>crypto.randomUUID();
const today=()=>{
 const d=new Date();
return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=s=>s?s.split('-').reverse().join('/'):'Sem venda';
const last=(m,s)=>s.filter(x=>x.marketId===m.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
const color=(m,s)=>m.active===false?'#e8bc32':last(m,s)&&Math.round((new Date(today()+'T12:00:00')-new Date(last(m,s).date+'T12:00:00'))/86400000)<=30?'#24b96f':'#ed5555';
const items=s=>s.qty500==null?${s.qty||0} unidades:products.map(([k,n])=>${s['qty'+k]||0} × ${n}).join(' • ');
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

async function photosDb(mode,action){
 const db=await new Promise((ok,no)=>{
  const r=indexedDB.open('vendas-d12-fotos',1);
  r.onupgradeneeded=()=>r.result.createObjectStore('photos',{keyPath:'id'});
  r.onsuccess=()=>ok(r.result);
  r.onerror=()=>no(r.error);
 });
 return new Promise((ok,no)=>{
  const t=db.transaction('photos',mode);
  const r=action(t.objectStore('photos'));
  t.oncomplete=()=>{db.close();ok(r.result)};
  t.onabort=t.onerror=()=>{db.close();no(t.error)};
 });
}

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
 const [busy,setBusy]=useState(false);
 const [ready,setReady]=useState(false);
 const [online,setOnline]=useState(navigator.onLine);
 const [install,setInstall]=useState(null);
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
   if(alive){setPhotos(p);setReady(true)}
  }).catch(()=>alert('Não foi possível abrir a galeria neste navegador.'));

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

 const m=d.markets.find(x=>x.id===marketId);
 const sales=m?d.sales.filter(s=>s.marketId===m.id).sort((a,b)=>b.date.localeCompare(a.date)):[];
 const trip=d.trips.find(t=>!t.closed);
 const sold=(t,k,exclude)=>d.sales.filter(s=>s.tripId===t.id&&s.id!==exclude).reduce((a,s)=>a+Number(s['qty'+k]||0),0);
 const left=(t,k,exclude)=>Number(t['qty'+k]||0)-sold(t,k,exclude);

 const openCity=(name,c)=>{
  setCity(name);
  setList(false);
  setCenter(c||[-24.7,-51.6]);
 };

 const markets=d.markets.filter(x=>
  (!city||norm(x.city)===norm(city))&&
  (!search||norm(x.name+' '+x.city).includes(norm(search)))
 );

 const openSale=s=>setModal({
  kind:'sale',
  initial:s||{
   date:today(),qty1000:0,qty500:0,qty200:0,
   qtyBear250:0,total:'',invoiceName:''
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
   if(save({
    ...d,
    markets:f.id?d.markets.map(x=>x.id===f.id?n:x):[...d.markets,n]
   }))setModal(null);
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
    if(save({
     ...d,trips:[...d.trips,{...f,city:f.city.trim(),id:id()}]
    }))setModal(null);
    return;
   }

   const total=Number(String(f.total||0).replace(',','.'));
   if(!Number.isFinite(total)||total<0){
    alert('Confira o valor total.');
    return;
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
    tripId:associated?.id||null,
    qty:products.reduce((a,[k])=>a+f['qty'+k],0)
   };
   if(save({
    ...d,
    markets:d.markets.map(x=>x.id===m.id?{...x,active:true}:x),
    sales:f.id?d.sales.map(s=>s.id===f.id?sale:s):[...d.sales,sale]
   }))setModal(null);
   return;
  }

  if(modal.kind==='invoice'&&f.saleId&&f.invoiceName?.trim()){
   if(save({
    ...d,sales:d.sales.map(s=>s.id===f.saleId
     ?{...s,invoiceName:f.invoiceName.trim()}:s)
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
    added.push({
     id:id(),name:file.name,data:await compress(file),createdAt:Date.now()
    });
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

 const fiscal=async()=>{
  try{
   await navigator.clipboard.writeText(
    ${m.name}\nCNPJ: ${m.cnpj||''}\nInscrição Estadual: ${m.ie||''}\nEndereço: ${m.address||''}
   );
   alert('Dados copiados');
  }catch{
   alert('Não foi possível copiar automaticamente.');
  }
 };

 const cards=arr=>arr.map(x=>
  <article className="dcard" key={x.id}>
   <button className="drow" onClick={()=>setMarket(x.id)}>
    <span style={{color:color(x,d.sales)}}>●</span>
    <div>
     <b>{x.name}</b>
     <small>{x.city} • {x.active===false?'Inativo':date(last(x,d.sales)?.date)}</small>
     {d.visits[x.id]===today()&&<small>✓ Visitado hoje</small>}
    </div>
    <b>›</b>
   </button>
   {wa(x.phone)&&
    <a className="dwa" href={wa(x.phone)} target="_blank" rel="noreferrer">
     WhatsApp
    </a>}
  </article>
 );

 const tabs=[
  ['map','Mapa'],['clients','Clientes'],['rank','Ranking'],
  ['notes','Notas'],['stock','Estoque'],['photos','Fotos']
 ];

 return <div className="d12">
  <style>{css}</style>
  <header>
   {m
    ?<button onClick={()=>setMarket(null)}>← Voltar</button>
    :<img src={import.meta.env.BASE_URL+'logo-d12.png'} alt="D12"/>}
   <div>
    <h1>{m?m.name:'Vendas D12'}</h1>
    <small>{m?m.city:online?'Online':'Offline'}</small>
   </div>
   {install&&<button onClick={async()=>{
    await install.prompt();setInstall(null);
   }}>Instalar</button>}
  </header>

  <main>
  {m?<>
   <section className="dcard">
    <b style={{color:color(m,d.sales)}}>
     {m.active===false?'Cliente inativo':'Cliente ativo'}
    </b>
    <p>Última venda: {date(sales[0]?.date)}</p>
    {sales[0]&&<p>{items(sales[0])}</p>}
   </section>

   <div className="dactions">
    <button onClick={()=>openSale()}>＋ Nova venda</button>
    <button onClick={()=>save({...d,visits:{...d.visits,[m.id]:today()}})}>
     {d.visits[m.id]===today()?'✓ Visitado hoje':'Marcar visita'}
    </button>
    <button onClick={()=>setModal({
     kind:'invoice',initial:{saleId:sales[0]?.id||'',invoiceName:''}
    })}>Arquivar nota</button>
    <a href={https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}}
     target="_blank" rel="noreferrer">Como chegar</a>
   </div>

   <section className="dcard">
    <h2>Histórico de vendas</h2>
    {!sales.length&&<p>Sem vendas registradas.</p>}
    {sales.map(s=><article className="dsale" key={s.id}>
     <b>{date(s.date)} — {money(s.total)}</b>
     <p>{items(s)}</p>
     {s.invoiceName&&<p>Nota: {s.invoiceName}</p>}
     <button onClick={()=>openSale(s)}>Editar venda</button>{' '}
     <button onClick={()=>{
      if(confirm('Excluir a venda e devolver os produtos à carga vinculada?')){
       save({...d,sales:d.sales.filter(x=>x.id!==s.id)});
      }
     }}>Excluir</button>
    </article>)}
   </section>

   <section className="dcard">
    <h2>Dados do mercado</h2>
    {[
     ['CNPJ',m.cnpj],['Inscrição Estadual',m.ie],
     ['Endereço',m.address],['Telefone',m.phone]
    ].map(([label,v])=><p key={label}>{label}: {v||'—'}</p>)}
    {wa(m.phone)&&
     <a className="dwa" href={wa(m.phone)} target="_blank" rel="noreferrer">
      Abrir WhatsApp
     </a>}
    <p><button onClick={fiscal}>Copiar dados fiscais</button></p>
    <button onClick={()=>setModal({kind:'market',initial:m})}>
     Editar cadastro
    </button>{' '}
    <button onClick={()=>save({
     ...d,markets:d.markets.map(x=>x.id===m.id
      ?{...x,active:x.active===false}:x)
    })}>{m.active===false?'Ativar cliente':'Inativar cliente'}</button>
   </section>

   <button onClick={()=>{
    if(confirm('Excluir este mercado e todas as suas vendas? As quantidades voltarão às cargas vinculadas.')){
     if(save({
      ...d,markets:d.markets.filter(x=>x.id!==m.id),
      sales:d.sales.filter(s=>s.marketId!==m.id)
     }))setMarket(null);
    }
   }}>Excluir mercado</button>
  </>:<>

   {(tab==='map'||tab==='clients')&&<>
    <h2>{tab==='map'?city||'Paraná':'Clientes'}</h2>
    <button onClick={()=>setModal({
     kind:'market',
     initial:{name:'',city,lat:'',lng:'',active:false,phone:''}
    })}>＋ Cadastrar mercado</button>
   </>}

   {tab==='map'&&<>
    {city?<>
     <div className="dactions">
      <button onClick={()=>setCity('')}>← Paraná</button>
      <button onClick={()=>setList(!list)}>
       {list?'Ver mapa':'Lista de mercados'}
      </button>
     </div>
     <p>🟢 Até 30 dias • 🔴 Mais de 30 dias • 🟡 Inativo</p>
     {list?cards(markets):
      <MapContainer key={city}
       center={markets[0]?[markets[0].lat,markets[0].lng]:center}
       zoom={12} className="dmap">
       <TileLayer attribution="© OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
       {markets.map(x=><Marker key={x.id} position={[x.lat,x.lng]}
        icon={L.divIcon({
         className:'',
         html:<div style="background:${color(x,d.sales)};width:26px;height:26px;border:3px solid white;border-radius:50%;box-shadow:0 2px 5px #222"></div>,
         iconSize:[26,26],iconAnchor:[13,13]
        })}
        eventHandlers={{click:()=>setMarket(x.id)}}/>)}
      </MapContainer>}
     {!markets.length&&<p>Nenhum mercado cadastrado nesta cidade.</p>}
    </>:<>
     <p>Cinza: sem cliente ativo. Laranja: com cliente ativo.</p>
     {geo?
      <MapContainer key="estado" center={[-24.7,-51.6]} zoom={7}
       className="dmap" dragging={false} zoomControl={false}
       scrollWheelZoom={false} doubleClickZoom={false}
       touchZoom={false} attributionControl={false}>
       <Fit geo={geo}/>
       <GeoJSON key={d.markets.map(x=>x.id+x.city+x.active).join()}
        data={geo}
        style={f=>({
         color:'#777',weight:.6,fillOpacity:1,
         fillColor:d.markets.some(x=>
          x.active!==false&&norm(x.city)===norm(cityName(f))
         )?'#f2a41d':'#353535'
        })}
        onEachFeature={(f,l)=>{
         const n=cityName(f);
         l.bindTooltip(n);
         l.on('click',()=>{
          const c=l.getBounds().getCenter();
          openCity(n,[c.lat,c.lng]);
         });
        }}/>
      </MapContainer>:
      <p>{geoError
       ?'Não foi possível carregar o desenho. Confira a conexão ou use a lista abaixo.'
       :'Carregando desenho do Paraná…'}</p>}
     {Array.from(new Set(d.markets.map(x=>x.city))).sort().map(n=>
      <button key={n} onClick={()=>openCity(n)}>{n}</button>
     )}
    </>}
   </>}

   {tab==='clients'&&<>
    <input placeholder="Buscar mercado ou cidade" value={search}
     onChange={e=>setSearch(e.target.value)}/>
    {cards(d.markets.filter(x=>
     norm(x.name+' '+x.city).includes(norm(search))
    ))}
   </>}

   {tab==='rank'&&<>
    <h2>Top 10 clientes</h2>
    {d.markets.map(x=>({
     ...x,total:d.sales.filter(s=>s.marketId===x.id)
      .reduce((a,s)=>a+Number(s.total||0),0)
    })).sort((a,b)=>b.total-a.total).slice(0,10).map((x,i)=>
     <button className="drow dcard" key={x.id}
      onClick={()=>setMarket(x.id)}>
      {i+1}º — {x.name} — {money(x.total)}
     </button>
    )}
   </>}

   {tab==='notes'&&<>
    <h2>Notas fiscais</h2>
    <p>Identificações das notas vinculadas às vendas.</p>
    {d.sales.filter(s=>s.invoiceName).map(s=>
     <button className="drow dcard" key={s.id}
      onClick={()=>setMarket(s.marketId)}>
      {s.invoiceName} • {date(s.date)} • {d.markets.find(x=>x.id===s.marketId)?.name}
     </button>
    )}
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
         <h2 style={{color:left(trip,k)<=5?'#ff7373':'#53d995'}}>
          {left(trip,k)} disponíveis
         </h2>
         <small>Levados: {trip['qty'+k]||0} • Vendidos: {sold(trip,k)}</small>
        </div>
       )}
      </div>
      <button onClick={()=>{
       if(confirm('Encerrar esta viagem?')){
        save({...d,trips:d.trips.map(t=>t.id===trip.id
         ?{...t,closed:today()}:t)});
       }
      }}>Encerrar viagem</button>
     </section>:
     <button onClick={()=>setModal({
      kind:'trip',initial:{city,date:today()}
     })}>＋ Iniciar carga</button>}
    {d.trips.filter(t=>t.closed).slice().reverse().map(t=>
     <section className="dcard" key={t.id}>
      <h3>{t.city} — encerrada em {date(t.closed)}</h3>
      {products.map(([k,n])=>
       <p key={k}>{n}: {t['qty'+k]||0} levados / {sold(t,k)} vendidos / {left(t,k)} restantes</p>
      )}
     </section>
    )}
   </>}

   {tab==='photos'&&<>
    <h2>Fotos dos produtos — {photos.length}/10</h2>
    <p>Toque na imagem para mostrar ao cliente. As fotos ficam neste aparelho, disponíveis offline.</p>
    <label>Adicionar fotos
     <input disabled={!ready||busy||photos.length>=10}
      type="file" accept="image/*" multiple
      onChange={e=>{addPhotos(e.target.files);e.target.value=''}}/>
    </label>
    {busy&&<p>Salvando fotos…</p>}
    <div className="dgrid">
     {photos.map(p=>
      <button key={p.id} onClick={()=>setViewer(p)}>
       <img className="dphoto" src={p.data} alt={p.name}/>
      </button>
     )}
    </div>
   </>}
  </>}
  </main>

  <nav>
   {tabs.map(([key,label])=>
    <button key={key} style={{color:tab===key?'#ff895d':'#bbb'}}
     onClick={()=>{setTab(key);setMarket(null);setSearch('')}}>
     {label}
    </button>
   )}
  </nav>

  {modal&&<Form key={modal.kind+(modal.initial?.id||'')}
   modal={modal} onClose={()=>setModal(null)}
   onSave={submit} sales={sales}
   stockHint={trip&&m&&norm(trip.city)===norm(m.city)
    ?'Carga ativa: '+products.map(([k,n])=>${left(trip,k)} ${n}).join(' • ')
    :'Sem carga ativa para esta cidade. A venda será registrada sem descontar estoque.'}/>}

  {viewer&&<div className="dviewer">
   <button onClick={()=>setViewer(null)}>✕ Fechar</button>
   <img src={viewer.data} alt={viewer.name}/>
   <button onClick={()=>removePhoto(viewer)}>Excluir foto</button>
  </div>}
 </div>;
}

function Form({modal,onClose,onSave,sales,stockHint}){
 const [f,setF]=useState({...modal.initial});
 const [locating,setLocating]=useState(false);
 const set=(k,v)=>setF(a=>({...a,[k]:v}));
 const input=(k,label,type='text')=>
  <label key={k}>{label}
   <input type={type} step={type==='number'?'any':undefined}
    value={f[k]??''} onChange={e=>set(k,e.target.value)}/>
  </label>;
 const kind=modal.kind;

 const locate=()=>{
  if(!navigator.geolocation){
   alert('Localização indisponível.');
   return;
  }
  setLocating(true);
  navigator.geolocation.getCurrentPosition(p=>{
   setF(a=>({
    ...a,lat:p.coords.latitude.toFixed(6),lng:p.coords.longitude.toFixed(6)
   }));
   setLocating(false);
  },()=>{
   setLocating(false);
   alert('Não foi possível obter sua localização.');
  },{timeout:15000});
 };

 return <div className="doverlay">
  <section className="dmodal">
   <button onClick={onClose}>✕ Fechar</button>
   <h2>{kind==='market'?'Cadastro do mercado':kind==='sale'
    ?'Registrar venda':kind==='trip'?'Nova carga':'Vincular nota'}</h2>
   <form onSubmit={e=>{e.preventDefault();onSave({...f})}}>
    {kind==='market'&&<>
     {input('name','Nome do mercado')}
     {input('city','Cidade')}
     <label>Situação
      <select value={f.active===false?'no':'yes'}
       onChange={e=>set('active',e.target.value==='yes')}>
       <option value="yes">Cliente ativo</option>
       <option value="no">Cadastrado / inativo</option>
      </select>
     </label>
     <div className="dgrid">
      {input('lat','Latitude','number')}
      {input('lng','Longitude','number')}
     </div>
     <button type="button" disabled={locating} onClick={locate}>
      {locating?'Obtendo localização…':'Usar localização atual'}
     </button>
     {input('cnpj','CNPJ')}
     {input('ie','Inscrição Estadual')}
     {input('address','Endereço')}
     {input('phone','Telefone com DDD','tel')}
    </>}

    {(kind==='sale'||kind==='trip')&&<>
     {kind==='trip'?input('city','Cidade da viagem'):
      <p>{f.id?'Ao editar, o saldo da carga vinculada será recalculado.':stockHint}</p>}
     {input('date','Data','date')}
     <div className="dgrid">
      {products.map(([k,n])=>input('qty'+k,n,'number'))}
     </div>
     {kind==='sale'&&<>
      {input('total','Valor total em reais')}
      {input('invoiceName','Identificação da nota (opcional)')}
     </>}
    </>}

    {kind==='invoice'&&<>
     <label>Venda
      <select value={f.saleId||''} onChange={e=>set('saleId',e.target.value)}>
       <option value="">Selecione</option>
       {sales.map(s=>
        <option key={s.id} value={s.id}>{date(s.date)} — {money(s.total)}</option>
       )}
      </select>
     </label>
     {input('invoiceName','Identificação da nota')}
     <p>Este campo guarda o nome ou número da nota. Não anexa o PDF.</p>
    </>}

    <button className="dsave" type="submit">Salvar</button>
   </form>
  </section>
 </div>;
}

const css=`
.d12{background:#101010;color:#eee;min-height:100vh;font:15px system-ui;padding-bottom:90px}
.d12 *{box-sizing:border-box}
.d12 header{display:flex;gap:12px;align-items:center;padding:12px;height:auto;min-height:70px}
.d12 header img{width:48px}
.d12 h1{font-size:20px;margin:0}
.d12 h2{font-size:20px}
.d12 main{max-width:950px;margin:auto;padding:14px}
.d12 button,.d12 a{cursor:pointer;color:#eee;background:#242424;border:1px solid #454545;border-radius:10px;padding:11px;text-decoration:none}
.d12 button:disabled{opacity:.4}
.d12 input,.d12 select{width:100%;padding:12px;border:1px solid #555;border-radius:9px;background:#202020;color:#fff;font:inherit;margin:6px 0 12px}
.d12 label{display:block}
.d12 small{display:block;color:#bbb}
.dcard{background:#181818;border:1px solid #393939;border-radius:14px;padding:13px;margin:12px 0}
.drow{display:flex!important;width:100%;gap:12px;align-items:center;text-align:left}
.drow>div{flex:1}
.dwa{display:block;text-align:center;background:#143826!important;color:#7becad!important;margin-top:8px}
.dactions,.dgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
.dactions a{text-align:center}
.dmap{height:55vh;min-height:330px;background:#141414;border-radius:12px;z-index:1}
.dsale{border-top:1px solid #444;padding:12px 0}
.dsale p{font-size:13px}
.d12 nav{display:flex;position:fixed;bottom:0;left:0;right:0;background:#111;z-index:1000;height:72px;padding:4px}
.d12 nav button{flex:1;padding:3px;border:0;background:none;border-radius:0;font-size:11px;min-width:0}
.doverlay{position:fixed;inset:0;background:#000b;display:flex;align-items:center;justify-content:center;z-index:2000;padding:10px}
.dmodal{background:#141414;width:100%;max-width:620px;max-height:92vh;overflow:auto;padding:18px;border:1px solid #555;border-radius:18px}
.dsave{width:100%;background:#bb421b!important;margin-top:12px}
.dphoto{width:100%;height:180px;object-fit:cover}
.dviewer{position:fixed;inset:0;background:black;z-index:3000;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:12px;gap:12px}
.dviewer img{max-height:78vh;max-width:100%;object-fit:contain}
`;

createRoot(document.getElementById('root')).render(<App/>);
