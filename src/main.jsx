import React, {useEffect, useMemo, useRef, useState} from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPinned, Trophy, Plus, Store, FileText, Copy, Navigation, CheckCircle2, Circle, ArrowLeft, Trash2, Settings, Search, X, Camera, Home } from 'lucide-react';
import './styles.css';

const orange='#f24a1d';
const STORAGE='vendas-d12-data-v1';
const seed={markets:[],sales:[],visits:{}};
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const dateBR=v=>v?new Date(v+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const daysSince=v=>{if(!v)return 9999; const a=new Date(v+'T12:00:00'),b=new Date(); return Math.floor((b-a)/86400000)};
const uid=()=>Math.random().toString(36).slice(2)+Date.now().toString(36);

const pin=(visited=false)=>L.divIcon({className:'custom-pin',html:`<div class="pin ${visited?'visited':''}"><span></span></div>`,iconSize:[28,38],iconAnchor:[14,38]});
function Fly({center,zoom}){const map=useMap();useEffect(()=>{map.flyTo(center,zoom,{duration:.6})},[center,zoom]);return null}

function App(){
 const [data,setData]=useState(()=>{try{return JSON.parse(localStorage.getItem(STORAGE))||seed}catch{return seed}});
 const [tab,setTab]=useState('map');
 const [selectedCity,setSelectedCity]=useState(null);
 const [selectedMarket,setSelectedMarket]=useState(null);
 const [modal,setModal]=useState(null);
 const [query,setQuery]=useState('');
 const [installPrompt,setInstallPrompt]=useState(null);
 const [toast,setToast]=useState('');
 const [online,setOnline]=useState(()=>navigator.onLine);
 useEffect(()=>localStorage.setItem(STORAGE,JSON.stringify(data)),[data]);
 useEffect(()=>{const h=e=>{e.preventDefault();setInstallPrompt(e)};window.addEventListener('beforeinstallprompt',h); if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{}); return()=>window.removeEventListener('beforeinstallprompt',h)},[]);
 useEffect(()=>{const on=()=>setOnline(true),off=()=>setOnline(false);window.addEventListener('online',on);window.addEventListener('offline',off);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)}},[]);
 const flash=t=>{setToast(t);setTimeout(()=>setToast(''),1800)};
 const marketsFiltered=useMemo(()=>data.markets.filter(m=>!query||`${m.name} ${m.city}`.toLowerCase().includes(query.toLowerCase())),[data.markets,query]);
 const cityGroups=useMemo(()=>Object.values(data.markets.reduce((a,m)=>{a[m.city]??={city:m.city,lat:m.lat,lng:m.lng,count:0};a[m.city].count++;return a},{})),[data.markets]);
 const ranking=useMemo(()=>data.markets.map(m=>({m,total:data.sales.filter(s=>s.marketId===m.id).reduce((a,s)=>a+Number(s.total||0),0)})).sort((a,b)=>b.total-a.total).slice(0,10),[data]);
 const today=new Date().toISOString().slice(0,10);
 const addMarket=form=>{const m={id:uid(),name:form.name,city:form.city,lat:Number(form.lat),lng:Number(form.lng),cnpj:form.cnpj||'',ie:form.ie||'',address:form.address||'',phone:form.phone||''};setData(d=>({...d,markets:[...d.markets,m]}));setModal(null);flash('Mercado salvo');};
 const addSale=(marketId,form)=>{setData(d=>({...d,sales:[...d.sales,{id:uid(),marketId,date:form.date,qty:Number(form.qty||0),total:Number(form.total||0),invoiceName:form.invoiceName||''}]}));setModal(null);flash('Venda registrada');};
 const markVisit=id=>{setData(d=>({...d,visits:{...d.visits,[id]:today}}));flash('Visita de hoje marcada');};
 const removeMarket=id=>{if(!confirm('Excluir este mercado e seu histórico?'))return;setData(d=>({...d,markets:d.markets.filter(m=>m.id!==id),sales:d.sales.filter(s=>s.marketId!==id)}));setSelectedMarket(null);setSelectedCity(null)};
 const currentMarket=data.markets.find(m=>m.id===selectedMarket);
 const currentSales=currentMarket?data.sales.filter(s=>s.marketId===currentMarket.id).sort((a,b)=>b.date.localeCompare(a.date)):[];
 const lastSale=currentSales[0];
 const cityMarkets=selectedCity?data.markets.filter(m=>m.city===selectedCity):[];
 const mapCenter=selectedCity&&cityMarkets[0]?[cityMarkets[0].lat,cityMarkets[0].lng]:[-24.7,-51.6];
 const copyFiscal=async m=>{const text=`${m.name}\nCNPJ: ${m.cnpj}\nInscrição Estadual: ${m.ie}\nEndereço: ${m.address}`;await navigator.clipboard.writeText(text);flash('Dados copiados');};
 const useMyLocation=(setterLat,setterLng)=>navigator.geolocation?.getCurrentPosition(p=>{setterLat(p.coords.latitude.toFixed(6));setterLng(p.coords.longitude.toFixed(6));},()=>flash('Não foi possível obter a localização'));

 if(currentMarket) return <MarketPage m={currentMarket} sales={currentSales} lastSale={lastSale} visited={data.visits[currentMarket.id]===today} onBack={()=>setSelectedMarket(null)} onSale={()=>setModal({type:'sale',market:currentMarket})} onVisit={()=>markVisit(currentMarket.id)} onCopy={()=>copyFiscal(currentMarket)} onDelete={()=>removeMarket(currentMarket.id)} onInvoice={()=>setModal({type:'invoice',market:currentMarket})} />;

 return <div className="app">
   <header><img src="./logo-d12.png"/><div><h1>Vendas D12</h1><small>Controle de vendas</small></div><span className={online?'net online':'net offline'}>{online?'Online':'Offline'}</span>{installPrompt&&<button className="install" onClick={async()=>{installPrompt.prompt();await installPrompt.userChoice;setInstallPrompt(null)}}>Instalar</button>}</header>
   {tab!=='map'&&<div className="search"><Search size={18}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar mercado ou cidade"/></div>}
   <main>
   {tab==='map' && <section className="map-screen">
      <div className="map-toolbar"><div><b>{selectedCity||'Paraná'}</b><small>{selectedCity?'Mercados da cidade':'Toque numa cidade para abrir'}</small></div>{selectedCity&&<button onClick={()=>setSelectedCity(null)}><ArrowLeft size={18}/> Paraná</button>}</div>
      <MapContainer center={mapCenter} zoom={selectedCity?13:7} className="map">
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
        <Fly center={mapCenter} zoom={selectedCity?13:7}/>
        {!selectedCity && cityGroups.map(c=><Marker key={c.city} position={[c.lat,c.lng]} icon={pin(false)} eventHandlers={{click:()=>setSelectedCity(c.city)}}><Popup><b>{c.city}</b><br/>{c.count} mercado(s)</Popup></Marker>)}
        {selectedCity && cityMarkets.map(m=><Marker key={m.id} position={[m.lat,m.lng]} icon={pin(data.visits[m.id]===today)} eventHandlers={{click:()=>setSelectedMarket(m.id)}}><Popup><b>{m.name}</b><br/>{data.visits[m.id]===today?'Visitado hoje':'Não visitado hoje'}</Popup></Marker>)}
      </MapContainer>
      {!data.markets.length&&<div className="empty-float"><Store/><b>Comece adicionando um mercado</b><span>Use o botão + abaixo.</span></div>}
   </section>}
   {tab==='clients' && <section className="panel"><h2>Clientes</h2>{marketsFiltered.length?marketsFiltered.map(m=>{const s=data.sales.filter(x=>x.marketId===m.id).sort((a,b)=>b.date.localeCompare(a.date))[0];return <button className="client-card" key={m.id} onClick={()=>setSelectedMarket(m.id)}><div className="avatar"><Store/></div><div><b>{m.name}</b><span>{m.city}</span><small className={daysSince(s?.date)>30?'late':'ok'}>{s?`Última venda: ${dateBR(s.date)}`:'Sem vendas'}</small></div><span>›</span></button>}):<Empty text="Nenhum cliente cadastrado"/>}</section>}
   {tab==='rank' && <section className="panel"><h2>Top 10 clientes</h2>{ranking.length?ranking.map((r,i)=><button className="rank-card" key={r.m.id} onClick={()=>setSelectedMarket(r.m.id)}><strong>{i+1}º</strong><div><b>{r.m.name}</b><span>{r.m.city}</span></div><b>{money(r.total)}</b></button>):<Empty text="Registre vendas para montar o ranking"/>}</section>}
   {tab==='notes' && <section className="panel"><h2>Notas fiscais</h2><p className="hint">As notas ficam vinculadas ao histórico de cada mercado.</p>{data.sales.filter(s=>s.invoiceName).sort((a,b)=>b.date.localeCompare(a.date)).map(s=>{const m=data.markets.find(x=>x.id===s.marketId);return <div className="invoice-row" key={s.id}><FileText/><div><b>{s.invoiceName}</b><span>{m?.name} • {dateBR(s.date)}</span></div></div>})}{!data.sales.some(s=>s.invoiceName)&&<Empty text="Nenhuma nota arquivada"/>}</section>}
   </main>
   <button className="fab" onClick={()=>setModal({type:'market'})}><Plus size={28}/></button>
   <nav><NavBtn icon={<MapPinned/>} label="Mapa" active={tab==='map'} onClick={()=>{setTab('map');setSelectedCity(null)}}/><NavBtn icon={<Store/>} label="Clientes" active={tab==='clients'} onClick={()=>setTab('clients')}/><NavBtn icon={<Trophy/>} label="Ranking" active={tab==='rank'} onClick={()=>setTab('rank')}/><NavBtn icon={<FileText/>} label="Notas" active={tab==='notes'} onClick={()=>setTab('notes')}/></nav>
   {modal?.type==='market'&&<MarketModal onClose={()=>setModal(null)} onSave={addMarket} onLocation={useMyLocation}/>} 
   {modal?.type==='sale'&&<SaleModal market={modal.market} onClose={()=>setModal(null)} onSave={f=>addSale(modal.market.id,f)}/>} 
   {modal?.type==='invoice'&&<InvoiceModal market={modal.market} onClose={()=>setModal(null)} sales={currentSales} onAttach={(saleId,name)=>{setData(d=>({...d,sales:d.sales.map(s=>s.id===saleId?{...s,invoiceName:name}:s)}));setModal(null);flash('Nota vinculada')}}/>}
   {toast&&<div className="toast">{toast}</div>}
 </div>
}

function MarketPage({m,sales,lastSale,visited,onBack,onSale,onVisit,onCopy,onDelete,onInvoice}){return <div className="app detail"><header><button className="iconbtn" onClick={onBack}><ArrowLeft/></button><div><h1>{m.name}</h1><small>{m.city}</small></div></header><main className="panel market-detail"><div className={`status ${daysSince(lastSale?.date)>30?'latebg':'okbg'}`}><div><small>Última venda</small><b>{lastSale?dateBR(lastSale.date):'Ainda não há vendas'}</b></div><div><small>Quantidade</small><b>{lastSale?lastSale.qty:'—'}</b></div></div><div className="action-grid"><button onClick={onSale}><Plus/>Nova venda</button><button onClick={onVisit}>{visited?<CheckCircle2/>:<Circle/>}{visited?'Visitado hoje':'Marcar visita'}</button><button onClick={onInvoice}><FileText/>Arquivar nota</button><button onClick={()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`,'_blank')}><Navigation/>Como chegar</button></div><section className="card"><div className="card-title"><h3>Dados para nota fiscal</h3><button onClick={onCopy}><Copy size={18}/> Copiar</button></div><Field k="CNPJ" v={m.cnpj}/><Field k="Inscrição Estadual" v={m.ie}/><Field k="Endereço" v={m.address}/><Field k="Telefone" v={m.phone}/></section><section className="card"><h3>Histórico de vendas</h3>{sales.length?sales.map(s=><div className="sale-row" key={s.id}><div><b>{dateBR(s.date)}</b><span>{s.qty} unidade(s){s.invoiceName?` • ${s.invoiceName}`:''}</span></div><strong>{money(s.total)}</strong></div>):<p className="hint">Nenhuma venda registrada.</p>}</section><button className="danger" onClick={onDelete}><Trash2 size={18}/> Excluir mercado</button></main></div>}
function Field({k,v}){return <div className="field"><span>{k}</span><b>{v||'—'}</b></div>}
function NavBtn({icon,label,active,onClick}){return <button className={active?'active':''} onClick={onClick}>{icon}<span>{label}</span></button>}
function Empty({text}){return <div className="empty"><Store/><p>{text}</p></div>}
function Modal({children,onClose,title}){return <div className="overlay"><div className="modal"><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X/></button></div>{children}</div></div>}
function MarketModal({onClose,onSave,onLocation}){const [f,setF]=useState({name:'',city:'',lat:'',lng:'',cnpj:'',ie:'',address:'',phone:''});const s=(k,v)=>setF(x=>({...x,[k]:v}));return <Modal title="Novo mercado" onClose={onClose}><div className="form"><input placeholder="Nome do mercado" value={f.name} onChange={e=>s('name',e.target.value)}/><input placeholder="Cidade" value={f.city} onChange={e=>s('city',e.target.value)}/><div className="two"><input placeholder="Latitude" value={f.lat} onChange={e=>s('lat',e.target.value)}/><input placeholder="Longitude" value={f.lng} onChange={e=>s('lng',e.target.value)}/></div><button className="secondary" onClick={()=>onLocation(v=>s('lat',v),v=>s('lng',v))}><Navigation/> Usar localização atual</button><input placeholder="CNPJ" value={f.cnpj} onChange={e=>s('cnpj',e.target.value)}/><input placeholder="Inscrição Estadual" value={f.ie} onChange={e=>s('ie',e.target.value)}/><input placeholder="Endereço completo" value={f.address} onChange={e=>s('address',e.target.value)}/><input placeholder="Telefone" value={f.phone} onChange={e=>s('phone',e.target.value)}/><button className="primary" disabled={!f.name||!f.city||!f.lat||!f.lng} onClick={()=>onSave(f)}>Salvar mercado</button></div></Modal>}
function SaleModal({market,onClose,onSave}){const [f,setF]=useState({date:new Date().toISOString().slice(0,10),qty:'',total:'',invoiceName:''});return <Modal title={`Nova venda • ${market.name}`} onClose={onClose}><div className="form"><label>Data<input type="date" value={f.date} onChange={e=>setF({...f,date:e.target.value})}/></label><input inputMode="numeric" placeholder="Quantidade vendida" value={f.qty} onChange={e=>setF({...f,qty:e.target.value})}/><input inputMode="decimal" placeholder="Valor total (R$)" value={f.total} onChange={e=>setF({...f,total:e.target.value.replace(',','.')})}/><input placeholder="Nome da nota fiscal (opcional)" value={f.invoiceName} onChange={e=>setF({...f,invoiceName:e.target.value})}/><button className="primary" onClick={()=>onSave(f)}>Registrar venda</button></div></Modal>}
function InvoiceModal({market,onClose,sales,onAttach}){const [saleId,setSaleId]=useState(sales[0]?.id||'');const [name,setName]=useState('');return <Modal title={`Arquivar nota • ${market.name}`} onClose={onClose}><div className="form"><select value={saleId} onChange={e=>setSaleId(e.target.value)}><option value="">Selecione a venda</option>{sales.map(s=><option key={s.id} value={s.id}>{dateBR(s.date)} — {money(s.total)}</option>)}</select><input placeholder="Nome/identificação da nota" value={name} onChange={e=>setName(e.target.value)}/><p className="hint">Nesta versão, o app guarda a identificação da nota no histórico. Para anexar o PDF diretamente no aparelho, a próxima etapa é ativar o armazenamento de arquivos.</p><button className="primary" disabled={!saleId||!name} onClick={()=>onAttach(saleId,name)}>Vincular nota</button></div></Modal>}
createRoot(document.getElementById('root')).render(<App/>);
