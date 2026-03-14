// ══ CONSTANTES ════════════════════════════════════════════════
const DAYS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DAYNAMES=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const FESTIVOS_FIJOS={
  '2025-01-01':'Año Nuevo','2025-01-06':'Reyes Magos','2025-03-04':'Carnaval (Granollers)',
  '2025-04-17':'Jueves Santo','2025-04-18':'Viernes Santo','2025-04-21':'Lunes de Pascua',
  '2025-05-01':'Día del Trabajo','2025-06-24':'Sant Joan','2025-08-15':'Asunción de la Virgen',
  '2025-09-11':'Diada Nacional de Catalunya','2025-09-24':'La Mercè (Granollers)',
  '2025-10-12':'Fiesta Nacional de España','2025-11-01':'Todos los Santos',
  '2025-12-06':'Día de la Constitución','2025-12-08':'Inmaculada Concepción',
  '2025-12-25':'Navidad','2025-12-26':'Sant Esteve',
  '2026-01-01':'Año Nuevo','2026-01-06':'Reyes Magos','2026-02-17':'Carnaval (Granollers)',
  '2026-04-02':'Jueves Santo','2026-04-03':'Viernes Santo','2026-04-06':'Lunes de Pascua',
  '2026-05-01':'Día del Trabajo','2026-06-24':'Sant Joan','2026-08-15':'Asunción de la Virgen',
  '2026-09-11':'Diada Nacional de Catalunya','2026-09-24':'La Mercè (Granollers)',
  '2026-10-12':'Fiesta Nacional de España','2026-11-01':'Todos los Santos',
  '2026-12-06':'Día de la Constitución','2026-12-08':'Inmaculada Concepción',
  '2026-12-25':'Navidad','2026-12-26':'Sant Esteve'
};

// ══ ESTADO ════════════════════════════════════════════════════
let sb=null, currentUser=null, currentRol=null;
let workers=[], bajas=[], vacaciones=[], customFestivos=[], usuarios=[];
let weekOffset=0, calYear=new Date().getFullYear(), calMonth=new Date().getMonth();
let deferredInstall=null;

// ══ PWA ═══════════════════════════════════════════════════════
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
window.addEventListener('beforeinstallprompt', e=>{
  e.preventDefault(); deferredInstall=e;
  document.getElementById('installBanner').style.display='flex';
});
function installPWA(){
  if(!deferredInstall) return;
  deferredInstall.prompt();
  deferredInstall.userChoice.then(()=>{ deferredInstall=null; document.getElementById('installBanner').style.display='none'; });
}

// ══ PANTALLAS ════════════════════════════════════════════════
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById(id).classList.add('active');if(id==='scFichaje'){startFichClock();pinClear();}}

// ══ CONFIG ════════════════════════════════════════════════════
async function saveConfig(){
  const url=document.getElementById('cfgUrl').value.trim();
  const key=document.getElementById('cfgKey').value.trim();
  const al=document.getElementById('cfgAlert');
  if(!url||!key){al.innerHTML='<div class="alert alert-w">Introduce URL y Key.</div>';return;}
  setLoad('cfgSpin',null,true);
  try{
    sb=window.supabase.createClient(url,key);
    await sb.from('trabajadores').select('id').limit(1);
    localStorage.setItem('sb_url',url);localStorage.setItem('sb_key',key);
    showScreen('scLogin');
  }catch(e){al.innerHTML=`<div class="alert alert-e">Error: ${e.message||e}</div>`;}
  setLoad('cfgSpin',null,false);
}

// ══ AUTH ══════════════════════════════════════════════════════
function switchLTab(t){
  document.getElementById('loginForm').style.display=t==='login'?'block':'none';
  document.getElementById('registerForm').style.display=t==='register'?'block':'none';
  document.querySelectorAll('.ltab').forEach((b,i)=>b.classList.toggle('active',(i===0&&t==='login')||(i===1&&t==='register')));
}
async function doLogin(){
  const email=document.getElementById('lEmail').value.trim(), pass=document.getElementById('lPass').value;
  const al=document.getElementById('lAlert');
  if(!email||!pass){al.innerHTML='<div class="alert alert-w">Rellena los campos.</div>';return;}
  setLoad('lSpin',null,true);
  const{data,error}=await sb.auth.signInWithPassword({email,password:pass});
  setLoad('lSpin',null,false);
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  await onLogin(data.user);
}
async function doRegister(){
  const nombre=document.getElementById('rNombre').value.trim();
  const email=document.getElementById('rEmail').value.trim();
  const pass=document.getElementById('rPass').value;
  const al=document.getElementById('rAlert');
  if(!nombre||!email||!pass){al.innerHTML='<div class="alert alert-w">Rellena todos los campos.</div>';return;}
  if(pass.length<6){al.innerHTML='<div class="alert alert-w">Contraseña mín. 6 caracteres.</div>';return;}
  setLoad('rSpin',null,true);
  const{error}=await sb.auth.signUp({email,password:pass,options:{data:{nombre}}});
  setLoad('rSpin',null,false);
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  al.innerHTML='<div class="alert alert-s">Cuenta creada. Inicia sesión.</div>';
}
async function forgotPwd(){
  const email=document.getElementById('lEmail').value.trim();
  if(!email){document.getElementById('lAlert').innerHTML='<div class="alert alert-w">Introduce tu email.</div>';return;}
  await sb.auth.resetPasswordForEmail(email);
  document.getElementById('lAlert').innerHTML='<div class="alert alert-s">Email enviado.</div>';
}
async function doLogout(){
  await sb.auth.signOut();
  currentUser=null;currentRol=null;workers=[];bajas=[];vacaciones=[];customFestivos=[];usuarios=[];
  showScreen('scLogin');
}
async function onLogin(user){
  currentUser=user;
  const{data}=await sb.from('usuarios').select('*').eq('id',user.id).single();
  currentRol=data?.rol||'supervisor';
  applyRoleUI();
  await loadAll();
  showScreen('scApp');
}
function isAdmin(){return currentRol==='admin';}

function applyRoleUI(){
  const name=currentUser.user_metadata?.nombre||currentUser.email;
  document.getElementById('topUser').textContent=name;
  const rb=document.getElementById('topRole');
  rb.textContent=isAdmin()?'Administrador':'Supervisor';
  rb.className='role-badge '+(isAdmin()?'role-admin':'role-super');
  document.getElementById('tabUsuarios').style.display=isAdmin()?'':'none';
  document.getElementById('tabAudit').style.display=isAdmin()?'':'none';
  document.getElementById('tabFichajes').style.display=isAdmin()?'':'none';
  document.getElementById('addWorkerCard').style.display=isAdmin()?'block':'none';
  document.getElementById('addVacCard').style.display=isAdmin()?'block':'none';
}

// ══ CARGA ═════════════════════════════════════════════════════
async function loadAll(){
  const p=[
    sb.from('trabajadores').select('*').order('creado_en'),
    sb.from('bajas').select('*').order('baja_inicio'),
    sb.from('vacaciones').select('*').order('vacaciones_inicio'),
    sb.from('festivos').select('*').order('fecha')
  ];
  if(isAdmin()) p.push(sb.from('usuarios').select('*').order('creado_en'));
  const r=await Promise.all(p);
  workers=r[0].data||[]; bajas=r[1].data||[]; vacaciones=r[2].data||[]; customFestivos=r[3].data||[];
  if(isAdmin()) usuarios=r[4]?.data||[];
  renderWorkers(); renderFestivos(); renderSchedule();
  renderCalendar(); renderVacaciones(); renderSummary();
  updateAllSelects(); populateSumMonth();
  if(isAdmin()){renderUsuarios();loadAudit();loadFichajes();}
}

// ══ HELPERS ═══════════════════════════════════════════════════
function isoDate(d){return d.toISOString().split('T')[0];}
function parseDate(s){if(!s)return null;const[y,m,d]=s.split('-').map(Number);const dt=new Date(y,m-1,d);dt.setHours(0,0,0,0);return dt;}
function fmtDate(d){return d.toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit'});}
function fmtFull(s){if(!s)return '—';const p=s.split('-');return`${p[2]}/${p[1]}/${p[0]}`;}
function initials(n){return n.split(' ').slice(0,2).map(w=>w[0]||'').join('').toUpperCase();}
function setLoad(sid,bid,on){const s=document.getElementById(sid);if(s)s.style.display=on?'flex':'none';if(bid){const b=document.getElementById(bid);if(b)b.disabled=on;}}
function allFestivos(){const f={...FESTIVOS_FIJOS};customFestivos.forEach(c=>{f[c.fecha]=c.descripcion;});return f;}
function isFestivo(ds){return !!allFestivos()[ds];}

function workerBajas(wid){return bajas.filter(b=>b.trabajador_id===wid).sort((a,b)=>a.baja_inicio.localeCompare(b.baja_inicio));}
function workerVacs(wid){return vacaciones.filter(v=>v.trabajador_id===wid).sort((a,b)=>a.vacaciones_inicio.localeCompare(b.vacaciones_inicio));}

function isOnBaja(w,date){
  const ds=isoDate(date);
  return workerBajas(w.id).some(b=>ds>=b.baja_inicio&&(!b.baja_fin||ds<=b.baja_fin));
}
function isOnVac(w,date){
  const ds=isoDate(date);
  return workerVacs(w.id).some(v=>ds>=v.vacaciones_inicio&&ds<=v.vacaciones_fin);
}
function workerStatus(w,date){
  const d=new Date(date);d.setHours(0,0,0,0);
  const s=parseDate(w.inicio),e=parseDate(w.fin);
  if(s&&d<s)return'pending';
  if(e&&d>e)return'inactivo';
  if(isOnBaja(w,d))return'baja';
  if(isOnVac(w,d))return'vac';
  return'activo';
}
function getDayStatus(w,date){
  const dow=date.getDay(),ds=isoDate(date);
  if(dow===0)return{type:'sunday'};
  if(dow===parseInt(w.dia_libre))return{type:'libre'};
  if(isFestivo(ds))return{type:'festivo',name:allFestivos()[ds]};
  const ws=workerStatus(w,date);
  if(ws==='pending'||ws==='inactivo')return{type:'inactive'};
  if(ws==='baja')return{type:'baja'};
  if(ws==='vac')return{type:'vac'};
  return{type:'work'};
}
function getWeekDates(off){
  const now=new Date(),day=now.getDay();
  const mon=new Date(now);
  mon.setDate(now.getDate()-(day===0?6:day-1)+off*7);mon.setHours(0,0,0,0);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function daysBetween(a,b){return Math.round((parseDate(b)-parseDate(a))/(1000*60*60*24))+1;}
function countWorkDays(w,dates){
  let wH=0,fest=0,baja=0,vac=0,libres=0;
  dates.forEach(d=>{
    const st=getDayStatus(w,d);
    if(st.type==='work')wH+=Math.round(w.horas/5*100)/100;
    if(st.type==='festivo')fest++;
    if(st.type==='baja')baja++;
    if(st.type==='vac')vac++;
    if(st.type==='libre')libres++;
  });
  return{wH:Math.round(wH*10)/10,fest,baja,vac,libres};
}

// ══ SELECTS UPDATE ════════════════════════════════════════════
function updateAllSelects(){
  const opts='<option value="all">Todos</option>'+workers.map(w=>`<option value="${w.id}">${w.nombre}</option>`).join('');
  ['sumWorker','calWorker','vacResWorker'].forEach(id=>{const el=document.getElementById(id);if(el){const v=el.value;el.innerHTML=opts;el.value=v||'all';}});
  const vacSel=document.getElementById('vacWorker');
  if(vacSel) vacSel.innerHTML=workers.map(w=>`<option value="${w.id}">${w.nombre}</option>`).join('');
  updateHistWorkerSelect();
}
function updateHistWorkerSelect(){
  const sel = document.getElementById('histWorker');
  if(!sel) return;
  const cur = sel.value || 'all';
  sel.innerHTML = '<option value="all">Todos los trabajadores</option>' +
    workers.map(w=>'<option value="'+w.id+'"'+(String(cur)===String(w.id)?' selected':'')+'>'+w.nombre+'</option>').join('');
}
function populateSumMonth(){
  const sel=document.getElementById('sumMonth');if(!sel)return;
  const cur=sel.value||String(new Date().getMonth());
  sel.innerHTML=MONTHS.map((m,i)=>`<option value="${i}"${parseInt(cur)===i?' selected':''}>${m}</option>`).join('');
}

// ══ TRABAJADORES ══════════════════════════════════════════════
async function addWorker(){
  if(!isAdmin())return;
  const name=document.getElementById('wName').value.trim();
  const hours=parseFloat(document.getElementById('wHours').value);
  const shift=document.getElementById('wShift').value;
  const start=document.getElementById('wStart').value||null;
  const end=document.getElementById('wEnd').value||null;
  const dEl=document.querySelector('input[name="dayoff"]:checked');
  const al=document.getElementById('wAlert');
  if(!name){al.innerHTML='<div class="alert alert-w">Introduce el nombre.</div>';return;}
  if(!hours||hours<1){al.innerHTML='<div class="alert alert-w">Indica las horas semanales.</div>';return;}
  if(!dEl){al.innerHTML='<div class="alert alert-w">Selecciona el día libre.</div>';return;}
  al.innerHTML='';setLoad('wSpin','btnAddWorker',true);
  const{data,error}=await sb.from('trabajadores').insert({nombre:name,horas:hours,turno:shift,dia_libre:parseInt(dEl.value),inicio:start,fin:end}).select().single();
  setLoad('wSpin','btnAddWorker',false);
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  workers.push(data);
  al.innerHTML='<div class="alert alert-s">Guardado.</div>';setTimeout(()=>al.innerHTML='',3000);
  document.getElementById('wName').value='';document.querySelectorAll('input[name="dayoff"]').forEach(r=>r.checked=false);
  renderWorkers();updateAllSelects();
}
async function saveWorker(id){
  if(!isAdmin()) return;
  const name  = document.getElementById('ed-name-'+id)?.value.trim();
  const hours = parseFloat(document.getElementById('ed-hours-'+id)?.value);
  const shift = document.getElementById('ed-shift-'+id)?.value;
  const start = document.getElementById('ed-start-'+id)?.value || null;
  const end   = document.getElementById('ed-end-'+id)?.value || null;
  const dayEl = document.querySelector('input[name="ed-dayoff-'+id+'"]:checked');
  const al    = document.getElementById('ed-alert-'+id);
  if(!name){ al.innerHTML='<div class="alert alert-w">Introduce el nombre.</div>'; return; }
  if(!hours||hours<1){ al.innerHTML='<div class="alert alert-w">Indica las horas semanales.</div>'; return; }
  if(!dayEl){ al.innerHTML='<div class="alert alert-w">Selecciona el día libre.</div>'; return; }
  al.innerHTML='';
  const {data,error} = await sb.from('trabajadores').update({
    nombre: name, horas: hours, turno: shift,
    dia_libre: parseInt(dayEl.value), inicio: start, fin: end
  }).eq('id', id).select().single();
  if(error){ al.innerHTML='<div class="alert alert-e">'+error.message+'</div>'; return; }
  const i = workers.findIndex(w=>w.id===id);
  if(i>=0) workers[i] = data;
  al.innerHTML='<div class="alert alert-s">Guardado correctamente.</div>';
  setTimeout(()=>{ renderWorkers(); renderSchedule(); renderCalendar(); updateAllSelects();
    setTimeout(()=>{ document.getElementById('wd-'+id)?.classList.add('open'); switchDetailTab(id,'edit'); },50);
  }, 800);
}

async function deleteWorker(id){
  if(!isAdmin()||!confirm('¿Eliminar trabajador y todos sus datos?'))return;
  await sb.from('trabajadores').delete().eq('id',id);
  workers=workers.filter(w=>w.id!==id);bajas=bajas.filter(b=>b.trabajador_id!==id);vacaciones=vacaciones.filter(v=>v.trabajador_id!==id);
  renderWorkers();renderCalendar();renderSchedule();renderVacaciones();updateAllSelects();
}

// ══ BAJAS ══════════════════════════════════════════════════════
async function addBaja(wid){
  if(!isAdmin())return;
  const si=document.getElementById('bi-s-'+wid).value;
  const ei=document.getElementById('bi-e-'+wid).value||null;
  const mo=document.getElementById('bi-m-'+wid).value.trim()||null;
  if(!si){alert('Indica la fecha de inicio.');return;}
  const{data,error}=await sb.from('bajas').insert({trabajador_id:wid,baja_inicio:si,baja_fin:ei,motivo:mo}).select().single();
  if(error){alert(error.message);return;}
  bajas.push(data);
  document.getElementById('bi-s-'+wid).value='';document.getElementById('bi-e-'+wid).value='';document.getElementById('bi-m-'+wid).value='';
  renderWorkers();renderCalendar();renderSchedule();
  setTimeout(()=>{document.getElementById('wd-'+wid)?.classList.add('open');document.getElementById('dp-bajas-'+wid)?.classList.add('active');},50);
}
async function deleteBaja(bid,wid){
  if(!isAdmin()||!confirm('¿Eliminar baja?'))return;
  await sb.from('bajas').delete().eq('id',bid);
  bajas=bajas.filter(b=>b.id!==bid);renderWorkers();renderCalendar();renderSchedule();
  setTimeout(()=>{document.getElementById('wd-'+wid)?.classList.add('open');document.getElementById('dp-bajas-'+wid)?.classList.add('active');},50);
}
async function closeBaja(bid,wid){
  if(!isAdmin())return;
  const today=isoDate(new Date());
  const{data}=await sb.from('bajas').update({baja_fin:today}).eq('id',bid).select().single();
  const i=bajas.findIndex(b=>b.id===bid);if(i>=0)bajas[i]=data;
  renderWorkers();renderCalendar();renderSchedule();
  setTimeout(()=>{document.getElementById('wd-'+wid)?.classList.add('open');document.getElementById('dp-bajas-'+wid)?.classList.add('active');},50);
}

// ══ VACACIONES ════════════════════════════════════════════════
async function addVacacion(){
  if(!isAdmin())return;
  const wid=parseInt(document.getElementById('vacWorker').value);
  const anio=parseInt(document.getElementById('vacAnio').value);
  const start=document.getElementById('vacStart').value;
  const end=document.getElementById('vacEnd').value;
  const dias=parseFloat(document.getElementById('vacDias').value);
  const motivo=document.getElementById('vacMotivo').value.trim()||'Vacaciones';
  const al=document.getElementById('vacAlert');
  if(!wid||!start||!end){al.innerHTML='<div class="alert alert-w">Rellena trabajador, inicio y fin.</div>';return;}
  if(start>end){al.innerHTML='<div class="alert alert-w">El inicio debe ser anterior al fin.</div>';return;}
  al.innerHTML='';setLoad('vacSpin',null,true);
  const{data,error}=await sb.from('vacaciones').insert({trabajador_id:wid,anio,dias_derecho:dias,vacaciones_inicio:start,vacaciones_fin:end,motivo,aprobado:true,creado_por:currentUser.id}).select().single();
  setLoad('vacSpin',null,false);
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  vacaciones.push(data);
  al.innerHTML='<div class="alert alert-s">Vacaciones guardadas.</div>';setTimeout(()=>al.innerHTML='',3000);
  document.getElementById('vacStart').value='';document.getElementById('vacEnd').value='';
  renderVacaciones();renderCalendar();renderSchedule();
}
async function deleteVac(id){
  if(!isAdmin()||!confirm('¿Eliminar este período de vacaciones?'))return;
  await sb.from('vacaciones').delete().eq('id',id);
  vacaciones=vacaciones.filter(v=>v.id!==id);renderVacaciones();renderCalendar();renderSchedule();
}

// ══ FESTIVOS ══════════════════════════════════════════════════
function renderFestivos(){
  document.getElementById('festivosFijos')?.replaceWith(Object.assign(document.createElement('div'),{id:'festivosFijos',className:'festivos-list',innerHTML:Object.entries(FESTIVOS_FIJOS).sort((a,b)=>a[0].localeCompare(b[0])).map(([d,n])=>{const p=d.split('-');return`<span class="fest-tag">${p[2]}/${p[1]}/${p[0]} · ${n}</span>`;}).join('')}));
}
async function addFestivo(){
  if(!isAdmin())return;
  const date=document.getElementById('fDate').value,desc=document.getElementById('fDesc').value.trim(),tipo=document.getElementById('fTipo').value;
  const al=document.getElementById('fAlert');
  if(!date||!desc){al.innerHTML='<div class="alert alert-w">Rellena fecha y descripción.</div>';return;}
  const{data,error}=await sb.from('festivos').insert({fecha:date,descripcion:desc,tipo}).select().single();
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  customFestivos.push(data);al.innerHTML='<div class="alert alert-s">Festivo guardado.</div>';setTimeout(()=>al.innerHTML='',3000);
  document.getElementById('fDate').value='';document.getElementById('fDesc').value='';
  renderFestivos();renderCalendar();renderSchedule();
}
async function deleteFestivo(id){
  if(!isAdmin())return;
  await sb.from('festivos').delete().eq('id',id);
  customFestivos=customFestivos.filter(f=>f.id!==id);renderFestivos();renderCalendar();renderSchedule();
}

// ══ RENDER TRABAJADORES ═══════════════════════════════════════
function renderWorkers(){
  const el=document.getElementById('workersList');
  if(!workers.length){el.innerHTML='<div class="empty">Sin trabajadores.</div>';return;}
  const today=new Date();today.setHours(0,0,0,0);
  const sL={both:'8:30–14:00 y 17:00–22:00',morning:'8:30–14:00',evening:'17:00–22:00'};
  el.innerHTML='<div class="workers-list">'+workers.map(w=>{
    const st=workerStatus(w,new Date(today));
    const bc=st==='baja'?'badge-baja':st==='vac'?'badge-vac':st==='activo'?'badge-activo':st==='pending'?'badge-pending':'badge-inactivo';
    const bl=st==='baja'?'Baja':st==='vac'?'Vacaciones':st==='activo'?'Activo':st==='pending'?'Pendiente':'Inactivo';
    const dh=Math.round(w.horas/5*10)/10;
    const wb=workerBajas(w.id),wv=workerVacs(w.id);
    const activeBaja=wb.find(b=>{const t=isoDate(today);return t>=b.baja_inicio&&(!b.baja_fin||t<=b.baja_fin);});
    const activeVac=wv.find(v=>{const t=isoDate(today);return t>=v.vacaciones_inicio&&t<=v.vacaciones_fin;});

    const bajasHTML=wb.length?'<div class="bajas-list">'+wb.map(b=>{
      const open=!b.baja_fin;
      return`<div class="baja-row"><div style="flex:1;font-weight:600">${fmtFull(b.baja_inicio)} → ${b.baja_fin?fmtFull(b.baja_fin):'<span class="baja-open">Abierta</span>'}</div>${b.motivo?`<span style="color:var(--text2);font-size:11px">${b.motivo}</span>`:''} ${isAdmin()&&open?`<button class="btn btn-sm btn-warn" onclick="closeBaja(${b.id},${w.id})">Cerrar hoy</button>`:''}${isAdmin()?`<button class="btn btn-sm btn-danger" onclick="deleteBaja(${b.id},${w.id})">×</button>`:''}</div>`;
    }).join('')+'</div>':'<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Sin bajas.</div>';

    const addBajaForm=isAdmin()?`<div class="add-form"><div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">Añadir baja</div><div class="ig3"><div class="fg"><label>Inicio</label><input type="date" id="bi-s-${w.id}"></div><div class="fg"><label>Fin</label><input type="date" id="bi-e-${w.id}"></div><div class="fg"><label>Motivo</label><input type="text" id="bi-m-${w.id}" placeholder="IT…"></div><button class="btn btn-primary btn-sm" style="align-self:flex-end;padding:7px 12px" onclick="addBaja(${w.id})">Añadir</button></div></div>`:'';

    const vacsHTML=wv.length?'<div class="bajas-list">'+wv.map(v=>`<div class="baja-row"><div style="flex:1;font-weight:600">${fmtFull(v.vacaciones_inicio)} → ${fmtFull(v.vacaciones_fin)}</div><span style="color:var(--text2);font-size:11px">${v.motivo||''} · ${daysBetween(v.vacaciones_inicio,v.vacaciones_fin)}d · ${v.anio}</span>${isAdmin()?`<button class="btn btn-sm btn-danger" onclick="deleteVac(${v.id})">×</button>`:''}</div>`).join('')+'</div>':'<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Sin vacaciones.</div>';

    return`<div class="worker-card">
      <div class="worker-main" onclick="document.getElementById('wd-${w.id}').classList.toggle('open')">
        <div class="avatar">${initials(w.nombre)}</div>
        <div class="worker-info">
          <div class="worker-name">${w.nombre}</div>
          <div class="worker-meta">${w.horas}h/sem &middot; ${dh}h/día &middot; Libre: ${DAYNAMES[w.dia_libre]}${w.inicio?' &middot; Desde '+fmtFull(w.inicio):''}${activeBaja?' &middot; Baja desde '+fmtFull(activeBaja.baja_inicio):''}${activeVac?' &middot; Vacaciones hasta '+fmtFull(activeVac.vacaciones_fin):''}</div>
          <div style="margin-top:4px;display:flex;gap:5px;flex-wrap:wrap">
            ${w.turno==='both'||w.turno==='morning'?'<span style="font-size:10px;font-weight:700;padding:2px 7px;background:#E1F5EE;color:#085041;border-radius:4px">M &#8226; 8:30&#x2013;14:00</span>':''}
            ${w.turno==='both'||w.turno==='evening'?'<span style="font-size:10px;font-weight:700;padding:2px 7px;background:#E1F0FF;color:#0C447C;border-radius:4px">T &#8226; 17:00&#x2013;22:00</span>':''}
          </div>
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0">
          <span class="badge ${bc}">${bl}</span>
          <span style="font-size:11px;color:var(--text2)">${wb.length}B · ${wv.length}V</span>
          <span style="color:var(--text2)">▾</span>
        </div>
      </div>
      <div class="worker-detail" id="wd-${w.id}">
        <div class="detail-tabs">
          <button class="dtab active" id="dt-bajas-${w.id}" onclick="switchDetailTab(${w.id},'bajas')">Bajas (${wb.length})</button>
          <button class="dtab" id="dt-vac-${w.id}" onclick="switchDetailTab(${w.id},'vac')">Vacaciones (${wv.length})</button>
          ${isAdmin()?`<button class="dtab" id="dt-edit-${w.id}" onclick="switchDetailTab(${w.id},'edit')">Editar datos</button>`:''}
        </div>
        <div class="detail-panel active" id="dp-bajas-${w.id}">${bajasHTML}${addBajaForm}</div>
        <div class="detail-panel" id="dp-vac-${w.id}">${vacsHTML}</div>
        ${isAdmin()?`<div class="detail-panel" id="dp-edit-${w.id}">
          <div class="form-grid" style="margin-bottom:10px">
            <div class="fg" style="grid-column:span 2"><label>Nombre completo</label><input type="text" id="ed-name-${w.id}" value="${w.nombre}"></div>
            <div class="fg"><label>Horas semanales</label><input type="number" id="ed-hours-${w.id}" value="${w.horas}" min="1" max="60"></div>
            <div class="fg"><label>Turno</label>
              <select id="ed-shift-${w.id}">
                <option value="both" ${w.turno==='both'?'selected':''}>Mañana y tarde</option>
                <option value="morning" ${w.turno==='morning'?'selected':''}>Solo mañana</option>
                <option value="evening" ${w.turno==='evening'?'selected':''}>Solo tarde</option>
              </select>
            </div>
            <div class="fg"><label>Inicio laboral</label><input type="date" id="ed-start-${w.id}" value="${w.inicio||''}"></div>
            <div class="fg"><label>Fin de contrato</label><input type="date" id="ed-end-${w.id}" value="${w.fin||''}"></div>
          </div>
          <div class="fg" style="margin-bottom:10px"><label>Día libre (además del domingo)</label>
            <div class="radio-group">
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="1" ${w.dia_libre===1?'checked':''}> Lunes</label>
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="2" ${w.dia_libre===2?'checked':''}> Martes</label>
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="3" ${w.dia_libre===3?'checked':''}> Miércoles</label>
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="4" ${w.dia_libre===4?'checked':''}> Jueves</label>
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="5" ${w.dia_libre===5?'checked':''}> Viernes</label>
              <label class="radio-item"><input type="radio" name="ed-dayoff-${w.id}" value="6" ${w.dia_libre===6?'checked':''}> Sábado</label>
            </div>
          </div>
          <div id="ed-alert-${w.id}"></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <button class="btn btn-sm btn-danger" onclick="deleteWorker(${w.id})">Eliminar trabajador</button>
            <button class="btn btn-primary" onclick="saveWorker(${w.id})">Guardar cambios</button>
          </div>
        </div>`:''}
      </div>
    </div>`;
  }).join('')+'</div>';
}
function switchDetailTab(wid,tab){
  ['bajas','vac','edit'].forEach(t=>{
    document.getElementById('dp-'+t+'-'+wid)?.classList.toggle('active',t===tab);
    document.getElementById('dt-'+t+'-'+wid)?.classList.toggle('active',t===tab);
  });
}

// ══ CUADRANTE MENSUAL ═════════════════════════════════════════
function calChange(n){calMonth+=n;if(calMonth>11){calMonth=0;calYear++;}if(calMonth<0){calMonth=11;calYear--;}renderCalendar();}

function renderCalendar(){
  const wid=document.getElementById('calWorker')?.value||'all';
  const sel=workers.filter(w=>wid==='all'||String(w.id)===String(wid));
  document.getElementById('calLabel').textContent=`${MONTHS[calMonth]} ${calYear}`;

  const firstDay=new Date(calYear,calMonth,1);
  const lastDay=new Date(calYear,calMonth+1,0);
  const startDow=(firstDay.getDay()+6)%7; // Monday=0
  const daysInMonth=lastDay.getDate();
  const todayStr=isoDate(new Date());

  const content=document.getElementById('calendarContent');
  if(!sel.length){content.innerHTML='<div class="empty">Selecciona un trabajador.</div>';return;}

  if(wid==='all'){
    // Multi-worker: table view
    let html='<div class="tbl-wrap"><table><thead><tr><th>Trabajador</th>';
    for(let d=1;d<=daysInMonth;d++){
      const date=new Date(calYear,calMonth,d);
      const dow=date.getDay();
      const isW=dow===0||dow===6;
      const ds=isoDate(date);
      const isF=isFestivo(ds);
      html+=`<th class="dc" style="min-width:28px;${isW?'color:var(--text3)':''}${isF?';background:#EEEDFE':''}${ds===todayStr?';color:var(--blue)':''}">${d}<br><span style="font-size:9px;font-weight:400">${DAYS[dow]}</span></th>`;
    }
    html+='<th class="dc">H</th><th class="dc">V</th><th class="dc">B</th></tr></thead><tbody>';
    sel.forEach(w=>{
      let wH=0,vDays=0,bDays=0;
      html+=`<tr><td style="white-space:nowrap;font-weight:600">${w.nombre}</td>`;
      for(let d=1;d<=daysInMonth;d++){
        const date=new Date(calYear,calMonth,d);
        const st=getDayStatus(w,date);
        const dh=Math.round(w.horas/5*10)/10;
        let cell='';
        if(st.type==='work'){wH+=dh;cell=`<span style="width:20px;height:20px;background:var(--green);border-radius:3px;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700">${dh}</span>`;}
        else if(st.type==='baja'){bDays++;cell=`<span style="width:20px;height:20px;background:#EF9F27;border-radius:3px;display:inline-block"></span>`;}
        else if(st.type==='vac'){vDays++;cell=`<span style="width:20px;height:20px;background:#378ADD;border-radius:3px;display:inline-block"></span>`;}
        else if(st.type==='festivo'){cell=`<span style="width:20px;height:20px;background:#AFA9EC;border-radius:3px;display:inline-block"></span>`;}
        else if(st.type==='libre'||st.type==='sunday'){cell=`<span style="width:20px;height:20px;background:var(--bg2);border-radius:3px;display:inline-block"></span>`;}
        else{cell=`<span style="color:var(--text3);font-size:10px">—</span>`;}
        html+=`<td class="dc" style="padding:3px 2px">${cell}</td>`;
      }
      html+=`<td class="dc" style="font-weight:700">${Math.round(wH*10)/10}h</td><td class="dc" style="color:var(--blue2)">${vDays}d</td><td class="dc" style="color:var(--amber)">${bDays}d</td></tr>`;
    });
    html+='</tbody></table></div>';
    content.innerHTML=html;
  } else {
    // Single worker: calendar grid
    const w=sel[0]; if(!w){content.innerHTML='<div class="empty">Trabajador no encontrado.</div>';return;}
    let wH=0,wDays=0,vDays=0,bDays=0,festDays=0;
    let html='<div class="cal-grid">';
    ['L','M','X','J','V','S','D'].forEach((d,i)=>html+=`<div class="cal-dow${i>=5?' weekend':''}">${d}</div>`);
    for(let blank=0;blank<startDow;blank++) html+='<div class="cal-day other-month"></div>';
    for(let d=1;d<=daysInMonth;d++){
      const date=new Date(calYear,calMonth,d);
      const ds=isoDate(date);
      const st=getDayStatus(w,date);
      const isToday=ds===todayStr;
      const dh=Math.round(w.horas/5*10)/10;
      let pillHTML='',pillClass='';
      if(st.type==='work'){
        wH+=dh;wDays++;
        pillClass=w.turno==='both'?'both':'work';
        pillHTML=`<div class="cal-pill ${pillClass}">${w.turno==='both'?'8:30–14:00/17:00–22:00':w.turno==='morning'?'8:30–14:00':'17:00–22:00'}</div>`;
      } else if(st.type==='baja'){bDays++;pillHTML=`<div class="cal-pill baja">Baja</div>`;}
      else if(st.type==='vac'){vDays++;pillHTML=`<div class="cal-pill vac">Vac.</div>`;}
      else if(st.type==='festivo'){festDays++;pillHTML=`<div class="cal-pill fest" title="${st.name}">Festivo</div>`;}
      else if(st.type==='libre'){pillHTML=`<div class="cal-pill libre">Libre</div>`;}
      html+=`<div class="cal-day${isToday?' today':''}"><div class="cal-num">${d}</div>${pillHTML}</div>`;
    }
    html+='</div>';
    html+=`<div class="cal-summary">
      <div class="cs-card"><div class="cs-label">Días trabajo</div><div class="cs-val" style="color:var(--green)">${wDays}</div></div>
      <div class="cs-card"><div class="cs-label">Horas</div><div class="cs-val">${Math.round(wH*10)/10}h</div></div>
      <div class="cs-card"><div class="cs-label">Vacaciones</div><div class="cs-val" style="color:var(--blue)">${vDays}d</div></div>
      <div class="cs-card"><div class="cs-label">Baja</div><div class="cs-val" style="color:var(--amber)">${bDays}d</div></div>
      <div class="cs-card"><div class="cs-label">Festivos</div><div class="cs-val" style="color:var(--purple)">${festDays}d</div></div>
    </div>`;
    content.innerHTML=html;
  }
}

// ══ HORARIO SEMANAL ════════════════════════════════════════════
function renderSchedule(){
  const dates=getWeekDates(weekOffset);
  const today=new Date();today.setHours(0,0,0,0);
  document.getElementById('weekLabel').textContent=`Semana del ${fmtDate(dates[0])} al ${fmtDate(dates[6])}`;
  const grid=document.getElementById('scheduleGrid');
  if(!workers.length){grid.innerHTML='<div class="empty">Sin trabajadores.</div>';return;}
  let html='<table><thead><tr><th>Trabajador</th><th>Horario contrato</th><th>H/sem</th>';
  dates.forEach(d=>{
    const isT=isoDate(d)===isoDate(today),isF=isFestivo(isoDate(d));
    html+=`<th class="dc" style="${isT?'color:var(--blue)':''}${isF?';background:#EEEDFE':''}">${DAYS[d.getDay()]}<br><span style="font-size:10px;font-weight:400">${fmtDate(d)}</span></th>`;
  });
  html+='<th class="dc">Total</th></tr></thead><tbody>';
  const sLab={both:'8:30–14:00 / 17:00–22:00',morning:'8:30–14:00',evening:'17:00–22:00'};
  workers.forEach(w=>{
    let wH=0;
    const cells=dates.map(d=>{
      const st=getDayStatus(w,d),dh=Math.round(w.horas/5*10)/10;
      if(st.type==='work'){wH+=dh;if(w.turno==='both')return`<span class="dy-work">8:30–14:00 ${Math.round(dh/2*10)/10}h</span><br><span class="dy-eve" style="margin-top:2px;display:inline-block">17:00–22:00 ${Math.round(dh/2*10)/10}h</span>`;if(w.turno==='morning')return`<span class="dy-work">8:30–14:00 ${dh}h</span>`;return`<span class="dy-eve">17:00–22:00 ${dh}h</span>`;}
      if(st.type==='sunday'||st.type==='inactive')return'<span class="dy-off">—</span>';
      if(st.type==='libre')return'<span class="dy-libre">Libre</span>';
      if(st.type==='baja')return'<span class="dy-baja">Baja</span>';
      if(st.type==='vac')return'<span class="dy-vac">Vac.</span>';
      if(st.type==='festivo')return`<span class="dy-fest" title="${st.name}">Fest.</span>`;
      return'<span class="dy-off">—</span>';
    });
    html+=`<tr><td><strong style="font-weight:600">${w.nombre}</strong></td><td style="font-size:10px;line-height:1.6">
  ${w.turno==='both'||w.turno==='morning'?'<span style="background:#E1F5EE;color:#085041;padding:1px 5px;border-radius:3px;font-weight:700">M 8:30–14:00</span><br>':''}${w.turno==='both'||w.turno==='evening'?'<span style="background:#E1F0FF;color:#0C447C;padding:1px 5px;border-radius:3px;font-weight:700">T 17:00–22:00</span>':''}
</td><td style="color:var(--text2)">${w.horas}h</td>`;
    cells.forEach(c=>{html+=`<td class="dc">${c}</td>`;});
    html+=`<td class="dc" style="font-weight:700">${wH>0?Math.round(wH*10)/10+'h':'—'}</td></tr>`;
  });
  html+='</tbody></table>';
  grid.innerHTML=html;
}

// ══ VACACIONES ════════════════════════════════════════════════
function renderVacaciones(){
  const wid=document.getElementById('vacResWorker').value;
  const anio=parseInt(document.getElementById('vacResAnio').value);
  const el=document.getElementById('vacResumen');
  const sel=workers.filter(w=>wid==='all'||String(w.id)===String(wid));
  if(!sel.length){el.innerHTML='<div class="empty">Sin trabajadores.</div>';return;}
  let html='';
  sel.forEach(w=>{
    const wvs=workerVacs(w.id).filter(v=>v.anio===anio);
    const diasDerecho=wvs.length?wvs[0].dias_derecho:30;
    const diasDisfrutados=wvs.reduce((s,v)=>s+daysBetween(v.vacaciones_inicio,v.vacaciones_fin),0);
    const diasPendientes=Math.max(0,diasDerecho-diasDisfrutados);
    html+=`<div class="sum-block" style="margin-bottom:12px">
      <h3>${w.nombre} <span style="font-size:11px;font-weight:400;color:var(--text2)">${anio} · ${diasDerecho} días derecho</span></h3>
      <div class="vac-resumen">
        <div class="vac-card"><div class="vac-label">Días derecho</div><div class="vac-val">${diasDerecho}</div></div>
        <div class="vac-card"><div class="vac-label">Disfrutados</div><div class="vac-val" style="color:var(--green)">${diasDisfrutados}</div></div>
        <div class="vac-card"><div class="vac-label">Pendientes</div><div class="vac-val" style="color:${diasPendientes>0?'var(--amber)':'var(--text2)'}">${diasPendientes}</div></div>
      </div>
      ${wvs.length?wvs.map(v=>`<div class="vac-row"><div style="flex:1;font-weight:600">${fmtFull(v.vacaciones_inicio)} → ${fmtFull(v.vacaciones_fin)}</div><span style="color:var(--text2);font-size:11px">${daysBetween(v.vacaciones_inicio,v.vacaciones_fin)} días · ${v.motivo||''}</span>${isAdmin()?`<button class="btn btn-sm btn-danger" onclick="deleteVac(${v.id})">×</button>`:''}</div>`).join(''):'<div style="font-size:12px;color:var(--text2)">Sin períodos registrados.</div>'}
    </div>`;
  });
  el.innerHTML=html;
}

// ══ RESUMEN ═══════════════════════════════════════════════════
function renderSummary(){
  const view=document.getElementById('sumView').value;
  const wid=document.getElementById('sumWorker').value;
  const month=parseInt(document.getElementById('sumMonth').value);
  const year=parseInt(document.getElementById('sumYear').value);
  const content=document.getElementById('summaryContent');
  const sel=workers.filter(w=>wid==='all'||String(w.id)===String(wid));
  if(!sel.length){content.innerHTML='<div class="empty">Sin datos.</div>';return;}
  const dates=view==='monthly'?(()=>{const a=[];for(let d=new Date(year,month,1);d<=new Date(year,month+1,0);d.setDate(d.getDate()+1))a.push(new Date(d));return a;})():getWeekDates(weekOffset);
  const label=view==='monthly'?`${MONTHS[month]} ${year}`:`Semana del ${fmtDate(dates[0])} al ${fmtDate(dates[dates.length-1])}`;
  let html=`<div style="font-size:13px;font-weight:700;margin-bottom:12px">${label}</div>`;
  sel.forEach(w=>{
    const{wH,fest,baja,vac,libres}=countWorkDays(w,dates);
    const target=view==='monthly'?Math.round(w.horas*4.33*10)/10:w.horas;
    const diff=Math.round((wH-target)*10)/10;
    const wb=workerBajas(w.id);
    html+=`<div class="sum-block">
      <h3>${w.nombre} <span style="font-size:11px;font-weight:400;color:var(--text2)">${w.horas}h/sem</span></h3>
      <div class="sum-row"><span>Horas trabajadas</span><span>${wH}h</span></div>
      <div class="sum-row"><span>Festivos</span><span>${fest} días</span></div>
      <div class="sum-row"><span>Días de baja</span><span>${baja} días</span></div>
      <div class="sum-row"><span>Días de vacaciones</span><span>${vac} días</span></div>
      <div class="sum-row"><span>Días libres</span><span>${libres} días</span></div>
      <div class="sum-row"><span>Objetivo ${view==='monthly'?'mensual':'semanal'}</span><span>${target}h</span></div>
      <div class="sum-row"><span>Diferencia</span><span style="color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'+':''}${diff}h</span></div>
    </div>`;
  });
  content.innerHTML=html;
}

// ══ INFORME ════════════════════════════════════════════════════
let reportData=null;
function generateReport(){
  const rc=document.getElementById('reportContent');
  if(!workers.length){rc.innerHTML='<div class="empty">Sin trabajadores.</div>';return;}
  rc.innerHTML='<div class="loading"><span class="spinner"></span>Calculando...</div>';
  setTimeout(()=>{
    const start=new Date(2025,1,1),end=new Date();
    reportData=[];
    let html='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem"><span class="badge badge-activo" style="font-size:12px;padding:5px 12px">Mañana 8:30–14:00</span><span class="badge badge-activo" style="font-size:12px;padding:5px 12px">Tarde 17:00–22:00</span><span class="badge badge-festivo" style="font-size:12px;padding:5px 12px">Feb 2025 → '+fmtDate(end)+'</span></div>';
    workers.forEach(w=>{
      let totalH=0,totalWork=0,totalFest=0,totalBaja=0,totalVac=0;
      const monthData={};
      for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
        const ds=isoDate(d),ym=ds.substring(0,7);
        if(!monthData[ym])monthData[ym]={work:0,fest:0,baja:0,vac:0,libre:0,hours:0};
        const st=getDayStatus(w,new Date(d));
        const dh=Math.round(w.horas/5*100)/100;
        if(st.type==='work'){monthData[ym].work++;monthData[ym].hours+=dh;totalH+=dh;totalWork++;}
        if(st.type==='festivo'){monthData[ym].fest++;totalFest++;}
        if(st.type==='baja'){monthData[ym].baja++;totalBaja++;}
        if(st.type==='vac'){monthData[ym].vac++;totalVac++;}
        if(st.type==='libre'||st.type==='sunday')monthData[ym].libre++;
      }
      const wb=workerBajas(w.id);
      reportData.push({worker:w,monthData,totals:{totalH:Math.round(totalH*10)/10,totalWork,totalFest,totalBaja,totalVac},bajas:wb,vacs:workerVacs(w.id)});
      const sLab={both:'8:30–14:00 y 17:00–22:00',morning:'Solo mañana (8:30–14:00)',evening:'Solo tarde (17:00–22:00)'};
      html+=`<div class="card" style="margin-bottom:1rem">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
          <div class="avatar">${initials(w.nombre)}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px">${w.nombre}</div>
            <div style="font-size:11px;color:var(--text2)">${w.horas}h/sem · Libre: ${DAYNAMES[w.dia_libre]} · ${sLab[w.turno]}${w.inicio?' · Desde '+fmtFull(w.inicio):''}</div>
          </div>
        </div>
        <div class="stats-grid" style="margin-bottom:12px">
          <div class="stat-card"><div class="stat-label">Total horas</div><div class="stat-value" style="font-size:18px">${Math.round(totalH*10)/10}h</div></div>
          <div class="stat-card"><div class="stat-label">Días trab.</div><div class="stat-value" style="font-size:18px">${totalWork}</div></div>
          <div class="stat-card"><div class="stat-label">Festivos</div><div class="stat-value" style="font-size:18px;color:var(--purple)">${totalFest}</div></div>
          <div class="stat-card"><div class="stat-label">Baja</div><div class="stat-value" style="font-size:18px;color:var(--amber)">${totalBaja}d</div></div>
          <div class="stat-card"><div class="stat-label">Vacaciones</div><div class="stat-value" style="font-size:18px;color:var(--blue)">${totalVac}d</div></div>
        </div>
        <div class="tbl-wrap"><table>
          <thead><tr><th>Mes</th><th class="dc">Trab.</th><th class="dc">Horas</th><th class="dc">Fest.</th><th class="dc">Baja</th><th class="dc">Vac.</th><th class="dc">Libres</th><th class="dc">Objetivo</th><th class="dc">Dif.</th></tr></thead>
          <tbody>`;
      Object.entries(monthData).sort().forEach(([ym,md])=>{
        const[y,m]=ym.split('-');
        const target=Math.round(w.horas*4.33*10)/10,h=Math.round(md.hours*10)/10;
        const diff=Math.round((h-target)*10)/10;
        html+=`<tr><td>${MONTHS[parseInt(m)-1]} ${y}</td><td class="dc">${md.work}</td><td class="dc" style="font-weight:700">${h}h</td><td class="dc">${md.fest}</td><td class="dc">${md.baja}</td><td class="dc">${md.vac}</td><td class="dc" style="color:var(--text2)">${md.libre}</td><td class="dc" style="color:var(--text2)">${target}h</td><td class="dc" style="font-weight:700;color:${diff>=0?'var(--green)':'var(--red)'}">${diff>=0?'+':''}${diff}h</td></tr>`;
      });
      html+=`</tbody></table></div></div>`;
    });
    rc.innerHTML=html;
  },80);
}

// ══ EXPORTACIÓN PDF ════════════════════════════════════════════
function exportCalPDF(){
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF('l','mm','a4');
  doc.setFontSize(14);doc.text(`Cuadrante ${MONTHS[calMonth]} ${calYear}`,14,14);
  doc.setFontSize(8);
  const wid=document.getElementById('calWorker').value;
  const sel=workers.filter(w=>wid==='all'||String(w.id)===String(wid));
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const head=[['Trabajador',...Array.from({length:daysInMonth},(_,i)=>String(i+1)),'H','V','B']];
  const body=sel.map(w=>{
    let wH=0,vDays=0,bDays=0;
    const cells=Array.from({length:daysInMonth},(_,i)=>{
      const d=new Date(calYear,calMonth,i+1);
      const st=getDayStatus(w,d);
      const dh=Math.round(w.horas/5*10)/10;
      if(st.type==='work'){wH+=dh;return'T';}
      if(st.type==='baja'){bDays++;return'B';}
      if(st.type==='vac'){vDays++;return'V';}
      if(st.type==='festivo')return'F';
      if(st.type==='libre'||st.type==='sunday')return'L';
      return'—';
    });
    return[w.nombre,...cells,Math.round(wH*10)/10+'h',vDays,bDays];
  });
  doc.autoTable({head,body,startY:20,styles:{fontSize:7,cellPadding:1},headStyles:{fillColor:[24,95,165]}});
  doc.save(`cuadrante-${calYear}-${String(calMonth+1).padStart(2,'0')}.pdf`);
}

function exportSumPDF(){
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  const view=document.getElementById('sumView').value;
  const month=parseInt(document.getElementById('sumMonth').value);
  const year=parseInt(document.getElementById('sumYear').value);
  doc.setFontSize(14);doc.text('Resumen de horarios',14,14);
  doc.setFontSize(10);doc.text(view==='monthly'?`${MONTHS[month]} ${year}`:`Semana actual`,14,22);
  const dates=view==='monthly'?(()=>{const a=[];for(let d=new Date(year,month,1);d<=new Date(year,month+1,0);d.setDate(d.getDate()+1))a.push(new Date(d));return a;})():getWeekDates(weekOffset);
  const head=[['Trabajador','Horas contrato','Horas realizadas','Festivos','Baja','Vacaciones','Diferencia']];
  const body=workers.map(w=>{
    const{wH,fest,baja,vac}=countWorkDays(w,dates);
    const target=view==='monthly'?Math.round(w.horas*4.33*10)/10:w.horas;
    const diff=Math.round((wH-target)*10)/10;
    return[w.nombre,target+'h',wH+'h',fest,baja,vac,(diff>=0?'+':'')+diff+'h'];
  });
  doc.autoTable({head,body,startY:28,headStyles:{fillColor:[24,95,165]}});
  doc.save(`resumen-horarios.pdf`);
}

function exportReportPDF(){
  if(!reportData){alert('Genera el informe primero.');return;}
  const{jsPDF}=window.jspdf;
  const doc=new jsPDF();
  doc.setFontSize(14);doc.text('Informe histórico de horarios',14,14);
  doc.setFontSize(9);doc.text(`Generado: ${new Date().toLocaleDateString('es-ES')}`,14,20);
  let y=28;
  reportData.forEach(({worker:w,monthData,totals})=>{
    if(y>240){doc.addPage();y=14;}
    doc.setFontSize(12);doc.text(w.nombre,14,y);y+=6;
    doc.setFontSize(9);doc.text(`${w.horas}h/sem · Total horas: ${totals.totalH}h · Días baja: ${totals.totalBaja} · Vacaciones: ${totals.totalVac}d`,14,y);y+=6;
    const head=[['Mes','Días','Horas','Festivos','Baja','Vac','Objetivo','Dif.']];
    const body=Object.entries(monthData).sort().map(([ym,md])=>{
      const[yr,mo]=ym.split('-');
      const target=Math.round(w.horas*4.33*10)/10,h=Math.round(md.hours*10)/10;
      return[`${MONTHS[parseInt(mo)-1]} ${yr}`,md.work,h+'h',md.fest,md.baja,md.vac,target+'h',(Math.round((h-target)*10)/10>=0?'+':'')+Math.round((h-target)*10)/10+'h'];
    });
    doc.autoTable({head,body,startY:y,styles:{fontSize:8,cellPadding:1.5},headStyles:{fillColor:[24,95,165]},margin:{left:14,right:14}});
    y=doc.lastAutoTable.finalY+10;
  });
  doc.save('informe-historico.pdf');
}

// ══ EXPORTACIÓN EXCEL ══════════════════════════════════════════
function exportCalXLS(){
  const wid=document.getElementById('calWorker').value;
  const sel=workers.filter(w=>wid==='all'||String(w.id)===String(wid));
  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const ws_data=[['Cuadrante',`${MONTHS[calMonth]} ${calYear}`],['Trabajador',...Array.from({length:daysInMonth},(_,i)=>i+1),'H.total','Vac(d)','Baja(d)']];
  sel.forEach(w=>{
    let wH=0,vDays=0,bDays=0;
    const cells=Array.from({length:daysInMonth},(_,i)=>{
      const d=new Date(calYear,calMonth,i+1),st=getDayStatus(w,d),dh=Math.round(w.horas/5*10)/10;
      if(st.type==='work'){wH+=dh;return w.turno==='morning'?'M':w.turno==='evening'?'T':'M+T';}
      if(st.type==='baja'){bDays++;return'B';}if(st.type==='vac'){vDays++;return'V';}
      if(st.type==='festivo')return'F';if(st.type==='libre'||st.type==='sunday')return'L';return'';
    });
    ws_data.push([w.nombre,...cells,Math.round(wH*10)/10,vDays,bDays]);
  });
  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(ws_data);
  XLSX.utils.book_append_sheet(wb,ws,'Cuadrante');
  XLSX.writeFile(wb,`cuadrante-${calYear}-${String(calMonth+1).padStart(2,'0')}.xlsx`);
}

function exportSumXLS(){
  const view=document.getElementById('sumView').value;
  const month=parseInt(document.getElementById('sumMonth').value);
  const year=parseInt(document.getElementById('sumYear').value);
  const dates=view==='monthly'?(()=>{const a=[];for(let d=new Date(year,month,1);d<=new Date(year,month+1,0);d.setDate(d.getDate()+1))a.push(new Date(d));return a;})():getWeekDates(weekOffset);
  const ws_data=[['Resumen horarios',view==='monthly'?`${MONTHS[month]} ${year}`:'Semana'],['Trabajador','Horas contrato','Horas realizadas','Festivos','Baja','Vacaciones','Libres','Diferencia']];
  workers.forEach(w=>{
    const{wH,fest,baja,vac,libres}=countWorkDays(w,dates);
    const target=view==='monthly'?Math.round(w.horas*4.33*10)/10:w.horas;
    const diff=Math.round((wH-target)*10)/10;
    ws_data.push([w.nombre,target,wH,fest,baja,vac,libres,diff]);
  });
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ws_data),'Resumen');
  XLSX.writeFile(wb,'resumen-horarios.xlsx');
}

function exportReportXLS(){
  if(!reportData){alert('Genera el informe primero.');return;}
  const wb=XLSX.utils.book_new();
  reportData.forEach(({worker:w,monthData,totals})=>{
    const ws_data=[
      [w.nombre,`${w.horas}h/sem`,'','','','','',''],
      ['Total horas',totals.totalH+'h','Días trabajados',totals.totalWork,'Baja',totals.totalBaja+'d','Vacaciones',totals.totalVac+'d'],
      [],
      ['Mes','Días trab.','Horas','Festivos','Baja','Vac.','Libres','Objetivo','Diferencia']
    ];
    Object.entries(monthData).sort().forEach(([ym,md])=>{
      const[yr,mo]=ym.split('-');
      const target=Math.round(w.horas*4.33*10)/10,h=Math.round(md.hours*10)/10;
      ws_data.push([`${MONTHS[parseInt(mo)-1]} ${yr}`,md.work,h,md.fest,md.baja,md.vac,md.libre,target,Math.round((h-target)*10)/10]);
    });
    const sheetName=w.nombre.substring(0,28).replace(/[:/\\?*\[\]]/g,'');
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ws_data),sheetName);
  });
  XLSX.writeFile(wb,'informe-historico.xlsx');
}

// ══ AUDITORÍA ══════════════════════════════════════════════════
async function loadAudit(){
  if(!isAdmin())return;
  const tabla=document.getElementById('auditTabla')?.value||'';
  let q=sb.from('auditoria').select('*').order('creado_en',{ascending:false}).limit(100);
  if(tabla)q=q.eq('tabla',tabla);
  const{data}=await q;
  const el=document.getElementById('auditList');
  if(!data||!data.length){el.innerHTML='<div class="empty">Sin registros.</div>';return;}
  el.innerHTML=data.map(r=>{
    const dt=new Date(r.creado_en);
    const dtStr=dt.toLocaleDateString('es-ES')+' '+dt.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
    const cambio=r.operacion==='UPDATE'&&r.datos_antes&&r.datos_despues
      ?Object.keys(r.datos_despues).filter(k=>JSON.stringify(r.datos_antes[k])!==JSON.stringify(r.datos_despues[k])).map(k=>`${k}: ${r.datos_antes[k]??'—'} → ${r.datos_despues[k]??'—'}`).join(', ')
      :r.operacion==='INSERT'?JSON.stringify(r.datos_despues).substring(0,120):'ID '+r.registro_id;
    return`<div class="audit-row">
      <span class="audit-op op-${r.operacion}">${r.operacion}</span>
      <div class="audit-info">
        <div><strong style="font-weight:600">${r.tabla}</strong> #${r.registro_id} · <span style="color:var(--text2)">${cambio.substring(0,150)}</span></div>
        <div class="audit-meta">${dtStr} · ${r.usuario_email||'sistema'}</div>
      </div>
    </div>`;
  }).join('');
}

// ══ USUARIOS ═══════════════════════════════════════════════════
async function addUser(){
  if(!isAdmin())return;
  const nombre=document.getElementById('uNombre').value.trim();
  const email=document.getElementById('uEmail').value.trim();
  const pass=document.getElementById('uPass').value;
  const rol=document.getElementById('uRol').value;
  const al=document.getElementById('uAlert');
  if(!nombre||!email||!pass){al.innerHTML='<div class="alert alert-w">Rellena todos los campos.</div>';return;}
  if(pass.length<6){al.innerHTML='<div class="alert alert-w">Contraseña mín. 6 caracteres.</div>';return;}
  setLoad('uSpin',null,true);
  const{data,error}=await sb.auth.signUp({email,password:pass,options:{data:{nombre}}});
  setLoad('uSpin',null,false);
  if(error){al.innerHTML=`<div class="alert alert-e">${error.message}</div>`;return;}
  if(data?.user){await sb.from('usuarios').upsert({id:data.user.id,email,nombre,rol});}
  al.innerHTML='<div class="alert alert-s">Usuario creado.</div>';setTimeout(()=>al.innerHTML='',4000);
  document.getElementById('uNombre').value='';document.getElementById('uEmail').value='';document.getElementById('uPass').value='';
  const{data:u}=await sb.from('usuarios').select('*').order('creado_en');
  usuarios=u||[];renderUsuarios();
}
async function changeRol(uid,newRol){
  if(!isAdmin())return;
  await sb.from('usuarios').update({rol:newRol}).eq('id',uid);
  const i=usuarios.findIndex(u=>u.id===uid);if(i>=0)usuarios[i].rol=newRol;
  renderUsuarios();
}
async function toggleActivo(uid,activo){
  if(!isAdmin())return;
  await sb.from('usuarios').update({activo:!activo}).eq('id',uid);
  const i=usuarios.findIndex(u=>u.id===uid);if(i>=0)usuarios[i].activo=!activo;
  renderUsuarios();
}
function renderUsuarios(){
  const el=document.getElementById('usuariosList');
  if(!usuarios.length){el.innerHTML='<div class="empty">Sin usuarios.</div>';return;}
  el.innerHTML=usuarios.map(u=>{
    const isMe=u.id===currentUser?.id;
    return`<div class="user-row">
      <div class="avatar" style="background:${u.rol==='admin'?'#E6F1FB':'#EEEDFE'};color:${u.rol==='admin'?'var(--blue2)':'#3C3489'}">${(u.nombre||u.email).substring(0,2).toUpperCase()}</div>
      <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600">${u.nombre||'—'}${isMe?' <span style="font-size:10px;color:var(--text2)">(tú)</span>':''}</div><div style="font-size:11px;color:var(--text2)">${u.email}</div></div>
      <select onchange="changeRol('${u.id}',this.value)" ${isMe?'disabled':''} style="font-size:12px;padding:4px 8px;border:1px solid var(--border2);border-radius:var(--r);background:var(--bg);color:var(--text)">
        <option value="supervisor"${u.rol==='supervisor'?' selected':''}>Supervisor</option>
        <option value="admin"${u.rol==='admin'?' selected':''}>Admin</option>
      </select>
      <span class="badge ${u.activo?'badge-activo':'badge-inactivo'}">${u.activo?'Activo':'Inactivo'}</span>
      ${!isMe?`<button class="btn btn-sm ${u.activo?'btn-danger':'btn-warn'}" onclick="toggleActivo('${u.id}',${u.activo})">${u.activo?'Desactivar':'Activar'}</button>`:''}
    </div>`;
  }).join('');
}


// ══ FICHAJE KIOSKO ════════════════════════════════════════════
let pinBuffer = '';
let fichClockInterval = null;

function startFichClock(){
  clearInterval(fichClockInterval);
  function tick(){
    const now = new Date();
    const t = document.getElementById('fichTime');
    const d = document.getElementById('fichDate');
    if(t) t.textContent = now.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    if(d) d.textContent = now.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }
  tick();
  fichClockInterval = setInterval(tick, 1000);
}

function pinPress(digit){
  if(pinBuffer.length >= 4) return;
  pinBuffer += digit;
  updatePinDisplay();
  if(pinBuffer.length === 4) setTimeout(processFichaje, 150);
}
function pinDel(){ pinBuffer = pinBuffer.slice(0,-1); updatePinDisplay(); }
function pinClear(){ pinBuffer=''; updatePinDisplay(); setFichMsg('Introduce tu PIN de 4 digitos',''); }

function updatePinDisplay(){
  for(let i=0;i<4;i++){
    const dot = document.getElementById('pd'+i);
    if(!dot) continue;
    dot.textContent = i < pinBuffer.length ? 'o' : '';
    dot.classList.toggle('filled', i < pinBuffer.length);
    dot.classList.remove('error');
  }
}

function setFichMsg(text, type){
  const el = document.getElementById('fichMsg');
  if(!el) return;
  el.textContent = text;
  el.className = 'fich-msg' + (type ? ' '+type : '');
}

async function processFichaje(){
  const pin = pinBuffer;
  pinBuffer = '';
  updatePinDisplay();
  setFichMsg('Verificando...', '');
  const hoy = isoDate(new Date());
  const tipo = await getTipoFichaje(pin, hoy);
  const {data, error} = await sb.rpc('fichar_con_pin', {p_pin: pin, p_tipo: tipo});
  if(error || !data || !data.ok){
    const msg = (data && data.error) ? data.error : 'PIN incorrecto';
    setFichMsg(msg, 'error');
    for(let i=0;i<4;i++){const d=document.getElementById('pd'+i);if(d)d.classList.add('error');}
    setTimeout(pinClear, 2500);
    return;
  }
  const labels = {entrada:'ENTRADA REGISTRADA', pausa_inicio:'PAUSA INICIADA', pausa_fin:'VUELTA DE PAUSA', salida:'SALIDA REGISTRADA'};
  setFichMsg((labels[data.tipo]||data.tipo) + '  ' + data.nombre + '  ' + data.hora, 'success');
  setTimeout(pinClear, 3000);
}

async function getTipoFichaje(pin, hoy){
  const res1 = await sb.from('trabajadores').select('id').eq('pin', pin).maybeSingle();
  if(!res1.data) return 'entrada';
  const res2 = await sb.from('fichajes').select('tipo').eq('trabajador_id', res1.data.id).eq('fecha', hoy).order('creado_en', {ascending:false}).limit(1).maybeSingle();
  const ultimo = res2.data ? res2.data.tipo : null;
  if(!ultimo || ultimo==='salida') return 'entrada';
  if(ultimo==='entrada') return 'pausa_inicio';
  if(ultimo==='pausa_inicio') return 'pausa_fin';
  return 'salida';
}

document.addEventListener('keydown', e=>{
  if(document.getElementById('scFichaje')?.classList.contains('active')){
    if(e.key>='0'&&e.key<='9') pinPress(e.key);
    if(e.key==='Backspace') pinDel();
    if(e.key==='Escape') pinClear();
  }
});

// ══ FICHAJES PANEL ADMIN ══════════════════════════════════════
function timeToMins(t){ const[h,m]=(t||'00:00').split(':').map(Number); return h*60+m; }

async function loadFichajes(){
  const dateEl = document.getElementById('fichajesDate');
  if(!dateEl) return;
  const date = dateEl.value || isoDate(new Date());
  if(!dateEl.value) dateEl.value = date;
  const label = document.getElementById('fichajesFechaLabel');
  if(label) label.textContent = new Date(date+'T12:00:00').toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  const {data: fichsData} = await sb.from('fichajes').select('*').eq('fecha', date).order('creado_en');
  const fichs = fichsData || [];
  const hoy = isoDate(new Date());
  const d = parseDate(date);
  const activeWorkers = workers.filter(w=>{ const s=parseDate(w.inicio),e=parseDate(w.fin); return(!s||d>=s)&&(!e||d<=e); });

  let present=0,absent=0,onPause=0,done=0;
  const rows = activeWorkers.map(w=>{
    const wf = fichs.filter(f=>f.trabajador_id===w.id).sort((a,b)=>a.creado_en.localeCompare(b.creado_en));
    const entrada=wf.find(f=>f.tipo==='entrada');
    const pausaI=wf.find(f=>f.tipo==='pausa_inicio');
    const pausaF=wf.find(f=>f.tipo==='pausa_fin');
    const salida=wf.find(f=>f.tipo==='salida');
    if(!entrada) absent++;
    else if(salida){done++;present++;}
    else if(pausaI&&!pausaF){onPause++;present++;}
    else present++;
    let horas='—';
    if(entrada){
      const fin=salida?salida.hora:(date===hoy?new Date().toTimeString().substring(0,8):null);
      if(fin){ let m=timeToMins(fin)-timeToMins(entrada.hora); if(pausaI&&pausaF)m-=(timeToMins(pausaF.hora)-timeToMins(pausaI.hora)); if(m>0)horas=Math.floor(m/60)+'h '+(m%60)+'m'; }
    }
    const estado=!entrada?'none':salida?'out':pausaI&&!pausaF?'pause':'in';
    const estadoLabel=!entrada?'Sin fichar':salida?'Completado':pausaI&&!pausaF?'En pausa':'Trabajando';
    return{w,entrada,pausaI,pausaF,salida,horas,estado,estadoLabel};
  });

  const stats = document.getElementById('fichajesStats');
  if(stats) stats.innerHTML=`
    <div class="fich-stat"><div class="fich-stat-label">Presentes</div><div class="fich-stat-val" style="color:var(--green)">${present}</div></div>
    <div class="fich-stat"><div class="fich-stat-label">Ausentes</div><div class="fich-stat-val" style="color:var(--red)">${absent}</div></div>
    <div class="fich-stat"><div class="fich-stat-label">En pausa</div><div class="fich-stat-val" style="color:var(--amber)">${onPause}</div></div>
    <div class="fich-stat"><div class="fich-stat-label">Completados</div><div class="fich-stat-val" style="color:var(--blue)">${done}</div></div>
    <div class="fich-stat"><div class="fich-stat-label">Total esperados</div><div class="fich-stat-val">${activeWorkers.length}</div></div>`;

  const list = document.getElementById('fichajesList');
  if(list) list.innerHTML = rows.map(r=>`
    <div class="fich-row${!r.entrada?' absent':''}">
      <span style="font-weight:600;font-size:11px">${r.w.nombre}<br>
        <span class="fich-badge-${r.estado}">${r.estadoLabel}</span>
        <span style="font-size:10px;color:var(--text2);margin-left:4px">${r.w.turno==='both'?'8:30–22:00':r.w.turno==='morning'?'8:30–14:00':'17:00–22:00'}</span>
      </span>
      <span class="fich-time-cell${!r.entrada?' empty':''}">${r.entrada?r.entrada.hora.substring(0,5):'—'}</span>
      <span class="fich-time-cell fich-hide-sm${!r.pausaI?' empty':''}">${r.pausaI?r.pausaI.hora.substring(0,5):'—'}</span>
      <span class="fich-time-cell fich-hide-sm${!r.pausaF?' empty':''}">${r.pausaF?r.pausaF.hora.substring(0,5):'—'}</span>
      <span class="fich-time-cell${!r.salida?' empty':''}">${r.salida?r.salida.hora.substring(0,5):'—'}</span>
      <span class="fich-time-cell" style="color:var(--green);font-size:11px">${r.horas}</span>
    </div>`).join('') || '<div class="empty">Sin fichajes.</div>';

  const pins = document.getElementById('pinsList');
  if(pins) pins.innerHTML = workers.map(w=>`
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="avatar" style="width:30px;height:30px;font-size:11px;flex-shrink:0">${initials(w.nombre)}</div>
      <span style="flex:1;font-size:13px;font-weight:600">${w.nombre}</span>
      <div class="pin-chip"><code>${w.pin||'—'}</code><button class="copy-btn" onclick="navigator.clipboard.writeText('${w.pin||''}').then(()=>this.textContent='OK').catch(()=>{})">copiar</button></div>
    </div>`).join('');
}


// ══ HORARIO TIENDA ════════════════════════════════════════════
let tiendaDayOffset = 0;

function tiendaChangeDay(n){ tiendaDayOffset += n; renderTienda(); }
function tiendaGoToday(){ tiendaDayOffset = 0; renderTienda(); }

function renderTienda(){
  const today = new Date(); today.setHours(0,0,0,0);
  const date = new Date(today); date.setDate(today.getDate() + tiendaDayOffset);
  const ds = isoDate(date);
  const dow = date.getDay();

  document.getElementById('tiendaDayLabel').textContent =
    date.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
      .replace(/^./, c => c.toUpperCase());

  const grid = document.getElementById('tiendaGrid');
  if(!workers.length){ grid.innerHTML='<div class="empty">Sin trabajadores.</div>'; return; }

  // Check if festivo or domingo
  const festName = allFestivos()[ds];
  if(dow === 0){
    grid.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:var(--text2);font-size:15px">Domingo — Tienda cerrada</div>';
    return;
  }
  if(festName){
    grid.innerHTML = '<div class="card" style="text-align:center;padding:2rem;color:#3C3489;font-size:15px;background:#EEEDFE">Festivo: ' + festName + '</div>';
    return;
  }

  // Time slots: 8:30 to 22:00 in 30min intervals
  const slots = [];
  for(let h=8; h<=21; h++){
    slots.push({h, m:0,  label: h+':00'});
    slots.push({h, m:30, label: h+':30'});
  }
  slots.push({h:22, m:0, label:'22:00'});

  // For each worker, determine their status and work hours
  const workerData = workers.map(w => {
    const st = getDayStatus(w, date);
    const dh = Math.round(w.horas/5*10)/10;
    const half = Math.round(dh/2*10)/10;

    let mStart=null, mEnd=null, eStart=null, eEnd=null;
    if(st.type === 'work'){
      const totalMins = Math.round(w.horas/5*60); // minutes per day from contract
      if(w.turno==='morning'){
        // All hours in morning starting 8:30
        mStart={h:8,m:30};
        const endMins = 8*60+30+totalMins;
        mEnd={h:Math.floor(endMins/60),m:endMins%60};
      } else if(w.turno==='evening'){
        // All hours in evening starting 17:00
        eStart={h:17,m:0};
        const endMins = 17*60+totalMins;
        eEnd={h:Math.floor(endMins/60),m:endMins%60};
      } else {
        // both: split evenly — morning starts 8:30, evening starts 17:00
        const halfMins = Math.round(totalMins/2);
        mStart={h:8,m:30};
        const mEndMins = 8*60+30+halfMins;
        mEnd={h:Math.floor(mEndMins/60),m:mEndMins%60};
        eStart={h:17,m:0};
        const eEndMins = 17*60+halfMins;
        eEnd={h:Math.floor(eEndMins/60),m:eEndMins%60};
      }
    }
    return {w, st, dh, mStart, mEnd, eStart, eEnd};
  });

  // Separate working and non-working
  const working   = workerData.filter(d => d.st.type==='work');
  const nonWorking= workerData.filter(d => d.st.type!=='work');

  // Build timeline grid
  const totalMins = (22-8)*60; // 8:00 to 22:00 = 840 min
  const startMins = 8*60;

  function toPercent(h, m){ return ((h*60+m-startMins)/totalMins*100).toFixed(2)+'%'; }
  function widthPercent(h1,m1,h2,m2){ return (((h2*60+m2)-(h1*60+m1))/totalMins*100).toFixed(2)+'%'; }

  let html = '<div class="card" style="padding:1rem;overflow-x:auto">';

  // Time axis
  html += '<div style="position:relative;margin-left:160px;margin-bottom:8px;height:20px">';
  const timeLabels = [{h:8,m:30},{h:9,m:0},{h:10,m:0},{h:11,m:0},{h:12,m:0},{h:13,m:0},{h:14,m:0},{h:17,m:0},{h:18,m:0},{h:19,m:0},{h:20,m:0},{h:21,m:0},{h:22,m:0}];
  timeLabels.forEach(t => {
    html += '<span style="position:absolute;left:'+toPercent(t.h,t.m)+';font-size:10px;color:var(--text2);transform:translateX(-50%)">'+(t.h+':'+String(t.m).padStart(2,'0'))+'</span>';
  });
  html += '</div>';

  // Turno separators (shaded zones)
  html += '<div style="position:relative;margin-left:160px;height:10px;margin-bottom:4px;border-radius:4px;background:var(--bg2);overflow:hidden">';
  // Morning zone
  html += '<div style="position:absolute;left:'+toPercent(8,30)+';width:'+widthPercent(8,30,14,0)+';height:100%;background:rgba(29,158,117,.15)"></div>';
  // Evening zone
  html += '<div style="position:absolute;left:'+toPercent(17,0)+';width:'+widthPercent(17,0,22,0)+';height:100%;background:rgba(15,110,86,.15)"></div>';
  // Current time line
  const now = new Date();
  if(ds === isoDate(now)){
    const nowMins = now.getHours()*60+now.getMinutes();
    if(nowMins >= startMins && nowMins <= 22*60){
      html += '<div style="position:absolute;left:'+((nowMins-startMins)/totalMins*100).toFixed(2)+'%;width:2px;height:200%;background:var(--red);top:-50%;z-index:10"></div>';
    }
  }
  html += '</div>';

  // Worker rows
  working.forEach(({w, st, dh, mStart, mEnd, eStart, eEnd}) => {
    html += '<div style="display:flex;align-items:center;margin-bottom:6px;min-width:600px">';
    html += '<div style="width:155px;flex-shrink:0;padding-right:5px">';
    html += '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + w.nombre + '</div>';
    html += '<div style="font-size:10px;color:var(--text2)">' + dh + 'h · Libre ' + DAYS[w.dia_libre] + '</div>';
    html += '</div>';
    html += '<div style="flex:1;position:relative;height:36px;background:var(--bg2);border-radius:6px;overflow:hidden">';

    // Morning block
    if(mStart && mEnd){
      html += '<div style="position:absolute;left:'+toPercent(mStart.h,mStart.m)+';width:'+widthPercent(mStart.h,mStart.m,mEnd.h,mEnd.m)+';height:100%;background:var(--green);border-radius:4px;display:flex;align-items:center;justify-content:center">';
      html += '<span style="font-size:10px;color:#fff;font-weight:700;white-space:nowrap">'+mStart.h+':'+String(mStart.m).padStart(2,'0')+'–'+mEnd.h+':'+String(mEnd.m).padStart(2,'0')+'</span>';
      html += '</div>';
    }
    // Evening block
    if(eStart && eEnd){
      html += '<div style="position:absolute;left:'+toPercent(eStart.h,eStart.m)+';width:'+widthPercent(eStart.h,eStart.m,eEnd.h,eEnd.m)+';height:100%;background:var(--green2);border-radius:4px;display:flex;align-items:center;justify-content:center">';
      html += '<span style="font-size:10px;color:#fff;font-weight:700;white-space:nowrap">'+eStart.h+':'+String(eStart.m).padStart(2,'0')+'–'+eEnd.h+':'+String(eEnd.m).padStart(2,'0')+'</span>';
      html += '</div>';
    }
    html += '</div></div>';
  });

  html += '</div>'; // card

  // Non-working summary
  if(nonWorking.length){
    html += '<div class="card" style="margin-top:1rem">';
    html += '<div class="stitle">No trabajan hoy</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px">';
    nonWorking.forEach(({w, st}) => {
      const color = st.type==='baja'?'badge-baja':st.type==='vac'?'badge-vac':st.type==='festivo'?'badge-festivo':'badge-inactivo';
      const label = st.type==='baja'?'Baja':st.type==='vac'?'Vacaciones':st.type==='festivo'?'Festivo':st.type==='libre'?'Libre':'Inactivo';
      html += '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;background:var(--bg2);border-radius:var(--r);font-size:12px">';
      html += '<div class="avatar" style="width:26px;height:26px;font-size:10px">'+initials(w.nombre)+'</div>';
      html += '<span style="font-weight:600">'+w.nombre+'</span>';
      html += '<span class="badge '+color+'">'+label+'</span>';
      html += '</div>';
    });
    html += '</div></div>';
  }

  grid.innerHTML = html;
}

// ══ NAVEGACIÓN ════════════════════════════════════════════════
function changeWeek(n){weekOffset+=n;renderSchedule();if(document.getElementById('sumView')?.value==='weekly')renderSummary();}
function showTab(name,btn){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  if(btn)btn.classList.add('active');
  if(name==='tienda')renderTienda();
  if(name==='schedule')renderSchedule();
  if(name==='calendar')renderCalendar();
  if(name==='summary'){populateSumMonth();renderSummary();}
  if(name==='vacaciones')renderVacaciones();
  if(name==='audit')loadAudit();
  if(name==='fichajes'){
    document.getElementById('fichajesDate').value=isoDate(new Date());
    loadFichajes();
    updateHistWorkerSelect();
    if(!document.getElementById('histHasta').value){
      const hoy=new Date(),priMes=new Date(hoy.getFullYear(),hoy.getMonth(),1);
      document.getElementById('histDesde').value=isoDate(priMes);
      document.getElementById('histHasta').value=isoDate(hoy);
    }
  }
}

// ══ INIT ══════════════════════════════════════════════════════
(async function init(){
  const url=localStorage.getItem('sb_url'),key=localStorage.getItem('sb_key');
  if(url&&key){
    document.getElementById('cfgUrl').value=url;
    document.getElementById('cfgKey').value=key;
    sb=window.supabase.createClient(url,key);
    const{data:{session}}=await sb.auth.getSession();
    if(session){await onLogin(session.user);}else{showScreen('scLogin');}
    sb.auth.onAuthStateChange(async(ev,session)=>{
      if(ev==='SIGNED_IN'&&session)await onLogin(session.user);
      if(ev==='SIGNED_OUT')showScreen('scLogin');
    });
  }
})();
