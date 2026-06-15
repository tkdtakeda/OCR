/* ════════════════════════════════════════════════════════
   ocr.js  Tesseract.js OCR ラッパー
   Responsibility: OCR処理ロジックのみ。DOM操作・UI状態管理は持たない
   ════════════════════════════════════════════════════════ */
'use strict';

const OcrProcessor = (() => {

  const CDN = {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
    langPath:   'https://tessdata.projectnaptha.com/4.0.0',
    corePath:   'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core-simd.wasm.js',
  };

  const STATUS_JA = [
    ['loading tesseract core',       'OCRエンジンを読み込み中…'],
    ['loading language traineddata', '言語データを読み込み中… (初回は数十秒かかります)'],
    ['initializing api',             'OCRを初期化中…'],
    ['initializing tesseract',       'OCRを初期化中…'],
    ['recognizing text',             'テキストを認識中…'],
  ];

  let _worker = null;
  let _ready  = false;
  let _logCb  = () => {};

  async function ensureWorker() {
    if (_ready) return;
    _worker = await Tesseract.createWorker({ ...CDN, logger: m => _logCb(m) });
    await _worker.loadLanguage('eng');
    await _worker.initialize('eng');
    _ready = true;
  }

  function toJa(raw) {
    if (!raw) return '処理中…';
    for (const [key, msg] of STATUS_JA) {
      if (raw.includes(key)) return msg;
    }
    return raw;
  }

  /**
   * Canvas に対して OCR を実行する
   * @param {HTMLCanvasElement} canvas
   * @param {number}            psm        Page Segmentation Mode
   * @param {Function}          onProgress ({ status, progress }) => void
   * @returns {Promise<{ fullText: string, words: Array, error: string|null }>}
   */
  async function recognize(canvas, psm, onProgress) {
    _logCb = m => {
      if (typeof onProgress === 'function') {
        onProgress({ status: toJa(m.status), progress: m.progress || 0 });
      }
    };
    try {
      await ensureWorker();
      await _worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      const { data } = await _worker.recognize(canvas);
      const words = (data.words || [])
        .filter(w => w.text && w.text.trim())
        .map(w => ({ text: w.text.trim(), confidence: Math.round(w.confidence), bbox: w.bbox }));
      return { fullText: data.text || '', words, error: null };
    } catch (e) {
      return { fullText: '', words: [], error: (e && e.message) ? e.message : String(e) };
    }
  }

  async function terminate() {
    if (_worker) {
      try { await _worker.terminate(); } catch {}
      _worker = null; _ready = false;
    }
  }

  return { recognize, terminate };

})();
