/* ════════════════════════════════════════════════════════
   processor.js  OpenCV.js 処理パイプライン
   Responsibility: 画像処理ロジックのみ。DOM操作なし
   新規追加: rotateCanvas(), extractRegion()
   ════════════════════════════════════════════════════════ */
'use strict';

const LineRemovalProcessor = (() => {

  /* ── Default parameters ─────────────────────────────── */
  const defaultParams = () => ({
    binaryMethod:  'adaptive', manualThresh:  128,
    adaptiveBlock: 51,         adaptiveC:     -5,
    enableHoriz:   true,  horizLen:    5, horizThick:  1, horizDilate: 2,
    enableVert:    true,  vertLen:     5, vertThick:   1, vertDilate:  2,
    maskDilate:    0,     outputBase:  'original',
  });

  /* ── Mat helpers ────────────────────────────────────── */
  function zeroMat(rows, cols) {
    return new cv.Mat(rows, cols, cv.CV_8UC1, new cv.Scalar(0, 0, 0, 0));
  }

  function toRGBA(src) {
    const dst = new cv.Mat();
    if      (src.channels() === 4) src.copyTo(dst);
    else if (src.channels() === 3) cv.cvtColor(src, dst, cv.COLOR_RGB2RGBA);
    else                           cv.cvtColor(src, dst, cv.COLOR_GRAY2RGBA);
    return dst;
  }

  function toGray(src) {
    const dst = new cv.Mat();
    if      (src.channels() === 4) cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
    else if (src.channels() === 3) cv.cvtColor(src, dst, cv.COLOR_RGB2GRAY);
    else                           src.copyTo(dst);
    return dst;
  }

  /* ── Binarize ───────────────────────────────────────── */
  function binarize(gray, p) {
    const dst = new cv.Mat();
    switch (p.binaryMethod) {
      case 'adaptive':
        cv.adaptiveThreshold(gray, dst, 255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV,
          p.adaptiveBlock, p.adaptiveC);
        break;
      case 'manual':
        cv.threshold(gray, dst, p.manualThresh, 255, cv.THRESH_BINARY_INV);
        break;
      default: /* otsu */
        cv.threshold(gray, dst, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    }
    return dst;
  }

  /* ── Detect lines ───────────────────────────────────── */
  function detectLines(binary, kw, kh, dilIter) {
    const dst  = binary.clone();
    const kern = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(1,kw), Math.max(1,kh)));
    cv.erode (dst, dst, kern);
    cv.dilate(dst, dst, kern);
    kern.delete();
    if (dilIter > 0) {
      const kd = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      for (let i = 0; i < dilIter; i++) cv.dilate(dst, dst, kd);
      kd.delete();
    }
    return dst;
  }

  /* ── Build combined mask ────────────────────────────── */
  function buildMask(binary, p) {
    const hMask = p.enableHoriz
      ? detectLines(binary, Math.max(3, Math.round(binary.cols * p.horizLen / 100)), p.horizThick, p.horizDilate)
      : zeroMat(binary.rows, binary.cols);
    const vMask = p.enableVert
      ? detectLines(binary, p.vertThick, Math.max(3, Math.round(binary.rows * p.vertLen / 100)), p.vertDilate)
      : zeroMat(binary.rows, binary.cols);
    const combined = new cv.Mat();
    cv.bitwise_or(hMask, vMask, combined);
    hMask.delete(); vMask.delete();
    if (p.maskDilate > 0) {
      const size = p.maskDilate * 2 + 1;
      const kd   = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(size, size));
      cv.dilate(combined, combined, kd);
      kd.delete();
    }
    return combined;
  }

  /* ── Red overlay visualization ──────────────────────── */
  function maskToRedOverlay(srcRGBA, mask) {
    const result = srcRGBA.clone();
    const red    = new cv.Mat(srcRGBA.rows, srcRGBA.cols, cv.CV_8UC4, new cv.Scalar(215,45,45,255));
    red.copyTo(result, mask);
    red.delete();
    return result;
  }

  /* ── Apply mask → final result ──────────────────────── */
  function applyMask(src, gray, binary, mask, p) {
    let base;
    switch (p.outputBase) {
      case 'gray': {
        base = new cv.Mat();
        cv.cvtColor(gray, base, cv.COLOR_GRAY2RGBA);
        break;
      }
      case 'binary': {
        const inv = new cv.Mat();
        cv.bitwise_not(binary, inv);
        base = new cv.Mat();
        cv.cvtColor(inv, base, cv.COLOR_GRAY2RGBA);
        inv.delete();
        break;
      }
      default:
        base = toRGBA(src);
    }
    const white = new cv.Mat(base.rows, base.cols, cv.CV_8UC4, new cv.Scalar(255,255,255,255));
    white.copyTo(base, mask);
    white.delete();
    return base;
  }

  /* ── Main pipeline ──────────────────────────────────── */
  /**
   * @param {HTMLCanvasElement} srcCanvas  入力キャンバス（回転補正済みのもの）
   * @param {object} p                      parameters
   * @returns {{ mats: cv.Mat[], error: string|null }}
   */
  function process(srcCanvas, p) {
    const result = { mats: [], error: null };
    let src = null;
    try {
      src = cv.imread(srcCanvas);
      result.mats.push(toRGBA(src));

      const gray   = toGray(src);
      const binary = binarize(gray, p);

      const binInv  = new cv.Mat();
      cv.bitwise_not(binary, binInv);
      const binRGBA = new cv.Mat();
      cv.cvtColor(binInv, binRGBA, cv.COLOR_GRAY2RGBA);
      binInv.delete();
      result.mats.push(binRGBA);

      const mask    = buildMask(binary, p);
      const overlay = maskToRedOverlay(result.mats[0], mask);
      result.mats.push(overlay);

      result.mats.push(applyMask(src, gray, binary, mask, p));

      gray.delete(); binary.delete(); mask.delete();
    } catch (e) {
      result.error = (e && e.message) ? e.message : String(e);
    } finally {
      if (src) src.delete();
    }
    return result;
  }

  /* ── Rotate canvas ──────────────────────────────────── */
  /**
   * OpenCV の getRotationMatrix2D で回転（matcherEngine と同じ符号規約）
   * angleDeg > 0 = 反時計回り
   * @param {HTMLCanvasElement} srcCanvas
   * @param {number}            angleDeg
   * @returns {HTMLCanvasElement}  新規キャンバス（元サイズを保持）
   */
  function rotateCanvas(srcCanvas, angleDeg) {
    // 無回転の場合はコピーして返す
    if (!angleDeg || Math.abs(angleDeg) < 0.001) {
      const out = document.createElement('canvas');
      out.width  = srcCanvas.width;
      out.height = srcCanvas.height;
      out.getContext('2d').drawImage(srcCanvas, 0, 0);
      return out;
    }
    let src = null;
    let dst = null;
    let M   = null;
    try {
      src = cv.imread(srcCanvas);
      const center = new cv.Point(src.cols / 2, src.rows / 2);
      M   = cv.getRotationMatrix2D(center, angleDeg, 1.0);
      dst = new cv.Mat();
      cv.warpAffine(src, dst, M,
        new cv.Size(src.cols, src.rows),
        cv.INTER_LINEAR, cv.BORDER_CONSTANT,
        new cv.Scalar(255, 255, 255, 255)  // 白背景（帳票余白）
      );
      const out = document.createElement('canvas');
      out.width  = srcCanvas.width;
      out.height = srcCanvas.height;
      cv.imshow(out, dst);
      return out;
    } catch (e) {
      // フォールバック：コピーして返す
      const out = document.createElement('canvas');
      out.width  = srcCanvas.width;
      out.height = srcCanvas.height;
      out.getContext('2d').drawImage(srcCanvas, 0, 0);
      return out;
    } finally {
      if (src) try { src.delete(); } catch {}
      if (dst) try { dst.delete(); } catch {}
      if (M)   try { M.delete();   } catch {}
    }
  }

  /* ── Extract OCR region ─────────────────────────────── */
  /**
   * matcherEngine の loc + templateのocrOffset から OCR対象領域を切り出す
   * @param {HTMLCanvasElement} srcCanvas   罫線除去結果キャンバス
   * @param {{ x: number, y: number }} loc  マッチング位置（テンプレート左上）
   * @param {{ dx:number, dy:number, w:number, h:number }} ocrOffset
   * @returns {HTMLCanvasElement}
   */
  function extractRegion(srcCanvas, loc, ocrOffset) {
    const x = Math.max(0, Math.round(loc.x + ocrOffset.dx));
    const y = Math.max(0, Math.round(loc.y + ocrOffset.dy));
    const w = Math.max(1, Math.round(ocrOffset.w));
    const h = Math.max(1, Math.round(ocrOffset.h));
    // 画像境界クランプ
    const clampedW = Math.min(w, srcCanvas.width  - x);
    const clampedH = Math.min(h, srcCanvas.height - y);
    if (clampedW <= 0 || clampedH <= 0) return null;
    const out = document.createElement('canvas');
    out.width  = clampedW;
    out.height = clampedH;
    out.getContext('2d').drawImage(srcCanvas, x, y, clampedW, clampedH, 0, 0, clampedW, clampedH);
    return out;
  }

  /* ── Render / cleanup ───────────────────────────────── */
  function renderToCanvas(mat, canvas) {
    cv.imshow(canvas, mat);
  }

  function cleanupMats(mats) {
    mats.forEach(m => { try { if (m && !m.isDeleted()) m.delete(); } catch {} });
  }

  /* ── Public API ─────────────────────────────────────── */
  return { process, renderToCanvas, cleanupMats, defaultParams, rotateCanvas, extractRegion };

})();
