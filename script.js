/**
 * VR Browser - Phase 5: YouTube動画対応 & 2D VRプレイヤー
 * （ジャイロ機能を完全削除し、Phase 4相当の2D VR表示を維持した上でYouTube IFrame Player APIを追加）
 */

// ============================================================
// DOM要素の取得
// ============================================================
const videoPlayer = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const youtubeContainer = document.getElementById('youtubeContainer');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadYoutubeButton = document.getElementById('loadYoutubeButton');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// VR関連要素の取得
const vrButton = document.getElementById('vrButton');
const vrButtonSection = document.getElementById('vrButtonSection');
const exitVrButton = document.getElementById('exitVrButton');
const vrContainer = document.getElementById('vrContainer');
const vrUiLayer = document.getElementById('vrUiLayer');
const canvasLeft = document.getElementById('canvasLeft');
const canvasRight = document.getElementById('canvasRight');
const indicatorLeft = document.getElementById('indicatorLeft');
const indicatorRight = document.getElementById('indicatorRight');

// Canvas 2D コンテキストの取得
const ctxLeft = canvasLeft.getContext('2d');
const ctxRight = canvasRight.getContext('2d');

// 状態管理変数
let isVRMode = false;
let animationFrameId = null;
let uiFadeTimeout = null;
let indicatorTimeout = null;
let currentMode = 'local'; // 'local' | 'youtube'

// YouTube IFrame Player API 関連変数
let ytPlayer = null;
let isYTReady = false;

// ============================================================
// ステータスメッセージ管理
// ============================================================
/**
 * ステータスメッセージを更新する関数
 * @param {string} message - 表示するメッセージ
 * @param {'info' | 'warning' | 'success'} type - メッセージの種類
 */
function updateStatus(message, type = 'info') {
  statusText.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

// ============================================================
// YouTube IFrame Player API 関連処理
// ============================================================

/**
 * YouTube IFrame APIの準備完了コールバック（グローバル関数）
 */
window.onYouTubeIframeAPIReady = function () {
  isYTReady = true;
  console.log('YouTube IFrame Player API is ready.');
};

/**
 * YouTubeのURLまたは文字列から11桁の動画IDを抽出する関数
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

  // 各種YouTube URLパターンに対応（watch, youtu.be, embed, shorts等）
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

/**
 * YouTubeプレイヤーを表示し、ローカルプレイヤーを一時停止
 */
function switchToYouTubeMode() {
  currentMode = 'youtube';
  videoPlayer.pause();
  videoContainer.style.display = 'none';
  youtubeContainer.style.display = 'block';
}

/**
 * ローカル動画プレイヤーを表示し、YouTubeプレイヤーを一時停止
 */
function switchToLocalMode() {
  currentMode = 'local';
  if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
    ytPlayer.pauseVideo();
  }
  youtubeContainer.style.display = 'none';
  videoContainer.style.display = 'flex';
}

/**
 * YouTube動画を読み込んで再生準備を行う関数
 * @param {string} videoId - YouTube動画ID
 */
function loadYouTubeVideo(videoId) {
  if (!videoId) {
    updateStatus('⚠️ 有効なYouTube動画のURLを入力してください。', 'warning');
    return;
  }

  switchToYouTubeMode();
  updateStatus(`YouTube動画（ID: ${videoId}）を読み込み中...`, 'info');

  if (!isYTReady) {
    // APIがまだロード中の場合は少し待って再試行
    setTimeout(() => loadYouTubeVideo(videoId), 300);
    return;
  }

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    // 既存プレイヤーがある場合は動画IDを差し替え
    ytPlayer.loadVideoById({
      videoId: videoId,
      suggestedQuality: 'hd720'
    });
    updateStatus(`✅ YouTube動画を読み込みました。`, 'success');
  } else {
    // 新規にYT.Playerインスタンスを作成
    try {
      ytPlayer = new YT.Player('youtubeIframe', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          playsinline: 1,      // iOS Safariでインライン再生
          rel: 0,              // 関連動画の制限
          modestbranding: 1,   // YouTubeロゴの控えめ表示
          enablejsapi: 1,      // JS APIの有効化
          origin: window.location.origin || undefined
        },
        events: {
          onReady: (event) => {
            updateStatus('✅ YouTubeプレイヤーの準備が完了しました。再生ボタンで視聴できます。', 'success');
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              updateStatus('▶️ YouTube動画を再生中', 'success');
            } else if (event.data === YT.PlayerState.PAUSED) {
              updateStatus('⏸ YouTube動画を一時停止中', 'info');
            } else if (event.data === YT.PlayerState.ENDED) {
              updateStatus('⏹ YouTube動画の再生が終了しました', 'info');
            }
          },
          onError: (event) => {
            console.warn('YouTube Player Error:', event.data);
            let errorMsg = '⚠️ YouTube動画の読み込みに失敗しました。';
            if (event.data === 100 || event.data === 2) {
              errorMsg = '⚠️ 指定されたYouTube動画が見つかりません。URLを確認してください。';
            } else if (event.data === 101 || event.data === 150) {
              errorMsg = '⚠️ この動画は所有者によって他のWebサイトでの埋め込み再生が制限されています。';
            }
            updateStatus(errorMsg, 'warning');
          }
        }
      });
    } catch (err) {
      console.error('YouTube Player Initialization Error:', err);
      updateStatus('⚠️ YouTubeプレイヤーの初期化でエラーが発生しました。', 'warning');
    }
  }
}

// ============================================================
// ローカル2D動画 VRプレイヤー関連処理（Phase 4完全維持・ジャイロなし）
// ============================================================

/**
 * Canvas の内部解像度を動画の本来のネイティブ解像度に合わせる関数
 * （高DPI Retinaディスプレイでも最高画質を維持）
 */
function updateCanvasDimensions() {
  const width = videoPlayer.videoWidth || 1280;
  const height = videoPlayer.videoHeight || 720;

  if (width > 0 && height > 0) {
    if (canvasLeft.width !== width || canvasLeft.height !== height) {
      canvasLeft.width = width;
      canvasLeft.height = height;
      canvasRight.width = width;
      canvasRight.height = height;
    }
  }
}

/**
 * VRモード時の描画ループ（1つのvideoから左右Canvasへ同時描画・左右完全同期）
 */
function renderVRFrame() {
  if (!isVRMode) return;

  // iOS Safariで動画データが利用可能な場合のみ描画
  if (videoPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (videoPlayer.videoWidth && canvasLeft.width !== videoPlayer.videoWidth) {
      updateCanvasDimensions();
    }
    // 左目Canvasに描画
    ctxLeft.drawImage(videoPlayer, 0, 0, canvasLeft.width, canvasLeft.height);
    // 右目Canvasに同じ動画フレームを描画
    ctxRight.drawImage(videoPlayer, 0, 0, canvasRight.width, canvasRight.height);
  }

  // 次のフレーム描画を予約
  animationFrameId = requestAnimationFrame(renderVRFrame);
}

/**
 * VRモード用UIのフェードタイマーをリセット
 */
function resetUiFadeTimer() {
  if (vrUiLayer) {
    vrUiLayer.classList.remove('faded');
  }
  if (uiFadeTimeout) {
    clearTimeout(uiFadeTimeout);
  }
  uiFadeTimeout = setTimeout(() => {
    if (isVRMode && vrUiLayer) {
      vrUiLayer.classList.add('faded');
    }
  }, 3000);
}

/**
 * 再生 / 一時停止時のHUDインジケーター表示
 */
function showPlayPauseIndicator(isPlaying) {
  const icon = isPlaying ? '▶' : '⏸';
  indicatorLeft.textContent = icon;
  indicatorRight.textContent = icon;
  indicatorLeft.classList.add('show');
  indicatorRight.classList.add('show');

  if (indicatorTimeout) clearTimeout(indicatorTimeout);
  indicatorTimeout = setTimeout(() => {
    indicatorLeft.classList.remove('show');
    indicatorRight.classList.remove('show');
  }, 800);
}

/**
 * 安全に動画再生を試みるヘルパー関数
 */
function safePlayVideo() {
  const playPromise = videoPlayer.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        showPlayPauseIndicator(true);
      })
      .catch((err) => {
        console.warn('iOS Safari: 再生制限ハンドリング:', err);
      });
  }
}

/**
 * 2D VRモードを開始する関数
 */
function enterVR() {
  // ローカル動画モードへ切り替え
  switchToLocalMode();

  if (videoPlayer.error || (!videoPlayer.src && videoPlayer.children.length === 0)) {
    alert('動画が読み込まれていません。test.mp4を配置するか、動画ファイルを選択してください。');
    return;
  }

  isVRMode = true;
  vrContainer.style.display = 'flex';
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  // Canvasの解像度初期化
  updateCanvasDimensions();

  // 描画ループを開始
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  animationFrameId = requestAnimationFrame(renderVRFrame);

  // UIフェードタイマー開始
  resetUiFadeTimer();
}

/**
 * VRモードを終了する関数
 */
function exitVR() {
  isVRMode = false;
  vrContainer.style.display = 'none';
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  // 描画ループ停止
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (uiFadeTimeout) {
    clearTimeout(uiFadeTimeout);
  }
  if (vrUiLayer) {
    vrUiLayer.classList.remove('faded');
  }
}

// ============================================================
// 初期化処理
// ============================================================
function initPlayer() {
  updateStatus('動画（test.mp4）の読み込みを確認中...', 'info');

  // ローカル動画のイベント
  videoPlayer.addEventListener('loadeddata', () => {
    updateStatus('✅ 動画の読み込みに成功しました。再生または「2D VR MODE」を押してください。', 'success');
    updateCanvasDimensions();
  });

  videoPlayer.addEventListener('loadedmetadata', updateCanvasDimensions);
  videoPlayer.addEventListener('canplay', updateCanvasDimensions);

  videoPlayer.addEventListener('error', (e) => {
    console.warn('動画の読み込みエラー:', videoPlayer.error);
    if (currentMode === 'local') {
      updateStatus(
        '⚠️ 「test.mp4」が見つかりません。フォルダ内に「test.mp4」を追加するか、ファイル選択・YouTube URLから動画を読み込んでください。',
        'warning'
      );
    }
  });

  // ファイルピッカーで任意のローカル動画が選択されたとき
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      switchToLocalMode();
      const fileUrl = URL.createObjectURL(file);
      videoPlayer.src = fileUrl;
      videoPlayer.load();
      updateStatus(`📁 選択した動画「${file.name}」を読み込みました。`, 'success');
    }
  });

  // YouTube読み込みボタンのイベント
  loadYoutubeButton.addEventListener('click', () => {
    const url = youtubeUrlInput.value;
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      loadYouTubeVideo(videoId);
    } else {
      updateStatus('⚠️ 有効なYouTube URL（https://www.youtube.com/watch?v=... など）を入力してください。', 'warning');
    }
  });

  // YouTube入力欄でのEnterキー押下
  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadYoutubeButton.click();
    }
  });

  // VR開始ボタン
  vrButton.addEventListener('click', enterVR);

  // EXIT VRボタン
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // VR画面タップ（再生 / 一時停止）
  vrContainer.addEventListener('click', (e) => {
    if (e.target !== exitVrButton) {
      if (videoPlayer.paused) {
        safePlayVideo();
      } else {
        videoPlayer.pause();
        showPlayPauseIndicator(false);
      }
      resetUiFadeTimer();
    }
  });

  // マウス移動・タッチ時にVR UIを表示
  vrContainer.addEventListener('mousemove', resetUiFadeTimer);
  vrContainer.addEventListener('touchstart', resetUiFadeTimer, { passive: true });

  // キーボード操作（PCテスト用）
  window.addEventListener('keydown', (e) => {
    if (!isVRMode) return;

    if (e.key === 'Escape') {
      exitVR();
    } else if (e.key === ' ') {
      e.preventDefault();
      if (videoPlayer.paused) {
        safePlayVideo();
      } else {
        videoPlayer.pause();
        showPlayPauseIndicator(false);
      }
      resetUiFadeTimer();
    }
  });

  // リサイズ・画面回転
  window.addEventListener('resize', () => {
    if (isVRMode) {
      updateCanvasDimensions();
    }
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (isVRMode) {
        updateCanvasDimensions();
      }
    }, 200);
  });

  // VRモード中のスクロール完全抑止
  window.addEventListener('touchmove', (e) => {
    if (isVRMode) {
      e.preventDefault();
    }
  }, { passive: false });

  // バックグラウンド復帰処理（タブ切り替え・スリープ復帰時のCanvasフリーズ防止）
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    } else {
      if (isVRMode && !animationFrameId) {
        animationFrameId = requestAnimationFrame(renderVRFrame);
      }
    }
  });
}

// ページの読み込み完了時に初期化を実行
document.addEventListener('DOMContentLoaded', initPlayer);
