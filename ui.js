/* ════════════════════════════════════════════════════════
   ui.js  UIコントローラー
   Responsibility: DOM操作・レンダリング専任。ビジネスロジック無し
   ════════════════════════════════════════════════════════ */
'use strict';

const UIController = (() => {

  const REGION_COLORS=['#1D6BB0','#0F7D5E','#7C3AED','#B45309','#BE1818','#0E6E80'];

  /* ── Stepper ────────────────────────────────────────── */
  function updateStepper(currentStep) {
    for (let i=1;i<=4;i++) {
      const btn=document.getElementById(`stepBtn${i}`), numEl=btn?.querySelector('.step-num');
      if (!btn) continue;
      btn.classList.toggle('is-active',i===currentStep); btn.classList.toggle('is-done',i<currentStep);
      btn.disabled=i>currentStep;
      if (numEl) numEl.innerHTML=i<currentStep?'<i class="fas fa-check"></i>':String(i);
    }
  }
  function showPanel(step) { for (let i=1;i<=4;i++) document.getElementById(`panel${i}`)?.classList.toggle('hidden',i!==step); }
  function updateStepNavHint(msg) { const el=document.getElementById('stepNavHint'); if(el)el.textContent=msg; }

  /* ── Accordion ──────────────────────────────────────── */
  function initAccordions() {
    document.querySelectorAll('.pgroup-hdr').forEach(hdr=>{
      hdr.addEventListener('click',()=>{
        const body=document.getElementById(hdr.dataset.target); if(!body)return;
        const opening=!hdr.classList.contains('is-open');
        hdr.classList.toggle('is-open',opening); body.classList.toggle('is-collapsed',!opening);
      });
    });
  }

  /* ── Sliders ────────────────────────────────────────── */
  const SLIDER_MAP=[['manualThresh','valManualThresh'],['adaptiveBlock','valAdaptiveBlock'],['adaptiveC','valAdaptiveC'],['horizLen','valHorizLen'],['horizThick','valHorizThick'],['horizDilate','valHorizDilate'],['vertLen','valVertLen'],['vertThick','valVertThick'],['vertDilate','valVertDilate'],['maskDilate','valMaskDilate']];
  function initSliders() {
    SLIDER_MAP.forEach(([sid,vid])=>{
      const s=document.getElementById(sid), v=document.getElementById(vid); if(!s||!v)return;
      s.addEventListener('input',()=>{ v.textContent=s.value; v.classList.add('is-flash'); setTimeout(()=>v.classList.remove('is-flash'),220); });
    });
  }

  /* ── Binary method toggle ───────────────────────────── */
  const BINARY_ROWS={manual:['rowManualThresh'],adaptive:['rowAdaptiveBlock','rowAdaptiveC']};
  const ALL_BIN=Object.values(BINARY_ROWS).flat();
  function initBinaryMethodToggle() {
    const sel=document.getElementById('binaryMethod'); if(!sel)return;
    const update=()=>{ ALL_BIN.forEach(id=>document.getElementById(id)?.classList.add('hidden')); (BINARY_ROWS[sel.value]||[]).forEach(id=>document.getElementById(id)?.classList.remove('hidden')); };
    sel.addEventListener('change',update); update();
  }

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ── Step 1 ─────────────────────────────────────────── */
  function showStep1Preview(canvas) {
    document.getElementById('dropZone')?.classList.add('hidden');
    document.getElementById('step1Preview')?.classList.remove('hidden');
    const c=document.getElementById('canvasSource'); if(c){c.width=canvas.width;c.height=canvas.height;c.getContext('2d').drawImage(canvas,0,0);}
    const d=document.getElementById('step1Dim'); if(d)d.textContent=`${canvas.width} × ${canvas.height}`;
  }
  function hideStep1Preview() { document.getElementById('dropZone')?.classList.remove('hidden'); document.getElementById('step1Preview')?.classList.add('hidden'); }

  /* ── Step 2: Source thumbnail ───────────────────────── */
  function renderSourceThumb(src) {
    const t=document.getElementById('canvasSourceThumb'); if(!t||!src)return;
    const sc=Math.min(1,140/src.width); t.width=Math.round(src.width*sc); t.height=Math.round(src.height*sc);
    t.getContext('2d').drawImage(src,0,0,t.width,t.height);
  }

  /* ── Step 2: Match progress ─────────────────────────── */
  function showMatchProgress(show,pct,msg) {
    document.getElementById('matchProgress')?.classList.toggle('hidden',!show); if(!show)return;
    const b=document.getElementById('matchProgressBar'), m=document.getElementById('matchProgressMsg');
    if(b)b.style.width=`${Math.round((pct||0)*100)}%`; if(m)m.textContent=msg||'照合中…';
  }
  function showMatchNoTpl(show) { document.getElementById('matchNoTpl')?.classList.toggle('hidden',!show); }

  /* ── Step 2: Template list ──────────────────────────── */
  function renderTemplateList(templates, onRemove) {
    const container=document.getElementById('templateList'); if(!container)return;
    if (!templates.length) { container.innerHTML='<div class="empty-hint"><i class="fas fa-layer-group"></i><span>テンプレート未登録</span></div>'; return; }
    const groups={};
    templates.forEach(t=>(groups[t.formName]=groups[t.formName]||[]).push(t));
    container.innerHTML='';
    Object.entries(groups).forEach(([name,items])=>{
      const grp=document.createElement('div'); grp.className='tpl-group';
      const hdr=document.createElement('div'); hdr.className='tpl-group-hdr';
      hdr.innerHTML=`<i class="fas fa-file-lines"></i><span>${esc(name)}</span><span class="tpl-count">${items.length}</span>`;
      grp.appendChild(hdr);
      items.forEach(t=>{
        const rc=(t.ocrRegions||[]).length, hasLayout=!!t.layoutAnchor;
        const item=document.createElement('div'); item.className=`tpl-item${t.isSample?' is-sample':''}`;
        item.innerHTML=`
          <img src="${t.identAnchor.dataURL}" class="tpl-thumb" alt="">
          <div class="tpl-info">
            <span class="tpl-part-name">${esc(t.identAnchor.name)}</span>
            <span class="tpl-offset">${hasLayout?'<i class="fas fa-layer-group" title="レイアウトアンカーあり"></i> ':''} ${rc>0?rc+' フィールド':'フィールド未設定'}</span>
          </div>
          ${t.isSample?'<span class="sample-badge">sample</span>':''}
          <button class="btn-icon-sm" title="削除"><i class="fas fa-xmark"></i></button>`;
        item.querySelector('button').addEventListener('click',()=>onRemove(t.id));
        grp.appendChild(item);
      });
      container.appendChild(grp);
    });
  }

  /* ── Step 2: Match results ──────────────────────────── */
  function clearMatchResults() {
    document.getElementById('matchResults')?.classList.add('hidden');
    const l=document.getElementById('matchResultsList'); if(l)l.innerHTML='';
  }
  function renderMatchResults(templates, resultMap, selectedId, fullCanvas, onSelect) {
    const section=document.getElementById('matchResults'), list=document.getElementById('matchResultsList'), count=document.getElementById('matchResultsCount');
    if(!section||!list)return;
    const sorted=templates.map(t=>({...t,...(resultMap.get(t.id)||{score:0,angle:0,loc:{x:0,y:0}})})).sort((a,b)=>b.score-a.score);
    section.classList.remove('hidden'); showMatchNoTpl(false);
    if(count)count.textContent=`${sorted.length} 件`; list.innerHTML='';
    sorted.forEach((item,idx)=>{
      const pct=Math.max(0,Math.round(item.score*100)), cls=item.score>=0.8?'score-hi':item.score>=0.5?'score-mid':'score-lo';
      const rankCls=idx<3?`rank-${idx+1}`:'', sign=item.angle>0?'+':'', isSel=item.id===selectedId;
      const rc=(item.ocrRegions||[]).length, hasLayout=!!item.layoutAnchor;
      const card=document.createElement('div');
      card.className=`result-card ${rankCls}${isSel?' is-selected':''}`;
      card.dataset.id=item.id; card.style.animationDelay=`${(idx*0.04).toFixed(2)}s`;
      card.innerHTML=`
        <div class="rc-rank">${idx+1}</div>
        <div class="rc-body">
          <div class="rc-names">
            <span class="rc-form">${esc(item.formName)}</span>
            <span class="rc-sep">/</span>
            <span class="rc-part">${esc(item.identAnchor?.name||'')}</span>
          </div>
          <div class="rc-score-row">
            <div class="rc-bar-wrap"><div class="rc-bar ${cls}" style="width:${pct}%"></div></div>
            <span class="rc-score-val ${cls}">${item.score.toFixed(4)}</span>
          </div>
          <div class="rc-meta">
            <span class="meta-chip"><i class="fas fa-rotate"></i> ${sign}${item.angle}°</span>
            <span class="meta-chip"><i class="fas fa-location-dot"></i> (${item.loc.x},${item.loc.y})</span>
            ${hasLayout?'<span class="meta-chip"><i class="fas fa-layer-group"></i> レイアウトあり</span>':''}
            <span class="meta-chip"><i class="fas fa-crosshairs"></i> ${rc}フィールド</span>
          </div>
        </div>
        <div class="rc-actions">
          <canvas class="rc-thumb" title="${esc(item.identAnchor?.name||'')}のマッチング位置"></canvas>
          <button class="btn btn-sm ${isSel?'btn-primary':'btn-outline'}" data-id="${item.id}">${isSel?'<i class="fas fa-check"></i> 選択中':'選択'}</button>
        </div>`;
      const thumb=MatcherEngine.drawMatchResult(fullCanvas,{w:item.identAnchor?.natW||80,h:item.identAnchor?.natH||40},item.loc,item.angle,120);
      const tc=card.querySelector('.rc-thumb'); tc.width=thumb.width; tc.height=thumb.height; tc.getContext('2d').drawImage(thumb,0,0);
      card.querySelector('button[data-id]').addEventListener('click',()=>onSelect(item.id));
      list.appendChild(card);
    });
  }
  function updateSelectedMatch(selectedId) {
    document.querySelectorAll('.result-card').forEach(card=>{
      const isSel=card.dataset.id===selectedId; card.classList.toggle('is-selected',isSel);
      const btn=card.querySelector('button[data-id]'); if(btn){btn.className=`btn btn-sm ${isSel?'btn-primary':'btn-outline'}`; btn.innerHTML=isSel?'<i class="fas fa-check"></i> 選択中':'選択';}
    });
  }

  /* ── Step 2: テンプレートモーダルのフィールドリスト ── */
  function renderRegionList(regions, onRemove) {
    const c=document.getElementById('regionList'); if(!c)return;
    if (!regions.length) { c.innerHTML='<div class="region-empty-hint">フィールドを追加してください（省略可）</div>'; return; }
    c.innerHTML='';
    regions.forEach((r,i)=>{
      const color=REGION_COLORS[i%REGION_COLORS.length], item=document.createElement('div');
      item.className='region-item';
      item.innerHTML=`<span class="region-color-dot" style="background:${color}"></span><span class="region-num">${i+1}</span><span class="region-name">${esc(r.name)}</span><span class="region-pos">dx:${r.dx} dy:${r.dy} ${r.w}×${r.h}px</span><button class="btn-icon-sm" title="削除"><i class="fas fa-xmark"></i></button>`;
      item.querySelector('button').addEventListener('click',()=>onRemove(r.id));
      c.appendChild(item);
    });
  }

  /* ── Step 3 ─────────────────────────────────────────── */
  function showRotationBanner(angle) {
    const b=document.getElementById('rotBanner'), t=document.getElementById('rotBannerText'); if(!b)return;
    if(Math.abs(angle)<0.01){b.classList.add('hidden');return;} b.classList.remove('hidden'); if(t)t.textContent=`回転補正: ${angle>0?'+':''}${angle}°`;
  }
  function updateCanvases(mats, processor) {
    mats.forEach((mat,i)=>{
      const canvas=document.getElementById(`canvas${i}`), dim=document.getElementById(`dim${i}`);
      if(!canvas||!mat)return; processor.renderToCanvas(mat,canvas); if(dim)dim.textContent=`${mat.cols} × ${mat.rows}`;
    });
  }

  /* ── Step 4: OCR情報パネル ──────────────────────────── */
  function updateOcrInfo(template, result, hasLayoutAnchor) {
    const fn=document.getElementById('infoFormName'), idn=document.getElementById('infoIdentName');
    const ltn=document.getElementById('infoLayoutName'), ang=document.getElementById('infoAngle');
    const regEl=document.getElementById('infoRegions');
    if(fn)  fn.textContent=template.formName;
    if(idn) idn.textContent=template.identAnchor?.name||'—';
    if(ltn) ltn.textContent=hasLayoutAnchor ? (template.layoutAnchor?.name||'レイアウトあり') : '識別アンカーを使用';
    if(ang) ang.textContent=`${result.angle>0?'+':''}${result.angle}°`;
    if (regEl) {
      const regions=template.ocrRegions||[];
      if (!regions.length) { regEl.innerHTML='<span style="color:var(--c-text-3);font-size:.73rem">フィールド未設定</span>'; return; }
      regEl.innerHTML='';
      regions.forEach((r,i)=>{ const col=REGION_COLORS[i%REGION_COLORS.length]; const chip=document.createElement('span'); chip.className='info-region-chip'; chip.style.borderColor=col; chip.style.color=col; chip.innerHTML=`<span class="region-color-dot" style="background:${col}"></span>${i+1}. ${esc(r.name)}`; regEl.appendChild(chip); });
    }
  }

  /* ── Step 4: OCR領域プレビュー（全フィールド色分け） ── */
  function renderOcrRegionPreview(resultCanvas, loc, ocrRegions) {
    const c=document.getElementById('canvasOcrPreview'); if(!c||!resultCanvas||resultCanvas.width===0)return;
    const wrap=c.parentElement, maxW=(wrap?.clientWidth||600)-16, maxH=(wrap?.clientHeight||400)-16;
    const scale=Math.min(1,maxW/resultCanvas.width,maxH/resultCanvas.height);
    c.width=Math.round(resultCanvas.width*scale); c.height=Math.round(resultCanvas.height*scale);
    const ctx=c.getContext('2d'); ctx.drawImage(resultCanvas,0,0,c.width,c.height);
    if (!ocrRegions||!ocrRegions.length) return;
    ocrRegions.forEach((region,i)=>{
      const col=REGION_COLORS[i%REGION_COLORS.length];
      const rx=Math.round((loc.x+region.dx)*scale), ry=Math.round((loc.y+region.dy)*scale);
      const rw=Math.max(2,Math.round(region.w*scale)), rh=Math.max(2,Math.round(region.h*scale));
      ctx.fillStyle=col+'28'; ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(rx,ry,rw,rh);
      const bx=rx+1, by=Math.max(8,ry-1);
      ctx.fillStyle=col; ctx.beginPath(); ctx.arc(bx+7,by-7,8,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#fff'; ctx.font='bold 9px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(i+1),bx+7,by-7); ctx.textAlign='left'; ctx.textBaseline='alphabetic';
      const lx=bx+18, ly=by-14; ctx.font='10px sans-serif';
      const tw=ctx.measureText(region.name).width;
      ctx.fillStyle=col+'CC'; ctx.fillRect(lx-2,ly,tw+6,14);
      ctx.fillStyle='#fff'; ctx.textBaseline='middle'; ctx.fillText(region.name,lx,ly+7); ctx.textBaseline='alphabetic';
    });
  }

  /* ── Step 4: OCR Panel ──────────────────────────────── */
  function showOcrPanel(show)  { document.getElementById('ocrPanel')?.classList.toggle('hidden',!show); }
  function showOcrProgress(sp) { document.getElementById('ocrProgress')?.classList.toggle('hidden',!sp); document.getElementById('ocrResult')?.classList.toggle('hidden',sp); }
  function updateOcrProgress(status,progress) {
    const f=document.getElementById('ocrProgressFill'), m=document.getElementById('ocrProgressMsg');
    if(f)f.style.width=`${Math.round((progress||0)*100)}%`; if(m)m.textContent=status||'処理中…';
  }

  /* ── Step 4: フィールドごとの認識結果 ──────────────── */
  function renderMultiOcrResults(fieldResults) {
    const c=document.getElementById('ocrFieldResults'), stat=document.getElementById('ocrStat');
    if(!c)return; c.innerHTML=''; if(stat)stat.textContent=`${fieldResults.length} フィールド`;
    fieldResults.forEach((fr,i)=>{
      const col=REGION_COLORS[i%REGION_COLORS.length];
      let avgConf=0, confCls='none';
      if (!fr.error&&fr.words?.length>0) { avgConf=Math.round(fr.words.reduce((s,w)=>s+w.confidence,0)/fr.words.length); confCls=avgConf>=85?'hi':avgConf>=60?'mid':'lo'; }
      const txt=fr.error?`[エラー: ${fr.error}]`:(fr.fullText||'').trim();
      const row=document.createElement('div'); row.className='ocr-field-row'; row.dataset.name=fr.region.name; row.dataset.text=txt;
      row.style.animationDelay=`${(i*0.06).toFixed(2)}s`;
      row.innerHTML=`
        <div class="ocr-field-hdr">
          <span class="region-color-dot" style="background:${col}"></span>
          <span class="field-seq">${i+1}</span>
          <span class="field-name">${esc(fr.region.name)}</span>
          ${fr.error?'<span class="conf-badge conf-lo">ERR</span>':`<span class="conf-badge conf-${confCls}">${avgConf>0?avgConf+'%':'—'}</span>`}
          <button class="btn btn-sm btn-outline copy-field-btn" title="${esc(fr.region.name)} をコピー"><i class="fas fa-copy"></i></button>
        </div>
        <textarea class="ocr-field-text" readonly>${escHtml(txt)}</textarea>`;
      row.querySelector('.copy-field-btn').addEventListener('click',()=>{
        navigator.clipboard.writeText(txt).then(()=>showToast(`「${fr.region.name}」をコピーしました`,'success')).catch(()=>showToast('コピーに失敗しました','error'));
      });
      c.appendChild(row);
    });
  }

  /* ── Toast ──────────────────────────────────────────── */
  const TOAST_ICONS={success:'fa-circle-check',error:'fa-circle-xmark',warning:'fa-triangle-exclamation',info:'fa-circle-info'};
  function showToast(message,type='info',duration=2800) {
    const container=document.getElementById('toastContainer'); if(!container)return;
    const toast=document.createElement('div'); toast.className=`toast toast-${type}`;
    toast.innerHTML=`<i class="fas ${TOAST_ICONS[type]||TOAST_ICONS.info}"></i><span>${message}</span>`;
    container.appendChild(toast); requestAnimationFrame(()=>toast.classList.add('is-visible'));
    setTimeout(()=>{ toast.classList.remove('is-visible'); setTimeout(()=>{try{container.removeChild(toast);}catch{}},280); },duration);
  }

  /* ── Modals ─────────────────────────────────────────── */
  function initModals() {
    document.querySelectorAll('.modal-overlay').forEach(o=>{
      if (o.id === 'tplModal') return; // テンプレートモーダルは誤操作で閉じないよう除外
      o.addEventListener('click',e=>{if(e.target===o)o.classList.add('hidden');});
    });
    document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m=>m.classList.add('hidden')); });
  }
  function openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

  /* ── Public API ─────────────────────────────────────── */
  return {
    REGION_COLORS,
    updateStepper, showPanel, updateStepNavHint,
    initAccordions, initSliders, initBinaryMethodToggle,
    showStep1Preview, hideStep1Preview, renderSourceThumb,
    showMatchProgress, showMatchNoTpl, renderTemplateList,
    clearMatchResults, renderMatchResults, updateSelectedMatch,
    renderRegionList,
    showRotationBanner, updateCanvases,
    updateOcrInfo, renderOcrRegionPreview,
    showOcrPanel, showOcrProgress, updateOcrProgress, renderMultiOcrResults,
    showToast, initModals, openModal, closeModal,
  };
})();
