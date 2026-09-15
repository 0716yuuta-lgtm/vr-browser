/**
 * VR Browser - 2D VR 専用プレイヤー (Single Canvas 50:50 & requestVideoFrameCallback 同期版)
 *
 * 【設計方針】
 * 1. 2D動画のVRゴーグル視聴に特化（360°/ジャイロ/WebGL等は完全除外）。
 * 2. 単一全画面Canvas（#vrCanvas）上で左目（50%）と右目（50%）をアトミックに同一フレーム描画。
 * 3. 描画トリガーに videoPlayer.requestVideoFrameCallback (rVFC) を採用し、動画デコードと完全同期。
 * 4. rVFC非対応環境向けに requestAnimationFrame の自動フォールバックを完備。
 * 5. ローカル動画（test.mp4 / ファイル選択）および YouTube 通常再生（Phase 5仕様）の完全維持。
 */

// ============================================================
// DOM要素の取得
// ============================================================
const videoPlayer = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const youtubeContainer = document.getElementById('youtubeContainer');
const youtubeVrUi = document.getElementById('youtubeVrUi');
const exitYoutubeVrButton = document.getElementById('exitYoutubeVrButton');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadYoutubeButton = document.getElementById('loadYoutubeButton');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// VR関連要素
const vrButton = document.getElementById('vrButton');
const vrButtonSection = document.getElementById('vrButtonSection');
const exitVrButton = document.getElementById('exitVrButton');
const vrContainer = document.getElementById('vrContainer');
const vrUiLayer = document.getElementById('vrUiLayer');
const vrCanvas = document.getElementById('vrCanvas');
const vrSyncBadge = document.getElementById('vrSyncBadge');
const vrDebugInfo = document.getElementById('vrDebugInfo');
const indicatorLeft = document.getElementById('indicatorLeft');
const indicatorRight = document.getElementById('indicatorRight');

// 単一Canvas 2D コンテキストの取得
const vrCtx = vrCanvas ? vrCanvas.getContext('2d', { alpha: false, desynchronized: true }) : null;

// ============================================================
// 状態管理変数
// ============================================================
let currentSourceType = 'local'; // 'local' | 'youtube'
let isVRMode = false;
let uiFadeTimeout = null;
let indicatorTimeout = null;

// 描画ループ管理変数
let vfcCallbackId = null;
let rafCallbackId = null;
const isRVFCSupported = typeof HTMLVideoElement !== 'undefined' && 'requestVideoFrameCallback' in HTMLVideoElement.prototype;

// YouTube IFrame Player API 関連変数
let ytPlayer = null;
let isYTReady = false;
let currentYouTubeVideoId = null;

// ============================================================
// ステータスメッセージ & ソースモード切り替え
// ============================================================
/**
 * ステータスメッセージを更新する関数
 * @param {string} message - 表示するメッセージ
 * @param {'info' | 'warning' | 'success'} type - メッセージの種類
 */
function updateStatus(message, type = 'info') {
  if (!statusText || !statusMessage) return;
  statusText.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

/**
 * 現在の動画ソース（LOCAL / YOUTUBE）を切り替える関数
 * @param {'local' | 'youtube'} type - 切り替える動画ソースの種類
 */
function setSourceType(type) {
  currentSourceType = type;

  if (type === 'local') {
    // ローカル動画モード
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      try { ytPlayer.pauseVideo(); } catch (e) { /* ignore */ }
    }
    if (youtubeContainer) {
      youtubeContainer.style.display = 'none';
      youtubeContainer.classList.remove('vr-fullscreen');
    }
    if (youtubeVrUi) youtubeVrUi.style.display = 'none';
    if (videoContainer) videoContainer.style.display = 'flex';
    if (vrButton) vrButton.textContent = '🥽 2D VR MODE（ローカル動画）';
  } else if (type === 'youtube') {
    // YouTube動画モード
    if (videoPlayer) videoPlayer.pause();
    if (videoContainer) videoContainer.style.display = 'none';
    if (vrContainer) vrContainer.style.display = 'none';
    if (youtubeContainer) youtubeContainer.style.display = 'block';
    if (vrButton) vrButton.textContent = '🥽 VR MODE（YouTube動画）';
  }
}

// ============================================================
// YouTube IFrame Player API 関連処理
// ============================================================

/**
 * YouTube IFrame APIの準備完了コールバック（グローバル関数）
 */
window.onYouTubeIframeAPIReady = function () {
  isYTReady = true;
  console.log('[VR Browser] YouTube IFrame Player API is ready.');
};

// APIがすでにロードされている場合の即時判定
if (window.YT && window.YT.Player) {
  isYTReady = true;
}

/**
 * YouTubeのURLまたは文字列から11桁の動画IDを確実に抽出する関数
 * @param {string} url - YouTube URL
 * @returns {string|null} - 抽出された動画ID、不正な場合はnull
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;
  url = url.trim();

  // 11文字の動画IDそのものが入力された場合
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  try {
    // youtu.be/XXXXXXXXXXX
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch && shortMatch[1]) {
      return shortMatch[1];
    }

    // youtube.com/watch?v=XXXXXXXXXXX または embed/XXXXXXXXXXX または shorts/XXXXXXXXXXX または live/XXXXXXXXXXX
    const longMatch = url.match(/(?:v=|embed\/|shorts\/|v\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (longMatch && longMatch[1]) {
      return longMatch[1];
    }

    // クエリパラメータ ?v=XXXXXXXXXXX を直接抽出
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    const vParam = urlObj.searchParams.get('v');
    if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
      return vParam;
    }
  } catch (err) {
    console.warn('[VR Browser] URL抽出エラー:', err);
  }

  return null;
}

/**
 * YouTubeプレイヤーを初期化または動画を再読み込みする関数
 * @param {string} videoId - YouTube動画ID
 */
function loadYouTubeVideo(videoId) {
  if (!videoId) {
    updateStatus('有効なYouTube動画URLまたは動画IDを入力してください。', 'warning');
    return;
  }

  currentYouTubeVideoId = videoId;
  setSourceType('youtube');
  updateStatus('YouTube動画を読み込み中...', 'info');

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    try {
      ytPlayer.loadVideoById({ videoId: videoId });
      updateStatus('YouTube動画を読み込みました。再生ボタンを押してください。', 'success');
      return;
    } catch (e) {
      console.warn('[VR Browser] loadVideoById失敗、再生成を試みます:', e);
    }
  }

  // プレイヤーが未生成の場合は新規生成
  const createPlayer = () => {
    try {
      ytPlayer = new window.YT.Player('youtubeIframe', {
        videoId: videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (event) => {
            console.log('[VR Browser] YouTube Player is ready.');
            updateStatus('YouTube動画の準備が完了しました。', 'success');
          },
          onError: (event) => {
            console.error('[VR Browser] YouTube Player error:', event.data);
            updateStatus(`YouTubeの読み込みに失敗しました（エラーコード: ${event.data}）。埋め込み許可動画をお試しください。`, 'warning');
          }
        }
      });
    } catch (err) {
      console.error('[VR Browser] YouTubeプレイヤー生成エラー:', err);
      updateStatus('YouTubeプレイヤーの初期化に失敗しました。', 'warning');
    }
  };

  if (isYTReady) {
    createPlayer();
  } else {
    // APIの読み込み完了を待機
    const checkInterval = setInterval(() => {
      if (isYTReady || (window.YT && window.YT.Player)) {
        clearInterval(checkInterval);
        isYTReady = true;
        createPlayer();
      }
    }, 100);

    setTimeout(() => {
      clearInterval(checkInterval);
      if (!ytPlayer) {
        updateStatus('YouTube APIの読み込みがタイムアウトしました。通信環境をご確認ください。', 'warning');
      }
    }, 8000);
  }
}

// ============================================================
// 単一Canvas 2D VR レンダリング処理
// ============================================================

/**
 * VR Canvasの解像度とサイズをビューポートに合わせて更新する関数
 */
function updateVRCanvasDimensions() {
  if (!vrCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2); // パフォーマンスと高精細のバランス
  const displayW = window.innerWidth;
  const displayH = window.innerHeight;

  const targetW = Math.round(displayW * dpr);
  const targetH = Math.round(displayH * dpr);

  if (vrCanvas.width !== targetW || vrCanvas.height !== targetH) {
    vrCanvas.width = targetW;
    vrCanvas.height = targetH;
  }
}

/**
 * 1枚のマスターCanvas上に左目（50%）と右目（50%）をアトミックに同時描画する関数
 * アスペクト比（contain）を厳密に維持し、左右均等に配置
 */
function renderSingleCanvasVR() {
  if (!vrCtx || !videoPlayer || videoPlayer.readyState < 2) return;

  const totalW = vrCanvas.width;
  const totalH = vrCanvas.height;
  if (totalW === 0 || totalH === 0) return;

  const halfW = totalW / 2;
  const videoW = videoPlayer.videoWidth;
  const videoH = videoPlayer.videoHeight;

  if (!videoW || !videoH) return;

  // 左右1画面（halfW × totalH）のアスペクト比 contain 計算
  const videoAspect = videoW / videoH;
  const eyeAspect = halfW / totalH;

  let destW, destH, offsetY, leftOffsetX, rightOffsetX;

  if (videoAspect > eyeAspect) {
    // 動画が横長: 幅に合わせて上下に黒帯（レターボックス）
    destW = halfW;
    destH = halfW / videoAspect;
    offsetY = (totalH - destH) / 2;
    leftOffsetX = 0;
    rightOffsetX = halfW;
  } else {
    // 動画が縦長: 高さに合わせて左右に黒帯（ピラーボックス）
    destH = totalH;
    destW = totalH * videoAspect;
    offsetY = 0;
    const sideMargin = (halfW - destW) / 2;
    leftOffsetX = sideMargin;
    rightOffsetX = halfW + sideMargin;
  }

  // 1. 全面を黒でクリア
  vrCtx.fillStyle = '#000000';
  vrCtx.fillRect(0, 0, totalW, totalH);

  // 2. 左目用映像を描画（同一のvideoPlayer現在フレーム）
  vrCtx.drawImage(videoPlayer, leftOffsetX, offsetY, destW, destH);

  // 3. 右目用映像を描画（同一フレーム・完全同時アトミック描画）
  vrCtx.drawImage(videoPlayer, rightOffsetX, offsetY, destW, destH);
}

/**
 * requestVideoFrameCallback 用のコールバック関数
 * 動画デコーダーが新しいフレームを用意した瞬間に発火
 */
function onVideoFrameCallback(now, metadata) {
  if (!isVRMode) return;

  renderSingleCanvasVR();

  // VRモード継続中は次のフレームを登録
  if (videoPlayer && 'requestVideoFrameCallback' in videoPlayer) {
    vfcCallbackId = videoPlayer.requestVideoFrameCallback(onVideoFrameCallback);
  }
}

/**
 * requestAnimationFrame 用のフォールバック描画ループ
 */
function vrRenderLoopRaf() {
  if (!isVRMode) return;

  renderSingleCanvasVR();
  rafCallbackId = requestAnimationFrame(vrRenderLoopRaf);
}

/**
 * VR描画ループを開始する関数
 * requestVideoFrameCallback を最優先で使用し、非対応時は requestAnimationFrame に自動フォールバック
 */
function startVRRenderLoop() {
  stopVRRenderLoop();
  updateVRCanvasDimensions();

  // 初回表示用レンダリング
  renderSingleCanvasVR();

  if (isRVFCSupported && videoPlayer && 'requestVideoFrameCallback' in videoPlayer) {
    if (vrSyncBadge) {
      vrSyncBadge.textContent = '⚡ rVFC Sync (Hardware)';
      vrSyncBadge.style.color = '#86e49d';
      vrSyncBadge.style.borderColor = 'rgba(134, 228, 157, 0.4)';
    }
    vfcCallbackId = videoPlayer.requestVideoFrameCallback(onVideoFrameCallback);
  } else {
    if (vrSyncBadge) {
      vrSyncBadge.textContent = '⏱️ rAF Sync (Fallback)';
      vrSyncBadge.style.color = '#ffd182';
      vrSyncBadge.style.borderColor = 'rgba(255, 209, 130, 0.4)';
    }
    rafCallbackId = requestAnimationFrame(vrRenderLoopRaf);
  }
}

/**
 * VR描画ループを停止する関数
 */
function stopVRRenderLoop() {
  if (vfcCallbackId !== null && videoPlayer && 'cancelVideoFrameCallback' in videoPlayer) {
    try {
      videoPlayer.cancelVideoFrameCallback(vfcCallbackId);
    } catch (e) { /* ignore */ }
    vfcCallbackId = null;
  }
  if (rafCallbackId !== null) {
    cancelAnimationFrame(rafCallbackId);
    rafCallbackId = null;
  }
}

// ============================================================
// VRモードの開始・終了 & UI制御
// ============================================================

/**
 * ローカル動画の2D VRモードを開始する関数
 */
function enterVR() {
  if (currentSourceType === 'youtube') {
    enterYoutubeVR();
    return;
  }

  isVRMode = true;
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  if (vrContainer) vrContainer.style.display = 'flex';

  // 全画面API（対応環境のみ）
  try {
    if (document.fullscreenElement === null && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (e) { /* ignore */ }

  // Canvas初期化 & 描画ループ開始
  updateVRCanvasDimensions();
  startVRRenderLoop();

  // 自動再生を試みる
  videoPlayer.play().catch((err) => {
    console.log('[VR Browser] 自動再生にはタップが必要です:', err.message);
  });

  resetUiFadeTimer();
  updateStatus('VRモードを開始しました。スマホを横向きにしてゴーグルにセットしてください。', 'success');
}

/**
 * VRモードを終了して通常モードに戻る関数
 */
function exitVR() {
  if (currentSourceType === 'youtube') {
    exitYoutubeVR();
    return;
  }

  isVRMode = false;
  stopVRRenderLoop();

  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  if (vrContainer) vrContainer.style.display = 'none';

  // 全画面解除
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch (e) { /* ignore */ }

  if (uiFadeTimeout) {
    clearTimeout(uiFadeTimeout);
    uiFadeTimeout = null;
  }

  updateStatus('通常モードに戻りました。', 'info');
}

/**
 * YouTube VR全画面モードを開始する関数
 */
function enterYoutubeVR() {
  if (!youtubeContainer) return;
  youtubeContainer.classList.add('vr-fullscreen');
  if (youtubeVrUi) youtubeVrUi.style.display = 'block';
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  try {
    if (document.fullscreenElement === null && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  } catch (e) { /* ignore */ }

  if (ytPlayer && typeof ytPlayer.playVideo === 'function') {
    try { ytPlayer.playVideo(); } catch (e) { /* ignore */ }
  }

  updateStatus('YouTube全画面VRモードを開始しました。', 'success');
}

/**
 * YouTube VR全画面モードを終了する関数
 */
function exitYoutubeVR() {
  if (!youtubeContainer) return;
  youtubeContainer.classList.remove('vr-fullscreen');
  if (youtubeVrUi) youtubeVrUi.style.display = 'none';
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  } catch (e) { /* ignore */ }

  updateStatus('YouTube通常モードに戻りました。', 'info');
}

/**
 * VR UIの自動フェードタイマーをリセットする関数
 */
function resetUiFadeTimer() {
  if (!vrUiLayer) return;
  vrUiLayer.classList.remove('faded');
  if (uiFadeTimeout) clearTimeout(uiFadeTimeout);
  uiFadeTimeout = setTimeout(() => {
    if (isVRMode && vrUiLayer) {
      vrUiLayer.classList.add('faded');
    }
  }, 3000);
}

/**
 * 再生 / 一時停止 インジケーターを左右両画面に同時に表示する関数
 * @param {'play' | 'pause'} type
 */
function showPlayPauseIndicator(type) {
  if (!indicatorLeft || !indicatorRight) return;
  const icon = type === 'play' ? '▶' : '❚❚';
  indicatorLeft.textContent = icon;
  indicatorRight.textContent = icon;

  indicatorLeft.classList.add('active');
  indicatorRight.classList.add('active');

  if (indicatorTimeout) clearTimeout(indicatorTimeout);
  indicatorTimeout = setTimeout(() => {
    indicatorLeft.classList.remove('active');
    indicatorRight.classList.remove('active');
  }, 650);
}

// ============================================================
// イベントリスナー設定
// ============================================================

// 1. YouTube読み込みボタン
if (loadYoutubeButton) {
  loadYoutubeButton.addEventListener('click', () => {
    const inputVal = youtubeUrlInput ? youtubeUrlInput.value.trim() : '';
    if (!inputVal) {
      updateStatus('YouTubeのURLを入力してください。', 'warning');
      return;
    }
    const videoId = extractYouTubeVideoId(inputVal);
    if (videoId) {
      loadYouTubeVideo(videoId);
    } else {
      updateStatus('有効なYouTube動画URLまたは動画IDを入力してください。', 'warning');
    }
  });
}

// 2. YouTube URL入力欄のEnterキー押下
if (youtubeUrlInput) {
  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadYoutubeButton.click();
    }
  });
}

// 3. VR開始ボタン
if (vrButton) {
  vrButton.addEventListener('click', () => {
    if (currentSourceType === 'youtube') {
      enterYoutubeVR();
    } else {
      enterVR();
    }
  });
}

// 4. VR終了ボタン（ローカル動画 VR）
if (exitVrButton) {
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });
}

// 5. YouTube VR終了ボタン
if (exitYoutubeVrButton) {
  exitYoutubeVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitYoutubeVR();
  });
}

// 6. VR画面タップで 再生 / 一時停止 切り替え & UI再表示
if (vrContainer) {
  vrContainer.addEventListener('click', (e) => {
    // EXIT VRボタンのクリック時は処理しない
    if (e.target === exitVrButton || (exitVrButton && exitVrButton.contains(e.target))) {
      return;
    }

    if (!isVRMode) return;

    resetUiFadeTimer();

    // 動画の再生/一時停止トグル
    if (videoPlayer.paused) {
      videoPlayer.play().then(() => {
        showPlayPauseIndicator('play');
      }).catch((err) => {
        console.warn('[VR Browser] 再生エラー:', err);
      });
    } else {
      videoPlayer.pause();
      showPlayPauseIndicator('pause');
      // 一時停止時も最新フレームを再描画
      renderSingleCanvasVR();
    }
  });
}

// 7. ローカル動画ファイル選択（端末内の任意の動画をテスト可能）
if (fileInput) {
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const fileUrl = URL.createObjectURL(file);
    videoPlayer.src = fileUrl;
    videoPlayer.load();

    setSourceType('local');
    updateStatus(`動画「${file.name}」を読み込みました。`, 'success');
  });
}

// 8. 画面サイズ変更 / 画面回転時の対応
window.addEventListener('resize', () => {
  if (isVRMode) {
    updateVRCanvasDimensions();
    renderSingleCanvasVR();
  }
});

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    if (isVRMode) {
      updateVRCanvasDimensions();
      renderSingleCanvasVR();
    }
  }, 200);
});

// 9. videoPlayer のイベントリスナー（シーク・再生再開時の描画保証）
if (videoPlayer) {
  videoPlayer.addEventListener('seeked', () => {
    if (isVRMode) {
      renderSingleCanvasVR();
    }
  });

  videoPlayer.addEventListener('play', () => {
    if (isVRMode && !vfcCallbackId && !rafCallbackId) {
      startVRRenderLoop();
    }
  });

  videoPlayer.addEventListener('loadedmetadata', () => {
    if (isVRMode) {
      updateVRCanvasDimensions();
      renderSingleCanvasVR();
    }
  });
}

// ============================================================
// 初期化処理
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  console.log('[VR Browser] Initialized. rVFC support:', isRVFCSupported);
  setSourceType('local');
  updateStatus('準備完了。「2D VR MODE」を押すと左右2画面で再生を開始します。', 'info');
});
