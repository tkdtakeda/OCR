/* ════════════════════════════════════════════════════════
   samples.js  サンプルデータストア
   テンプレート構造:
     identAnchor  … 帳票識別・傾き補正用（小領域）
     layoutAnchor … OCR座標原点用（帳票全体推奨）
     ocrRegions   … layoutAnchor左上からの相対座標
   ════════════════════════════════════════════════════════ */
'use strict';

const SampleStore = (() => {

  function mkCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function cropCanvas(src, x, y, w, h) {
    const c = mkCanvas(w, h); c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c;
  }
  function toDataURL(c) { return c.toDataURL('image/png'); }
  let _rid = 0; function rid() { return 'r' + (++_rid); }

  /* ── テーブル描画 ───────────────────────────────────── */
  function drawTable(ctx, x, y, totalW, rowH, rows, colRatios, headers, data, accent) {
    ctx.fillStyle = accent + '25'; ctx.fillRect(x, y, totalW, rowH);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 0.8;
    ctx.strokeRect(x, y, totalW, rowH * (rows + 1));
    let cx = x;
    colRatios.forEach((r, ci) => {
      const cw = totalW * r;
      if (ci > 0) { ctx.beginPath(); ctx.moveTo(cx,y); ctx.lineTo(cx, y+rowH*(rows+1)); ctx.stroke(); }
      ctx.fillStyle = accent; ctx.font = 'bold 10px sans-serif';
      ctx.fillText(headers[ci] || '', cx+4, y+rowH-5);
      cx += cw;
    });
    for (let r = 0; r < rows; r++) {
      const ry = y + rowH*(r+1);
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(x,ry); ctx.lineTo(x+totalW,ry); ctx.stroke();
      if (data && data[r]) {
        cx = x;
        colRatios.forEach((ratio, ci) => {
          const cw = totalW*ratio;
          if (ci>0){ ctx.strokeStyle='#ddd'; ctx.lineWidth=0.5; ctx.beginPath(); ctx.moveTo(cx,ry); ctx.lineTo(cx,ry+rowH); ctx.stroke(); }
          const v = (data[r][ci]||'').substring(0,16);
          if (v){ ctx.fillStyle='#333'; ctx.font='9px monospace'; ctx.fillText(v,cx+3,ry+rowH-5); }
          cx += cw;
        });
      }
    }
  }

  /* ── 帳票仕様 ───────────────────────────────────────── */
  // anchor: 識別アンカー矩形（絶対座標）
  // ocrRegions: layoutAnchor（帳票全体）左上からの絶対座標
  const SPECS = [
    {
      name: '発注書 (サンプル)', accentCol: '#1D6BB0', titleText: '発 注 書',
      anchor: { x:30, y:20, w:190, h:48 },
      ocrRegions: [
        { id:rid(), name:'発注番号', dx:102, dy:78,  w:170, h:18 },
        { id:rid(), name:'発注日',   dx:80,  dy:104, w:110, h:18 },
        { id:rid(), name:'担当者',   dx:246, dy:104, w:140, h:18 },
      ],
      numLabel:'発注番号:', numValue:'PO-2024-0001',
      dateLabel:'発注日:',  dateValue:'2024-06-12',
      subLabel:'担当者:',   subValue:'田中 一郎',
      tableHeaders:['No.','品名・型番','規格','数量','単価','金額'],
      colRatios:[0.07,0.30,0.20,0.13,0.15,0.15],
      tableData:[['1','アルミ板 A1050P','t2.0×200×300','50枚','¥1,200','¥60,000'],
                 ['2','アルミ棒 A6061BD','φ20×1000L','20本','¥3,500','¥70,000'],
                 ['3','プレート A5052P','t5×150×200','30枚','¥2,800','¥84,000'],
                 ['4','フラット A2024','20×5×500L','10本','¥4,200','¥42,000'],
                 ['5','アングル A6063','30×30×3×1000','15本','¥1,800','¥27,000']],
      total:'¥ 283,000', footer:'この発注書は正式な注文書です。受取確認の返信をお願いします。',
    },
    {
      name: '納品書 (サンプル)', accentCol: '#0F7D5E', titleText: '納 品 書',
      anchor: { x:30, y:20, w:190, h:48 },
      ocrRegions: [
        { id:rid(), name:'納品番号', dx:102, dy:78,  w:170, h:18 },
        { id:rid(), name:'納品日',   dx:80,  dy:104, w:110, h:18 },
        { id:rid(), name:'納品先',   dx:246, dy:104, w:140, h:18 },
      ],
      numLabel:'納品番号:', numValue:'DN-2024-0001',
      dateLabel:'納品日:',  dateValue:'2024-06-15',
      subLabel:'納品先:',   subValue:'○○製作所様',
      tableHeaders:['No.','品名・型番','規格','数量','単価','金額'],
      colRatios:[0.07,0.33,0.18,0.13,0.15,0.14],
      tableData:[['1','アルミ板 A1050P','t2.0×200×300','50枚','¥1,200','¥60,000'],
                 ['2','アルミ棒 A6061BD','φ20×1000L','20本','¥3,500','¥70,000'],
                 ['3','アングル A6063','30×30×3×1000','15本','¥1,800','¥27,000']],
      total:'¥ 157,000', footer:'上記の品物を正に納品いたしました。',
    },
  ];

  /* ── 帳票描画 ───────────────────────────────────────── */
  function drawForm(spec) {
    const W=640, H=800, c=mkCanvas(W,H), ctx=c.getContext('2d');
    ctx.fillStyle='#fff'; ctx.fillRect(0,0,W,H);
    const {x:ax,y:ay,w:aw,h:ah}=spec.anchor;
    ctx.fillStyle=spec.accentCol; ctx.fillRect(ax,ay,aw,ah);
    ctx.fillStyle='#fff'; ctx.font='bold 26px sans-serif'; ctx.textBaseline='middle';
    ctx.fillText(spec.titleText, ax+12, ay+ah/2); ctx.textBaseline='alphabetic';
    ctx.fillStyle='#555'; ctx.font='10px sans-serif'; ctx.textAlign='right';
    ctx.fillText('株式会社サンプル製造',W-30,ay+14);
    ctx.fillText('〒490-0000 愛知県津島市XX町1丁目',W-30,ay+27);
    ctx.fillText('TEL: 0567-XX-XXXX',W-30,ay+40);
    ctx.textAlign='left';
    ctx.strokeStyle=spec.accentCol; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(30,ay+ah+4); ctx.lineTo(W-30,ay+ah+4); ctx.stroke();
    // 発注番号欄 (dy=78 absolute)
    const oy=78, ox=30, oh=18;
    ctx.fillStyle='#666'; ctx.font='11px sans-serif'; ctx.fillText(spec.numLabel,ox,oy+oh-4);
    ctx.strokeStyle='#bbb'; ctx.lineWidth=0.8; ctx.strokeRect(ox+72,oy,170,oh);
    ctx.fillStyle='#000'; ctx.font='11px monospace'; ctx.fillText(spec.numValue,ox+75,oy+oh-4);
    // 日付・担当者欄 (dy=104 absolute)
    const row2Y=104;
    ctx.fillStyle='#666'; ctx.font='11px sans-serif'; ctx.fillText(spec.dateLabel,30,row2Y+14);
    ctx.strokeStyle='#bbb'; ctx.lineWidth=0.8; ctx.strokeRect(80,row2Y,110,18);
    ctx.fillStyle='#000'; ctx.font='11px monospace'; ctx.fillText(spec.dateValue,83,row2Y+13);
    ctx.fillStyle='#666'; ctx.font='11px sans-serif'; ctx.fillText(spec.subLabel,200,row2Y+14);
    ctx.strokeStyle='#bbb'; ctx.lineWidth=0.8; ctx.strokeRect(246,row2Y,140,18);
    ctx.fillStyle='#000'; ctx.font='11px monospace'; ctx.fillText(spec.subValue,249,row2Y+13);
    const tY=row2Y+28, tW=W-60, rowH=22;
    drawTable(ctx,30,tY,tW,rowH,10,spec.colRatios,spec.tableHeaders,spec.tableData,spec.accentCol);
    const totY=tY+rowH*11+10;
    ctx.fillStyle=spec.accentCol+'18'; ctx.fillRect(30+tW*0.72,totY,tW*0.28,26);
    ctx.strokeStyle='#999'; ctx.lineWidth=1; ctx.strokeRect(30+tW*0.72,totY,tW*0.28,26);
    ctx.fillStyle='#444'; ctx.font='bold 11px sans-serif'; ctx.fillText('合計',30+tW*0.72+8,totY+18);
    ctx.fillStyle=spec.accentCol; ctx.font='bold 13px monospace'; ctx.textAlign='right';
    ctx.fillText(spec.total,W-32,totY+18); ctx.textAlign='left';
    ctx.strokeStyle='#ddd'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(30,totY+50); ctx.lineTo(W-30,totY+50); ctx.stroke();
    ctx.fillStyle='#aaa'; ctx.font='9px sans-serif'; ctx.fillText(spec.footer,30,totY+64);
    return c;
  }

  let _forms=null, _templates=null;

  function getForms() {
    if (_forms) return _forms;
    _forms = SPECS.map(s => ({ name: s.name, canvas: drawForm(s) }));
    return _forms;
  }

  /* ── Public: getTemplates ───────────────────────────── */
  function getTemplates() {
    if (_templates) return _templates;
    const forms = getForms();
    _templates = SPECS.map((spec, i) => {
      const { x,y,w,h } = spec.anchor;
      const identCanvas  = cropCanvas(forms[i].canvas, x, y, w, h);
      const layoutCanvas = forms[i].canvas; // 帳票全体をレイアウトアンカーに使用
      return {
        formName: i===0 ? '発注書' : '納品書',
        identAnchor: {
          name:  'タイトルブロック（識別用）',
          dataURL: toDataURL(identCanvas),
          natW: w, natH: h,
        },
        layoutAnchor: {
          name:  '帳票全体（OCR座標基準）',
          dataURL: toDataURL(layoutCanvas),
          natW: layoutCanvas.width, natH: layoutCanvas.height,
        },
        ocrRegions: spec.ocrRegions.map(r => ({ ...r })),
      };
    });
    return _templates;
  }

  return { getForms, getTemplates };
})();
