/* Network concept — vanilla JS map + roster (d3 + topojson) */
const CLINICS=[
{id:'md-vosm',type:'primary',name:'Dr. Debra Canapp',clinic:'VOSM — Veterinary Orthopedic & Sports Medicine Group',city:'Annapolis Junction',region:'Maryland',country:'USA',countryId:840,stateFips:24,lat:39.13,lng:-76.79,website:'https://www.thrivepetcare.com/locations/maryland/annapolis-junction/veterinary-orthopedic-sports-medicine-group',tag:'Primary practice',note:"Dr. Canapp's East-coast home base for diagnostic MSK ultrasound referrals.",spec:['MSK Ultrasound','Regenerative Med','Sports Med']},
{id:'ca-circleoak',type:'primary',name:'Dr. Debra Canapp',clinic:'Circle Oak Rehabilitation',city:'Petaluma',region:'California',country:'USA',countryId:840,stateFips:6,lat:38.23,lng:-122.63,website:'https://www.circleoakrehabilitation.com/',tag:'Primary practice',note:"Dr. Canapp's West-coast practice — by referral, for MSK ultrasound reads.",spec:['MSK Ultrasound','Rehab','Acupuncture']},
{id:'va-4strongpaws',type:'trained',name:'Dr. Stephanie Weddle, DVM',clinic:'4STRONG PAWS Mobile Veterinary Physical Rehabilitation',city:'Richmond · Central Virginia',region:'Virginia',country:'USA',countryId:840,stateFips:51,lat:37.54,lng:-77.43,website:'https://4strongpawsvetrehab.com/',tag:'Trained & Endorsed',note:'Completed the All-Inclusive Canine Diagnostic MSK Ultrasound Course with Dr. Canapp. Mobile rehabilitation across Greater Richmond and Central Virginia.',spec:['MSK Ultrasound','CCMT','PiezoWave','Mobile Rehab']},
{id:'va-paws',type:'trained',name:'Dr. Stephanie Patterson, DVM',clinic:'P.A.W.S. For Rehabilitation',city:'Virginia Beach',region:'Virginia',country:'USA',countryId:840,stateFips:51,lat:36.85,lng:-76.10,website:'https://pawsforrehab.com/',phone:'+1 (757) 472-8400',tag:'Trained & Endorsed',note:'Veterinary physical rehabilitation clinic serving the greater Hampton Roads area. Diagnostic ultrasound, PRP, acupuncture, hydrotherapy.',spec:['MSK Ultrasound','PRP','Acupuncture','Rehab']},
{id:'fl-mocean',type:'trained',name:'Dr. Kristal Turner, DVM',clinic:'mOcean mobility + wellness for animals',city:'Jacksonville Beach',region:'Florida',country:'USA',countryId:840,stateFips:12,lat:30.29,lng:-81.39,website:'https://www.moceanvet.com/',phone:'+1 (904) 241-8869',tag:'Trained & Endorsed',note:'Integrative mobility and wellness practice combining MSK ultrasound diagnostics with rehabilitation, regenerative therapy and TCVM.',spec:['MSK Ultrasound','Acupuncture','Shockwave','TCVM']},
{id:'wa-sunsethill',type:'trained',name:'Dr. Alycia Lamb, DVM',clinic:'Sunset Hill Veterinary & Rehabilitation Center',city:'Seattle',region:'Washington',country:'USA',countryId:840,stateFips:53,lat:47.69,lng:-122.37,website:'https://sunsethillvet.com/',phone:'+1 (206) 706-7800',tag:'Trained & Endorsed',note:"Seattle's first veterinary rehabilitation specialist practice. Dr. Lamb trained under Drs. Sherman and Deb Canapp in advanced MSK ultrasound and needle arthroscopy.",spec:['MSK Ultrasound','Needle Arthroscopy','Regenerative Medicine','PRP']},
{id:'az-thrive',type:'trained',name:'Dr. Nicole Chun, DVM',clinic:'Thrive Pet Healthcare Specialists North Scottsdale (AMSC)',city:'Scottsdale',region:'Arizona',country:'USA',countryId:840,stateFips:4,lat:33.69,lng:-111.92,website:'https://www.thrivepetcare.com/locations/arizona/scottsdale/animal-medical-and-surgical-center/tphs-north-scottsdale-emergency-care',phone:'+1 (480) 502-4400',tag:'Trained & Endorsed',note:'AAHA-accredited 24/7 referral and specialty hospital with a Sports Medicine and Rehabilitation team serving the greater Phoenix area.',spec:['MSK Ultrasound','Sports Med','Surgery','Neurology']},
{id:'sc-libertyhighway',type:'trained',name:'Dr. Britt Carr Benson, DVM',clinic:'The Animal Hospital at Liberty Highway',city:'Anderson',region:'South Carolina',country:'USA',countryId:840,stateFips:45,lat:34.50,lng:-82.66,website:'https://www.libertyhighwayvet.com/sports-medicine-rehab',phone:'+1 (864) 226-0025',tag:'Trained & Endorsed',note:'Diplomate of ACVSMR leading the Canine Sports Medicine and Rehabilitation Center at Liberty Highway. Focused on working and performance dog diagnostics and return-to-sport.',spec:['MSK Ultrasound','Regenerative Med','Working Dogs','Sports Med']},
{id:'fi-avec',type:'trained',name:'Dr. Tiiu Toijala',clinic:'AVEC Eläinklinikka',city:'Helsinki',region:'Uusimaa',country:'Finland',countryId:246,lat:60.17,lng:24.94,website:'https://avec.vet/henkilokunta/elainlaakarit/tiiu-toijala',tag:'Trained & Endorsed',note:'Trained by Dr. Canapp in canine diagnostic musculoskeletal ultrasound. Practicing at the AVEC veterinary group in Finland — the first international clinician on the network.',spec:['MSK Ultrasound','Small Animal']},
{id:'au-vicvet',type:'trained',name:'Dr. Malcolm Ware',clinic:'VicVet',city:'Victoria',region:'Victoria',country:'Australia',countryId:36,lat:-37.86,lng:145.06,website:'https://vicvet.au/rehabilitation-centre/',tag:'Trained & Endorsed',note:'Trained by Dr. Canapp in diagnostic MSK ultrasound. Leads the rehabilitation centre at Vic Vet in Victoria, Australia.',spec:['MSK Ultrasound','Rehabilitation']},
{id:'ca-vca',type:'trained',name:'Dr. Joanne Fagnou',clinic:'404 Veterinary Emergency and Referral Hospital (VCA Canada)',city:'Newmarket',region:'Ontario',country:'Canada',countryId:124,lat:44.06,lng:-79.46,website:'https://vcacanada.com/404emerg',tag:'Trained & Endorsed',note:'Trained by Dr. Canapp in diagnostic MSK ultrasound. Practicing within the VCA Canada network.',spec:['MSK Ultrasound']},
{id:'ca-trilake',type:'trained',name:'Dr. Tara Edwards',clinic:'Trilake Animal Hospital (VCA Canada)',city:'Sherwood Park',region:'Alberta',country:'Canada',countryId:124,lat:53.54,lng:-113.30,website:'https://vcacanada.com/trilake/primary/team/tara-edwards',tag:'Trained & Endorsed',note:'Trained by Dr. Canapp in diagnostic MSK ultrasound and eligible to submit cases for remote-read interpretation.',spec:['MSK Ultrasound']},
{id:'ca-pointseastwest',type:'trained',name:'Dr. David Lane, DVM, DACVSMR',clinic:'Points East West Veterinary Services',city:'Squamish',region:'British Columbia',country:'Canada',countryId:124,lat:49.70,lng:-123.16,website:'https://www.pointseastwest.com/',tag:'Trained & Endorsed',note:'Diplomate of the ACVSMR running a dedicated sports-medicine and rehabilitation practice in Squamish, BC. Certified in canine diagnostic MSK ultrasound and qualified to submit remote reads to Dr. Canapp.',spec:['MSK Ultrasound','Sports Medicine','Rehab','Remote Reads']},
{id:'us-animalia',type:'graduate',name:'Dr. Carly Hubbard',clinic:'Animalia Wellness',city:'Franklin',region:'Tennessee',country:'USA',countryId:840,stateFips:47,lat:35.92,lng:-86.87,website:'https://www.animaliawellness.com/',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp and performs the modality in independent practice. Remote-read pathway not yet established.',spec:['MSK Ultrasound']},
{id:'az-aawc',type:'graduate',name:'Dr. Diane Paster',clinic:'Arizona Animal Wellness Center',city:'Scottsdale',region:'Arizona',country:'USA',countryId:840,stateFips:4,lat:33.49,lng:-111.93,website:'https://www.arizonaanimalwellnesscenter.com/',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp. Practicing MSK ultrasound independently at Arizona Animal Wellness Center.',spec:['MSK Ultrasound','Integrative Med']},
{id:'uk-summerhill',type:'graduate',name:'Dr. Jane Feneley',clinic:'Summerhill Vets Fakenham (IVC Evidensia)',city:'Fakenham',region:'Norfolk · England',country:'United Kingdom',countryId:826,lat:52.83,lng:0.85,website:'https://ivc.co.uk/find-a-vet/summerhill-vets-fakenham',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp. Practicing the modality at Summerhill Vets in Norfolk.',spec:['MSK Ultrasound']},
{id:'us-arcata',type:'graduate',name:'Dr. Joy Fox-Beaudet',clinic:'Arcata Veterinary Hospital',city:'Arcata',region:'California',country:'USA',countryId:840,stateFips:6,lat:40.87,lng:-124.08,website:'https://arcatavet.com/',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp. Practicing MSK ultrasound independently at Arcata Veterinary Hospital on the North Coast of California.',spec:['MSK Ultrasound']},
{id:'xx-acerlux',type:'graduate',name:'Dr. Chris Lee',clinic:'Acerlux',city:'Southern California',region:'California',country:'USA',countryId:840,stateFips:6,lat:32.72,lng:-117.16,website:'https://acerlux.com/',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp. Practicing in Southern California.',spec:['MSK Ultrasound']},
{id:'uk-eden',type:'graduate',name:'Dr. Georgina Timms',clinic:'Eden Vets',city:'Penrith',region:'Cumbria · England',country:'United Kingdom',countryId:826,lat:54.66,lng:-2.75,website:'https://eden-vets.co.uk/',tag:'Course Graduate',note:'Completed the All-Inclusive Canine MSK Ultrasound course with Dr. Canapp. Practicing MSK ultrasound at Eden Vets in the Eden Valley.',spec:['MSK Ultrasound']}
];
const COUNTRY_IDS=new Set(CLINICS.map(c=>c.countryId));
const STATE_FIPS=new Set(CLINICS.filter(c=>c.stateFips).map(c=>c.stateFips));
const PRIMARY_FIPS=new Set(CLINICS.filter(c=>c.type==='primary').map(c=>c.stateFips));
let selected=CLINICS[2],view='world',usData=null,worldData=null,filter='all';
const wrap=document.getElementById('mapwrap');

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');}

function renderDetail(){
  const c=selected,i=CLINICS.indexOf(c)+1;
  document.getElementById('detail').innerHTML=
  '<div class="in">'+
  '<div class="num">'+String(i).padStart(2,'0')+'</div>'+
  '<div><div class="eb">'+esc(c.tag)+'</div>'+
  '<div class="nm">'+(c.website?'<a href="'+c.website+'" target="_blank" rel="noreferrer">'+esc(c.name)+'</a>':esc(c.name))+'</div>'+
  '<div class="cl">'+(c.website?'<a href="'+c.website+'" target="_blank" rel="noreferrer">'+esc(c.clinic)+' ↗</a>':esc(c.clinic))+'</div>'+
  '<div class="note">'+esc(c.note)+'</div></div>'+
  '<div><div class="eb">Location</div><div class="loc">'+esc(c.city)+'<br>'+esc(c.region)+' · '+esc(c.country)+'</div>'+
  '<div class="spec">'+c.spec.map(s=>'<span>'+esc(s)+'</span>').join('')+'</div></div>'+
  '<div class="site"><div class="eb">Contact</div>'+(c.website?'<a href="'+c.website+'" target="_blank" rel="noreferrer">Visit site →</a>':'')+(c.phone?'<div class="phone">'+c.phone+'</div>':'')+'</div>'+
  '</div>';
}

function renderRoster(){
  const list=CLINICS.filter(c=>filter==='all'||c.type===filter);
  document.getElementById('roster').innerHTML=list.length?list.map(c=>{
    const i=CLINICS.indexOf(c)+1;
    return '<div class="crow '+c.type+(selected.id===c.id?' active':'')+'" data-id="'+c.id+'">'+
    '<span class="n">№ '+String(i).padStart(2,'0')+'</span>'+
    '<span><span class="nm">'+esc(c.name)+'</span><span class="cl" style="display:block;">'+(c.website?'<a href="'+c.website+'" target="_blank" rel="noreferrer">'+esc(c.clinic)+' ↗</a>':esc(c.clinic))+'</span></span>'+
    '<span class="loc">'+esc(c.city)+', '+esc(c.region)+'</span>'+
    '<span class="co">'+esc(c.country)+'</span>'+
    '<span class="tag">'+esc(c.tag)+'</span></div>';
  }).join(''):'<div style="padding:48px 0;text-align:center;color:var(--ink-3);font-style:italic;font-family:var(--serif);font-size:22px;">No clinicians match this filter — yet.</div>';
}

function renderChips(){
  const defs=[['all','All'],['primary','Where Dr. Canapp practices'],['trained','Trained & endorsed'],['graduate','Course graduates']];
  document.getElementById('chips').innerHTML=defs.map(([k,l])=>'<button class="chip'+(filter===k?' active':'')+'" data-f="'+k+'">'+l+'</button>').join('');
}

let tipEl=null;
/* ===== ORIGINAL MAP — ported from network.jsx: tinted regions, graticule,
   pulsing primary markers, hover tooltip, click fly-to zoom + back button ===== */
let focusedId=null;
const cam={tx:0,ty:0,k:1};
let animTimer=null,curProj=null,curSize={w:1200,h:600};
function mapH(W){const ratio=view==='world'?0.5:0.58;return Math.min(720,Math.max(440,W*ratio));}
function renderMap(){
  const data=view==='us'?usData:worldData;
  if(!data)return;
  const W=wrap.clientWidth||1200,H=mapH(W);
  curSize={w:W,h:H};
  wrap.style.height=H+'px';
  const clinics=(view==='us'?CLINICS.filter(c=>c.country==='USA'):CLINICS).slice().sort((a,b)=>({trained:0,graduate:1,primary:2}[a.type]-{trained:0,graduate:1,primary:2}[b.type]));
  let features,proj,borders=null;
  if(view==='us'){
    features=topojson.feature(data,data.objects.states).features;
    borders=topojson.mesh(data,data.objects.states,(a,b)=>a!==b);
    proj=d3.geoAlbersUsa().scale(W*1.18).translate([W/2,H/2]);
  }else{
    features=topojson.feature(data,data.objects.countries).features;
    proj=d3.geoNaturalEarth1().scale(W/6.0).translate([W/2,H/2+14]);
  }
  curProj=proj;
  const path=d3.geoPath(proj);
  let inner='';
  if(view==='world'){
    const grat=d3.geoGraticule().step([20,20])();
    inner+='<path d="'+(path(grat)||'')+'" fill="none" stroke="rgba(24,33,28,0.06)" stroke-width="0.6"></path>';
  }
  inner+='<g>'+features.map(f=>{
    const id=+f.id;
    const hasClinic=view==='us'?STATE_FIPS.has(id):COUNTRY_IDS.has(id);
    const isPrimary=view==='us'?PRIMARY_FIPS.has(id):false;
    return '<path class="country-path'+(hasClinic?' has-clinic':'')+(isPrimary?' is-primary':'')+'" d="'+(path(f)||'')+'"></path>';
  }).join('')+'</g>';
  if(borders)inner+='<path d="'+(path(borders)||'')+'" fill="none" stroke="rgba(24,33,28,0.45)" stroke-width="0.7"></path>';
  inner+='<g>'+clinics.map(c=>{
    const pt=proj([c.lng,c.lat]);if(!pt)return '';
    const rr=c.type==='primary'?18:c.type==='graduate'?10:12;
    const rd=c.type==='primary'?9.5:c.type==='graduate'?4.5:5.5;
    return '<g class="marker '+c.type+(selected.id===c.id?' selected':'')+(focusedId===c.id?' focused':'')+'" data-id="'+c.id+'" transform="translate('+pt[0]+','+pt[1]+')">'+
    (c.type==='primary'?'<circle cx="0" cy="0" r="8" class="marker-pulse"></circle>':'')+
    '<circle cx="0" cy="0" r="'+rr+'" class="marker-ring"></circle>'+
    '<circle cx="0" cy="0" r="'+rd+'" class="marker-dot"></circle>'+
    '<circle cx="0" cy="0" r="14" class="marker-hit"></circle></g>';
  }).join('')+'</g>';
  wrap.innerHTML='<svg class="map-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet"><g class="map-zoom" id="mapzoom">'+inner+'</g></svg>'+
  '<div style="position:absolute;bottom:16px;right:20px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--ink-3);font-weight:500;pointer-events:none;">'+(view==='us'?'Albers USA':'Natural Earth')+' projection</div>';
  document.getElementById('mapstat').textContent='View — '+(view==='world'
    ?CLINICS.length+' clinicians · '+new Set(CLINICS.map(c=>c.country)).size+' countries'
    :clinics.length+' US clinicians · '+new Set(clinics.map(c=>c.stateFips)).size+' states');
  cam.tx=0;cam.ty=0;cam.k=1;
  wrap.querySelectorAll('.marker').forEach(g=>{
    const c=CLINICS.find(x=>x.id===g.dataset.id);
    g.addEventListener('click',e=>{e.stopPropagation();selected=c;focusedId=c.id;renderDetail();renderRoster();updateZoom();markSel();});
    g.addEventListener('mouseenter',e=>showTip(e,c));
    g.addEventListener('mousemove',moveTip);
    g.addEventListener('mouseleave',hideTip);
  });
  wrap.addEventListener('click',e=>{if(e.target.tagName==='svg'||e.target===wrap||e.target.classList.contains('country-path'))clearFocus();});
  if(focusedId)updateZoom(true);
}
function markSel(){
  wrap.querySelectorAll('.marker').forEach(g=>{
    g.classList.toggle('selected',g.dataset.id===selected.id);
    g.classList.toggle('focused',g.dataset.id===focusedId);
  });
}
function clearFocus(){focusedId=null;updateZoom();markSel();}
function updateZoom(instant){
  const zoomG=document.getElementById('mapzoom');if(!zoomG)return;
  const c=focusedId?CLINICS.find(x=>x.id===focusedId):null;
  const pt=c&&curProj?curProj([c.lng,c.lat]):null;
  const K=c&&c.type==='primary'?3.2:4.0;
  const toTx=pt?curSize.w/2-K*pt[0]:0;
  const toTy=pt?curSize.h/2-K*pt[1]:0;
  const toK=pt?K:1;
  zoomG.classList.toggle('is-zoomed',!!pt);
  let btn=wrap.querySelector('.map-close-zoom');
  if(pt&&!btn){btn=document.createElement('button');btn.className='map-close-zoom';btn.innerHTML='<span aria-hidden="true">←</span> Back to map';btn.addEventListener('click',clearFocus);wrap.appendChild(btn);}
  if(!pt&&btn)btn.remove();
  if(animTimer){clearTimeout(animTimer);animTimer=null;}
  const from={...cam};
  if(instant){cam.tx=toTx;cam.ty=toTy;cam.k=toK;zoomG.setAttribute('transform','translate('+toTx+','+toTy+') scale('+toK+')');return;}
  const DUR=850,start=performance.now();
  const ease=t=>1-Math.pow(1-t,5);
  (function step(){
    const t=Math.min(1,(performance.now()-start)/DUR),e=ease(t);
    cam.tx=from.tx+(toTx-from.tx)*e;cam.ty=from.ty+(toTy-from.ty)*e;cam.k=from.k+(toK-from.k)*e;
    zoomG.setAttribute('transform','translate('+cam.tx+','+cam.ty+') scale('+cam.k+')');
    if(t<1)animTimer=setTimeout(step,16);else animTimer=null;
  })();
}
function showTip(e,c){
  hideTip();
  tipEl=document.createElement('div');tipEl.className='map-tip';
  tipEl.innerHTML='<div class="tip-name">'+esc(c.name)+'</div><div style="opacity:0.85;font-size:13px;margin-bottom:8px;">'+esc(c.clinic)+'</div><div class="tip-loc">'+esc(c.city)+' · '+esc(c.region)+' · '+esc(c.country)+'</div>'+
  '<div style="margin-top:10px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:var(--clay);">'+esc(c.tag)+'</div>'+
  '<div style="margin-top:8px;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(244,239,229,0.55);">Click to zoom in</div>';
  wrap.appendChild(tipEl);moveTip(e);
}
function moveTip(e){
  if(!tipEl)return;
  const r=wrap.getBoundingClientRect();
  tipEl.style.left=(e.clientX-r.left)+'px';
  tipEl.style.top=(e.clientY-r.top)+'px';
}
function hideTip(){if(tipEl){tipEl.remove();tipEl=null;}}

function renderAll(){renderDetail();renderRoster();renderMap();}

document.querySelectorAll('.map-tab').forEach(b=>b.addEventListener('click',()=>{
  view=b.dataset.view;focusedId=null;
  document.querySelectorAll('.map-tab').forEach(x=>x.setAttribute('data-active',x===b?'true':'false'));
  renderMap();
}));
document.getElementById('chips').addEventListener('click',e=>{
  const b=e.target.closest('.chip');if(!b)return;filter=b.dataset.f;renderChips();renderRoster();
});
document.getElementById('roster').addEventListener('click',e=>{
  if(e.target.closest('a'))return;
  const row=e.target.closest('.crow');if(!row)return;
  selected=CLINICS.find(c=>c.id===row.dataset.id);
  if(selected.country!=='USA'&&view==='us'){view='world';document.querySelectorAll('.map-tab').forEach(x=>x.setAttribute('data-active',x.dataset.view==='world'?'true':'false'));renderMap();}
  focusedId=selected.id;
  renderDetail();renderRoster();markSel();updateZoom();
});
addEventListener('resize',()=>renderMap());

renderChips();renderDetail();renderRoster();
fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r=>r.json()).then(d=>{worldData=d;if(view==='world')renderMap();});
fetch('https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json').then(r=>r.json()).then(d=>{usData=d;if(view==='us')renderMap();});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}}),{threshold:0.15});
document.querySelectorAll('.lines,.fx').forEach(el=>io.observe(el));
