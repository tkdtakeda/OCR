/* ════════════════════════════════════════════════════════
   app.js  アプリケーションコントローラー
   テンプレート構造:
     identAnchor  … 帳票識別・傾き補正（マッチスコア重要）
     layoutAnchor … OCR座標原点（スキャンずれ吸収、null可）
     ocrRegions   … layoutAnchor or identAnchor からの相対座標
   ════════════════════════════════════════════════════════ */
'use strict';

(function () {

  /* ── State ──────────────────────────────────────────── */
  const state = {
    step: 1, cvReady: false,
    sourceCanvas: null, isSample: false,
    templates: [],       // {id, formName, identAnchor, layoutAnchor, ocrRegions[], isSample}
    matchResults: null,  // Map<id, {score, angle, loc}> — 識別アンカーのみ
    selectedId: null,
    matchSettings: { angleRange: 2, angleStep: 1 },
    rotatedCanvas: null,
    layoutMatchLoc: null, // {x,y} Step3でレイアウトアンカーをマッチした結果
    processedMats: [],
    ocrRunning: false,
  };

  /* ── Helpers ────────────────────────────────────────── */
  function uid() { return Math.random().toString(36).slice(2,11); }
  function debounce(fn,ms) { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }
  const $ = id => document.getElementById(id);

  /* ── CV lifecycle ───────────────────────────────────── */
  document.addEventListener('cv-ready', () => {
    state.cvReady = true; $('loadingOverlay').classList.add('hidden');
    UIController.showToast('OpenCV.js の準備が完了しました', 'success');
  });
  document.addEventListener('cv-error', () => {
    $('loadingMsg').textContent = '読み込み失敗。インターネット接続を確認してください。';
    UIController.showToast('OpenCV.js の読み込みに失敗しました', 'error', 6000);
  });

  /* ── Step Navigation ────────────────────────────────── */
  function canAdvance() {
    switch (state.step) {
      case 1: return !!state.sourceCanvas;
      case 2: return !!state.matchResults;
      case 3: return state.processedMats.length > 0;
      default: return false;
    }
  }
  function updateNavButtons() {
    $('btnPrev').disabled = state.step <= 1;
    $('btnNext').disabled = state.step >= 4 || !canAdvance();
    const hints = {
      1: state.sourceCanvas ? '✓ 画像が読み込まれました — 「次へ」を押してください' : '帳票画像を貼り付けまたはドロップしてください',
      2: state.matchResults  ? '✓ 照合完了 — 「次へ」で回転補正・罫線除去に進みます' : 'テンプレートを登録して「照合実行」を押してください',
      3: state.processedMats.length > 0 ? '✓ 罫線除去完了 — 「次へ」でOCRに進みます' : '処理中…',
      4: '「OCR実行」で全フィールドを一括認識します',
    };
    UIController.updateStepNavHint(hints[state.step] || '');
  }
  function goToStep(n) {
    if (n<1||n>4) return;
    if (n>state.step && !canAdvance()) { UIController.showToast('前の手順を完了してください','warning'); return; }
    state.step = n;
    UIController.updateStepper(n); UIController.showPanel(n);
    updateNavButtons(); onStepEnter(n);
  }
  function onStepEnter(step) {
    if (step===2) {
      UIController.renderSourceThumb(state.sourceCanvas);
      $('btnRunMatch').disabled = state.templates.length===0;
      UIController.showMatchNoTpl(state.templates.length===0 && !state.matchResults);
    }
    if (step===3) applyRotationAndProcess();
    if (step===4) enterStep4();
  }

  /* ── Image Loading ──────────────────────────────────── */
  function drawToCanvas(src) {
    const c=document.createElement('canvas');
    c.width=src.naturalWidth||src.width; c.height=src.naturalHeight||src.height;
    c.getContext('2d').drawImage(src,0,0); return c;
  }
  function setSourceImage(canvas, asSample) {
    state.sourceCanvas=canvas; state.isSample=!!asSample;
    state.matchResults=null; state.selectedId=null; state.rotatedCanvas=null; state.layoutMatchLoc=null;
    LineRemovalProcessor.cleanupMats(state.processedMats); state.processedMats=[];
    UIController.clearMatchResults(); UIController.showStep1Preview(canvas);
    $('btnSampleClear').style.display = asSample ? 'inline-flex' : 'none';
    updateNavButtons();
  }
  function loadImageFromBlob(blob) {
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{ setSourceImage(drawToCanvas(img)); URL.revokeObjectURL(url); UIController.showToast('画像を読み込みました','success'); };
    img.src=url;
  }
  function handlePasteEvent(e) {
    // モーダルが開いている場合は識別/レイアウトへルーティング
    if (!$('tplModal').classList.contains('hidden')) {
      for (const item of (e.clipboardData?.items||[])) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          if (_useLayoutAnchor && _lastPasteTarget==='layout') setLayoutImage(item.getAsFile());
          else setIdentImage(item.getAsFile());
          return;
        }
      }
      return;
    }
    for (const item of (e.clipboardData?.items||[])) {
      if (item.type.startsWith('image/')) { e.preventDefault(); loadImageFromBlob(item.getAsFile()); return; }
    }
    UIController.showToast('クリップボードに画像がありません','warning');
  }
  async function handlePasteButton() {
    try {
      const items=await navigator.clipboard.read();
      for (const item of items) {
        const t=item.types.find(x=>x.startsWith('image/'));
        if (t) { loadImageFromBlob(await item.getType(t)); return; }
      }
      UIController.showToast('クリップボードに画像がありません','warning');
    } catch { UIController.showToast('Ctrl+V で直接貼り付けてください','info'); }
  }

  /* ── Template Management ────────────────────────────── */
  function addTemplate(formName, identAnchor, layoutAnchor, ocrRegions, isSample) {
    state.templates.push({ id:uid(), formName, identAnchor, layoutAnchor, ocrRegions:ocrRegions||[], isSample:!!isSample });
    UIController.renderTemplateList(state.templates, removeTemplate);
    $('btnRunMatch').disabled=false; UIController.showMatchNoTpl(false); updateNavButtons();
  }
  function removeTemplate(id) {
    state.templates=state.templates.filter(t=>t.id!==id);
    if (state.selectedId===id) { state.selectedId=null; state.matchResults=null; UIController.clearMatchResults(); }
    UIController.renderTemplateList(state.templates, removeTemplate);
    if (state.templates.length===0) { $('btnRunMatch').disabled=true; UIController.showMatchNoTpl(true); }
    updateNavButtons();
  }
  function clearSampleTemplates() {
    const had=state.templates.some(t=>t.isSample);
    if (!had) { UIController.showToast('サンプルテンプレートはありません','info'); return; }
    state.templates=state.templates.filter(t=>!t.isSample);
    if (state.selectedId&&!state.templates.find(t=>t.id===state.selectedId)) {
      state.selectedId=null; state.matchResults=null; UIController.clearMatchResults();
    }
    UIController.renderTemplateList(state.templates, removeTemplate);
    if (state.templates.length===0) { $('btnRunMatch').disabled=true; UIController.showMatchNoTpl(true); }
    updateNavButtons(); UIController.showToast('サンプルテンプレートを削除しました','info');
  }

  /* ── Template Modal State ───────────────────────────── */
  const RCOLS=['#1D6BB0','#0F7D5E','#7C3AED','#B45309','#BE1818','#0E6E80'];
  // キャンバス表示幅の目標値と最大拡大率（小さな画像も見やすく拡大、ぼやけ過ぎは抑制）
  const CANVAS_W=560, CANVAS_MAX_SCALE=2.5;
  function fitScale(natW) { return natW>0 ? Math.min(CANVAS_MAX_SCALE, CANVAS_W/natW) : 1; }
  let _identDataURL=null, _identNatW=0, _identNatH=0, _identImgEl=null, _identScale=1;
  let _useLayoutAnchor=false, _lastPasteTarget='ident';
  let _layoutDataURL=null, _layoutNatW=0, _layoutNatH=0, _layoutImgEl=null, _layoutScale=1;
  let _tplRegions=[];
  let _isDrawing=false, _ds={x:0,y:0}, _dc={x:0,y:0};
  let _pendingRegion=null; // ドラッグで確定したがフィールド名未入力の保留領域 {dx,dy,w,h}

  function _activeImgEl() { return _useLayoutAnchor ? _layoutImgEl : _identImgEl; }
  function _activeScale()  { return _useLayoutAnchor ? _layoutScale  : _identScale;  }

  function openTplModal() {
    _identDataURL=null; _identNatW=0; _identNatH=0; _identImgEl=null; _identScale=1;
    _layoutDataURL=null; _layoutNatW=0; _layoutNatH=0; _layoutImgEl=null; _layoutScale=1;
    _useLayoutAnchor=false; _lastPasteTarget='ident'; _tplRegions=[]; _isDrawing=false; _pendingRegion=null;
    // ?. で全アクセスを保護（旧HTMLや要素未存在時のTypeErrorを防止）
    const fn=$('tplFormName'), an=$('tplIdentName'), rn=$('regName');
    if(fn)fn.value=''; if(an)an.value=''; if(rn)rn.value='';
    const ip=$('identPreview'), ih=$('identDropHint');
    if(ip)ip.style.display='none'; if(ih)ih.style.display='flex';
    $('layoutDropArea')?.classList.add('hidden');
    const ua=$('useLayoutAnchor'); if(ua)ua.checked=false;
    const lp=$('layoutPreview'), lh=$('layoutDropHint');
    if(lp){lp.src=''; lp.style.display='none';} if(lh)lh.style.display='flex';
    $('canvasSection')?.classList.add('hidden');
    const cv=$('layoutCanvas'); if(cv){cv.style.display='none'; cv.width=0; cv.height=0;}
    const cp=$('canvasPlaceholder'); if(cp)cp.style.display='flex';
    UIController.renderRegionList(_tplRegions, removeRegionFromModal);
    UIController.openModal('tplModal'); setTimeout(()=>$('tplFormName')?.focus(),60);
  }

  /* ── 識別アンカー画像設定 ──────────────────────────── */
  function setIdentImage(blob) {
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{
      _identImgEl=img; _identNatW=img.naturalWidth; _identNatH=img.naturalHeight;
      _identScale=fitScale(_identNatW);
      const c=document.createElement('canvas'); c.width=_identNatW; c.height=_identNatH;
      c.getContext('2d').drawImage(img,0,0); _identDataURL=c.toDataURL('image/png');
      URL.revokeObjectURL(url);
      $('identPreview').src=_identDataURL; $('identPreview').style.display='block';
      $('identDropHint').style.display='none';
      if (!_useLayoutAnchor) updateCanvasSection();
    };
    img.src=url;
  }

  /* ── レイアウトアンカー画像設定 ────────────────────── */
  function setLayoutImage(blob) {
    const url=URL.createObjectURL(blob), img=new Image();
    img.onload=()=>{
      _layoutImgEl=img; _layoutNatW=img.naturalWidth; _layoutNatH=img.naturalHeight;
      _layoutScale=fitScale(_layoutNatW);
      const c=document.createElement('canvas'); c.width=_layoutNatW; c.height=_layoutNatH;
      c.getContext('2d').drawImage(img,0,0); _layoutDataURL=c.toDataURL('image/png');
      URL.revokeObjectURL(url);
      $('layoutPreview').src=_layoutDataURL; $('layoutPreview').style.display='block';
      $('layoutDropHint').style.display='none';
      updateCanvasSection();
    };
    img.src=url;
  }

  /* ── キャンバスセクション更新 ──────────────────────── */
  function updateCanvasSection() {
    const section=$('canvasSection'), canvas=$('layoutCanvas'), ph=$('canvasPlaceholder');
    if (!section) return;
    section.classList.remove('hidden');
    const img=_activeImgEl();
    if (img) { canvas.style.display='block'; ph.style.display='none'; redrawCanvas(); }
    else      { canvas.style.display='none';  ph.style.display='flex'; }
    setTimeout(()=>section.scrollIntoView({behavior:'smooth',block:'nearest'}), 60);
  }

  /* ── レイアウトモード切替 ──────────────────────────── */
  function toggleLayoutMode() {
    _useLayoutAnchor=$('useLayoutAnchor').checked;
    $('layoutDropArea')?.classList.toggle('hidden',!_useLayoutAnchor);
    updateCanvasSection();
  }

  /* ── キャンバス再描画 ──────────────────────────────── */
  function redrawCanvas() {
    const c=$('layoutCanvas'), img=_activeImgEl(); if (!c||!img) return;
    const sc=_activeScale();
    c.width=Math.round(img.naturalWidth*sc); c.height=Math.round(img.naturalHeight*sc);
    const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,c.width,c.height);
    _tplRegions.forEach((r,i)=>{
      const col=RCOLS[i%RCOLS.length];
      const [rx,ry,rw,rh]=[r.dx*sc,r.dy*sc,r.w*sc,r.h*sc].map(Math.round);
      ctx.fillStyle=col+'28'; ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle=col; ctx.lineWidth=2; ctx.strokeRect(rx,ry,rw,rh);
      ctx.fillStyle=col; ctx.font='bold 10px sans-serif'; ctx.textBaseline='top';
      ctx.fillText(`${i+1}. ${r.name}`,rx+3,ry+2); ctx.textBaseline='alphabetic';
    });
    if (_isDrawing) {
      const [x1,y1]=[Math.min(_ds.x,_dc.x),Math.min(_ds.y,_dc.y)];
      const [dw,dh]=[Math.abs(_dc.x-_ds.x),Math.abs(_dc.y-_ds.y)];
      ctx.strokeStyle='#FF6B00'; ctx.lineWidth=2;
      ctx.setLineDash([4,3]); ctx.strokeRect(x1,y1,dw,dh); ctx.setLineDash([]);
      ctx.fillStyle='rgba(255,107,0,0.12)'; ctx.fillRect(x1,y1,dw,dh);
    } else if (_pendingRegion) {
      // 確定済みだがフィールド名待ちの保留領域
      const [rx,ry,rw,rh]=[_pendingRegion.dx*sc,_pendingRegion.dy*sc,_pendingRegion.w*sc,_pendingRegion.h*sc].map(Math.round);
      ctx.fillStyle='rgba(255,107,0,0.18)'; ctx.fillRect(rx,ry,rw,rh);
      ctx.strokeStyle='#FF6B00'; ctx.lineWidth=2;
      ctx.setLineDash([5,3]); ctx.strokeRect(rx,ry,rw,rh); ctx.setLineDash([]);
      ctx.fillStyle='#FF6B00'; ctx.font='bold 10px sans-serif'; ctx.textBaseline='top';
      ctx.fillText('フィールド名を入力 → Enter', rx+3, ry+2); ctx.textBaseline='alphabetic';
    }
  }

  /* ── 矩形ドラッグ完了 → 保留領域として確定 ─────────── */
  function finishDrawRegion() {
    if (!_activeImgEl()) { _pendingRegion=null; return; }
    const sc=_activeScale();
    const [x1,y1]=[Math.min(_ds.x,_dc.x),Math.min(_ds.y,_dc.y)];
    const [dw,dh]=[Math.abs(_dc.x-_ds.x),Math.abs(_dc.y-_ds.y)];
    if (dw<5||dh<5) { _pendingRegion=null; redrawCanvas(); return; }
    _pendingRegion={ dx:Math.round(x1/sc), dy:Math.round(y1/sc), w:Math.round(dw/sc), h:Math.round(dh/sc) };
    redrawCanvas();
    // フィールド名が既に入力済みなら即確定、未入力なら名前入力を促す
    if ($('regName').value.trim()) commitPendingRegion();
    else { UIController.showToast('フィールド名を入力して Enter キーで確定してください','info',2200); $('regName').focus(); }
  }

  /* ── 保留領域をフィールドとして確定 ────────────────── */
  function commitPendingRegion() {
    if (!_pendingRegion) { UIController.showToast('先に画像上でドラッグして範囲を指定してください','warning'); return; }
    const name=$('regName').value.trim();
    if (!name) { UIController.showToast('フィールド名を入力してください','warning'); $('regName').focus(); return; }
    _tplRegions.push({ id:uid(), name, ..._pendingRegion });
    _pendingRegion=null;
    UIController.renderRegionList(_tplRegions, removeRegionFromModal);
    redrawCanvas();
    $('regName').value=''; $('regName').focus();
    UIController.showToast(`「${name}」を追加しました`,'success',1400);
  }

  function removeRegionFromModal(id) {
    _tplRegions=_tplRegions.filter(r=>r.id!==id);
    UIController.renderRegionList(_tplRegions, removeRegionFromModal);
    redrawCanvas();
  }

  /* ── キャンバスイベント初期化（init時に1回のみ） ──── */
  function initModalCanvas() {
    const c=$('layoutCanvas'); if (!c) return;
    c.addEventListener('mousedown', e=>{
      if (!_activeImgEl()) return;
      _isDrawing=true; _ds={x:e.offsetX,y:e.offsetY}; _dc={..._ds};
    });
    c.addEventListener('mousemove', e=>{ if (!_isDrawing) return; _dc={x:e.offsetX,y:e.offsetY}; redrawCanvas(); });
    c.addEventListener('mouseup',   e=>{ if (!_isDrawing) return; _dc={x:e.offsetX,y:e.offsetY}; _isDrawing=false; finishDrawRegion(); });
    c.addEventListener('mouseleave',()=>{ if (_isDrawing) { _isDrawing=false; redrawCanvas(); } });
  }

  /* ── テンプレート登録 ───────────────────────────────── */
  function registerTemplate() {
    const fn=$('tplFormName').value.trim(), an=$('tplIdentName').value.trim();
    if (!fn) { $('tplFormName').focus(); UIController.showToast('帳票名を入力してください','warning'); return; }
    if (!an) { $('tplIdentName').focus(); UIController.showToast('アンカー名を入力してください','warning'); return; }
    if (!_identDataURL) { UIController.showToast('識別アンカー画像を設定してください','warning'); return; }
    const identAnchor={ name:an, dataURL:_identDataURL, natW:_identNatW, natH:_identNatH };
    const layoutAnchor=(_useLayoutAnchor&&_layoutDataURL)
      ? { name:'レイアウト参照', dataURL:_layoutDataURL, natW:_layoutNatW, natH:_layoutNatH }
      : null;
    addTemplate(fn, identAnchor, layoutAnchor, [..._tplRegions], false);
    UIController.closeModal('tplModal');
    UIController.showToast(`「${fn} / ${an}」を登録しました（${_tplRegions.length}フィールド）`,'success');
  }

  /* ── Matching ───────────────────────────────────────── */
  function dataURLtoImg(url) {
    return new Promise((res,rej)=>{ const img=new Image(); img.onload=()=>res(img); img.onerror=()=>rej(new Error('load fail')); img.src=url; });
  }
  async function runMatching() {
    if (!state.cvReady) { UIController.showToast('OpenCV.js 読み込み中です','warning'); return; }
    if (!state.sourceCanvas||state.templates.length===0) return;
    $('btnRunMatch').disabled=true;
    UIController.showMatchProgress(true,0,'テンプレートを準備中…'); await new Promise(r=>setTimeout(r,50));
    try {
      const tplImgs=await Promise.all(
        state.templates.map(async t=>({ id:t.id, imageElement:await dataURLtoImg(t.identAnchor.dataURL) }))
      );
      UIController.showMatchProgress(true,0.3,'識別アンカーを照合中…'); await new Promise(r=>setTimeout(r,0));
      const resultMap=MatcherEngine.matchAll(state.sourceCanvas,tplImgs,
        { angleRange:state.matchSettings.angleRange, angleStep:state.matchSettings.angleStep });
      UIController.showMatchProgress(true,1,'完了'); await new Promise(r=>setTimeout(r,200));
      UIController.showMatchProgress(false);
      state.matchResults=resultMap;
      let bestId=null, bestScore=-Infinity;
      state.templates.forEach(t=>{ const r=resultMap.get(t.id); if(r&&r.score>bestScore){bestScore=r.score;bestId=t.id;} });
      state.selectedId=bestId;
      UIController.renderMatchResults(state.templates,state.matchResults,state.selectedId,state.sourceCanvas,selectMatch);
      updateNavButtons();
      UIController.showToast(`照合完了 — 最高スコア ${bestScore.toFixed(4)}`,'success');
    } catch(e) {
      UIController.showMatchProgress(false);
      UIController.showToast(`照合エラー: ${e.message||e}`,'error');
    } finally { $('btnRunMatch').disabled=false; }
  }
  function selectMatch(id) { state.selectedId=id; UIController.updateSelectedMatch(id); }

  /* ── Line Removal ───────────────────────────────────── */
  function getParams() {
    const v=id=>$(id), vi=id=>parseInt($(id).value,10);
    return {
      binaryMethod:v('binaryMethod').value, manualThresh:vi('manualThresh'),
      adaptiveBlock:vi('adaptiveBlock'), adaptiveC:vi('adaptiveC'),
      enableHoriz:v('enableHoriz').checked, horizLen:vi('horizLen'),
      horizThick:vi('horizThick'), horizDilate:vi('horizDilate'),
      enableVert:v('enableVert').checked, vertLen:vi('vertLen'),
      vertThick:vi('vertThick'), vertDilate:vi('vertDilate'),
      maskDilate:vi('maskDilate'), outputBase:v('outputBase').value,
    };
  }
  function getSelectedResult()   { if (!state.matchResults||!state.selectedId) return null; return state.matchResults.get(state.selectedId)||null; }
  function getSelectedTemplate() { return state.templates.find(t=>t.id===state.selectedId)||null; }

  /* ── 回転補正 + レイアウトマッチ + 罫線除去 ────────── */
  async function applyRotationAndProcess() {
    if (!state.cvReady||!state.sourceCanvas) return;
    const identResult=getSelectedResult();
    const angle=identResult?.angle||0;
    state.rotatedCanvas=LineRemovalProcessor.rotateCanvas(state.sourceCanvas,angle);
    UIController.showRotationBanner(angle);
    const tpl=getSelectedTemplate();
    if (tpl?.layoutAnchor) {
      // 回転補正済み画像でレイアウトアンカーをマッチ → OCR座標の原点を確定
      state.layoutMatchLoc=await matchLayoutAnchor(state.rotatedCanvas,tpl.layoutAnchor);
    } else {
      state.layoutMatchLoc=identResult?.loc||{x:0,y:0};
    }
    runLineRemoval();
  }

  /* ── レイアウトアンカー照合（角度固定・位置探索のみ） ─ */
  async function matchLayoutAnchor(rotatedCanvas, layoutAnchor) {
    try {
      const img=await dataURLtoImg(layoutAnchor.dataURL);
      const map=MatcherEngine.matchAll(rotatedCanvas,[{id:'_lo',imageElement:img}],{angleRange:0,angleStep:1});
      return map.get('_lo')?.loc||{x:0,y:0};
    } catch { return {x:0,y:0}; }
  }

  function runLineRemoval() {
    if (!state.cvReady||!state.rotatedCanvas) return;
    LineRemovalProcessor.cleanupMats(state.processedMats);
    const result=LineRemovalProcessor.process(state.rotatedCanvas,getParams());
    if (result.error) { UIController.showToast(`処理エラー: ${result.error}`,'error'); state.processedMats=[]; return; }
    state.processedMats=result.mats;
    UIController.updateCanvases(state.processedMats,LineRemovalProcessor);
    $('btnDownload').disabled=false; updateNavButtons();
  }
  const debouncedLineRemoval=debounce(runLineRemoval,180);

  /* ── Step 4 Entry ───────────────────────────────────── */
  function enterStep4() {
    const tpl=getSelectedTemplate(), result=getSelectedResult(), rc=$('canvas3');
    if (!tpl||!result||!rc||rc.width===0) { UIController.showToast('照合結果がありません。Step2で照合を実行してください','warning'); return; }
    const loc=state.layoutMatchLoc||result.loc||{x:0,y:0};
    UIController.updateOcrInfo(tpl, result, !!tpl.layoutAnchor);
    UIController.renderOcrRegionPreview(rc, loc, tpl.ocrRegions||[]);
    $('btnRunOcr').disabled=(tpl.ocrRegions||[]).length===0;
    if (!(tpl.ocrRegions||[]).length) UIController.showToast('OCR読取フィールドが未設定です','warning');
  }

  /* ── OCR: 全フィールドを順次処理 ────────────────────── */
  async function handleRunOcr() {
    if (state.ocrRunning) return;
    const tpl=getSelectedTemplate(), result=getSelectedResult(), rc=$('canvas3');
    if (!tpl||!result||!rc||rc.width===0) { UIController.showToast('OCR対象データが不足しています','warning'); return; }
    const regions=tpl.ocrRegions||[];
    if (!regions.length) { UIController.showToast('OCR読取フィールドが登録されていません','warning'); return; }
    const loc=state.layoutMatchLoc||result.loc||{x:0,y:0};
    const psm=parseInt($('ocrPsm').value,10);
    state.ocrRunning=true; $('btnRunOcr').disabled=true;
    UIController.showOcrPanel(true); UIController.showOcrProgress(true); UIController.updateOcrProgress('初期化中…',0);
    const fieldResults=[];
    for (let i=0;i<regions.length;i++) {
      const region=regions[i];
      UIController.updateOcrProgress(`フィールド ${i+1}/${regions.length}「${region.name}」を処理中…`,i/regions.length);
      const ocrCanvas=LineRemovalProcessor.extractRegion(rc,loc,region);
      if (!ocrCanvas||ocrCanvas.width===0) { fieldResults.push({region,fullText:'',words:[],error:'領域の切り出しに失敗しました'}); continue; }
      const res=await OcrProcessor.recognize(ocrCanvas,psm,p=>{
        UIController.updateOcrProgress(`フィールド ${i+1}/${regions.length}「${region.name}」: ${p.status}`,(i+p.progress)/regions.length);
      });
      fieldResults.push({region,...res});
    }
    state.ocrRunning=false; $('btnRunOcr').disabled=false;
    UIController.showOcrProgress(false);
    const ok=fieldResults.filter(r=>!r.error).length;
    if (ok>0) { UIController.renderMultiOcrResults(fieldResults); UIController.showToast(`OCR完了 — ${ok}/${regions.length} フィールドを認識しました`,'success'); }
    else UIController.showToast('すべてのフィールドでOCRに失敗しました','error',5000);
  }

  function handleCopyOcr() {
    const rows=document.querySelectorAll('.ocr-field-row[data-name]');
    if (!rows.length) { UIController.showToast('コピーするデータがありません','warning'); return; }
    const lines=Array.from(rows).map(r=>`${r.dataset.name}: ${r.dataset.text}`);
    navigator.clipboard.writeText(lines.join('\n'))
      .then(()=>UIController.showToast(`${lines.length} フィールドをコピーしました`,'success'))
      .catch(()=>UIController.showToast('コピーに失敗しました','error'));
  }

  /* ── Download / Reset ───────────────────────────────── */
  function doDownload() {
    const c=$('canvas3'); if (!c||c.width===0) { UIController.showToast('保存できる画像がありません','warning'); return; }
    const a=document.createElement('a'); a.download=`line_removed_${Date.now()}.png`; a.href=c.toDataURL('image/png'); a.click();
    UIController.showToast('罫線除去画像を保存しました','success');
  }
  function resetParams() {
    const def=LineRemovalProcessor.defaultParams();
    const set=(id,val)=>{const el=$(id);if(!el)return;el[el.type==='checkbox'?'checked':'value']=val;};
    const txt=(id,val)=>{const el=$(id);if(el)el.textContent=val;};
    set('binaryMethod',def.binaryMethod); set('manualThresh',def.manualThresh); txt('valManualThresh',def.manualThresh);
    set('adaptiveBlock',def.adaptiveBlock); txt('valAdaptiveBlock',def.adaptiveBlock);
    set('adaptiveC',def.adaptiveC); txt('valAdaptiveC',def.adaptiveC);
    set('enableHoriz',def.enableHoriz); set('horizLen',def.horizLen); txt('valHorizLen',def.horizLen);
    set('horizThick',def.horizThick); txt('valHorizThick',def.horizThick); set('horizDilate',def.horizDilate); txt('valHorizDilate',def.horizDilate);
    set('enableVert',def.enableVert); set('vertLen',def.vertLen); txt('valVertLen',def.vertLen);
    set('vertThick',def.vertThick); txt('valVertThick',def.vertThick); set('vertDilate',def.vertDilate); txt('valVertDilate',def.vertDilate);
    set('maskDilate',def.maskDilate); txt('valMaskDilate',def.maskDilate); set('outputBase',def.outputBase);
    $('binaryMethod').dispatchEvent(new Event('change'));
    UIController.showToast('パラメータをリセットしました','info');
    if (state.rotatedCanvas) debouncedLineRemoval();
  }

  /* ── Sample Management ──────────────────────────────── */
  function initSamples() {
    const forms=SampleStore.getForms(), grid=$('sampleGrid');
    if (!grid||!forms) return;
    forms.forEach(f=>{
      const card=document.createElement('div'); card.className='sample-card';
      const thumb=document.createElement('canvas'); thumb.width=f.canvas.width; thumb.height=f.canvas.height; thumb.style.maxWidth='100%';
      thumb.getContext('2d').drawImage(f.canvas,0,0);
      const label=document.createElement('span'); label.className='sample-name'; label.textContent=f.name;
      card.append(thumb,label);
      card.addEventListener('click',()=>{ setSourceImage(f.canvas,true); UIController.closeModal('sampleModal'); UIController.showToast(`「${f.name}」を読み込みました`,'success'); });
      grid.appendChild(card);
    });
  }
  function loadSampleTemplates() {
    const tpls=SampleStore.getTemplates();
    if (!tpls||!tpls.length) { UIController.showToast('サンプルテンプレートがありません','info'); return; }
    tpls.forEach(t=>addTemplate(t.formName,t.identAnchor,t.layoutAnchor,t.ocrRegions,true));
    UIController.showToast(`${tpls.length} 件のサンプルテンプレートを読み込みました`,'success');
  }

  /* ── Initialization ─────────────────────────────────── */
  function init() {
    UIController.initAccordions(); UIController.initSliders(); UIController.initBinaryMethodToggle();
    UIController.initModals(); initSamples(); initModalCanvas();
    UIController.updateStepper(1); UIController.showPanel(1); updateNavButtons();

    document.addEventListener('paste', handlePasteEvent);

    // Step 1
    $('btnPaste')?.addEventListener('click', handlePasteButton);
    $('btnFileOpen')?.addEventListener('click',()=>$('fileInput').click());
    $('fileInput')?.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;loadImageFromBlob(f);e.target.value='';});
    $('btnSampleLoad')?.addEventListener('click',()=>UIController.openModal('sampleModal'));
    $('btnSampleClear')?.addEventListener('click',()=>{ if(!state.isSample){UIController.showToast('サンプル画像は読み込まれていません','info');return;} state.sourceCanvas=null;state.isSample=false;UIController.hideStep1Preview();updateNavButtons();UIController.showToast('サンプルデータをクリアしました','info'); });
    $('btnChangeImage')?.addEventListener('click',()=>{ state.sourceCanvas=null;UIController.hideStep1Preview();updateNavButtons(); });
    $('closeSampleModal')?.addEventListener('click',()=>UIController.closeModal('sampleModal'));
    const dz=$('dropZone');
    if(dz){ dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('drag-over');}); dz.addEventListener('dragleave',()=>dz.classList.remove('drag-over')); dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/'))loadImageFromBlob(f);}); }

    // Step nav
    $('btnNext')?.addEventListener('click',()=>goToStep(state.step+1));
    $('btnPrev')?.addEventListener('click',()=>goToStep(state.step-1));
    document.querySelectorAll('.step-item[data-step]').forEach(btn=>btn.addEventListener('click',()=>{const n=parseInt(btn.dataset.step);if(n<state.step)goToStep(n);}));

    // Step 2
    $('btnAddTemplate')?.addEventListener('click',openTplModal);
    $('btnSampleLoadTpl')?.addEventListener('click',loadSampleTemplates);
    $('btnSampleClearTpl')?.addEventListener('click',clearSampleTemplates);
    $('btnRunMatch')?.addEventListener('click',runMatching);
    $('matchSettingsToggle')?.addEventListener('click',()=>{ const b=$('matchSettingsBody'),t=$('matchSettingsToggle'); const o=b.classList.toggle('open'); t.classList.toggle('open',o); });
    $('angleRange')?.addEventListener('change',e=>{ state.matchSettings.angleRange=Math.max(0,parseFloat(e.target.value)||0); });
    $('angleStep')?.addEventListener('change',e=>{ state.matchSettings.angleStep=Math.max(0.5,parseFloat(e.target.value)||1); });

    // Template modal
    $('closeTplModal')?.addEventListener('click',()=>UIController.closeModal('tplModal'));
    $('btnTplCancel')?.addEventListener('click',()=>UIController.closeModal('tplModal'));
    $('btnTplRegister')?.addEventListener('click',registerTemplate);
    $('tplFormName')?.addEventListener('keydown',e=>{if(e.key==='Enter')$('tplIdentName').focus();});
    $('tplIdentName')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&_identDataURL)$('regName').focus();});
    $('useLayoutAnchor')?.addEventListener('change',toggleLayoutMode);
    // 識別アンカードロップゾーン
    const idz=$('identDropZone');
    if(idz){
      idz.addEventListener('click',()=>{_lastPasteTarget='ident';$('identFileInput').click();});
      idz.addEventListener('dragover',e=>{e.preventDefault();idz.classList.add('drag-over');});
      idz.addEventListener('dragleave',()=>idz.classList.remove('drag-over'));
      idz.addEventListener('drop',e=>{e.preventDefault();idz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/'))setIdentImage(f);});
    }
    $('identFileInput')?.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;setIdentImage(f);e.target.value='';});
    // レイアウトアンカードロップゾーン
    const ldz=$('layoutDropZone');
    if(ldz){
      ldz.addEventListener('click',()=>{_lastPasteTarget='layout';$('layoutFileInput').click();});
      ldz.addEventListener('dragover',e=>{e.preventDefault();ldz.classList.add('drag-over');});
      ldz.addEventListener('dragleave',()=>ldz.classList.remove('drag-over'));
      ldz.addEventListener('drop',e=>{e.preventDefault();ldz.classList.remove('drag-over');const f=e.dataTransfer.files[0];if(f?.type.startsWith('image/'))setLayoutImage(f);});
    }
    $('layoutFileInput')?.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;setLayoutImage(f);e.target.value='';});
    $('regName')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commitPendingRegion();}});

    // Step 3
    $('paramPanel')?.addEventListener('input',debouncedLineRemoval);
    $('paramPanel')?.addEventListener('change',debouncedLineRemoval);
    $('btnReset')?.addEventListener('click',resetParams);
    $('btnDownload')?.addEventListener('click',doDownload);
    $('btnDlInline')?.addEventListener('click',doDownload);

    // Step 4
    $('btnRunOcr')?.addEventListener('click',handleRunOcr);
    $('btnCopyOcr')?.addEventListener('click',handleCopyOcr);
    $('btnCloseOcr')?.addEventListener('click',()=>UIController.showOcrPanel(false));

    // Help
    $('btnHelp')?.addEventListener('click',()=>UIController.openModal('helpModal'));
    $('closeHelpModal')?.addEventListener('click',()=>UIController.closeModal('helpModal'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
