/**
 * VR Browser - Phase 5.2: YouTube 左右2画面 & ローカル動画 VRプレイヤー
 * （YouTube VR MODE時に左右50:50の2画面YouTubeプレイヤーを表示・同期再生）
 */

// ============================================================
// DOM要素の取得
// ============================================================
const videoPlayer = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const youtubeContainer = document.getElementById('youtubeContainer');
const youtubeVrContainer = document.getElementById('youtubeVrContainer');
const exitYoutubeVrButton = document.getElementById('exitYoutubeVrButton');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadYoutubeButton = document.getElementById('loadYoutubeButton');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// VR関連要素の取得（LOCAL用）
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

// ============================================================
// 状態管理変数
// ============================================================
let currentSourceType = 'local'; // 'local' | 'youtube'
let isVRMode = false;
let animationFrameId = null;
let uiFadeTimeout = null;
let indicatorTimeout = null;

// YouTube IFrame Player API 関連変数
let isYTReady = false;
let currentYouTubeVideoId = null;
let ytPlayerNormal = null; // 通常モード用プレイヤー
let ytPlayerLeft = null;   // VR左目用プレイヤー
let ytPlayerRight = null;  // VR右目用プレイヤー

// ============================================================
// ステータスメッセージ & ソースモード切り替え
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

/**
 * 現在の動画ソース（LOCAL / YOUTUBE）を切り替える関数
 * @param {'local' | 'youtube'} type - 切り替える動画ソースの種類
 */
function setSourceType(type) {
  currentSourceType = type;

  if (type === 'local') {
    // ローカル動画モード
    pauseAllYouTubePlayers();
    youtubeContainer.style.display = 'none';
    youtubeVrContainer.style.display = 'none';
    videoContainer.style.display = 'flex';
    vrButton.textContent = '🥽 2D VR MODE（ローカル動画）';
  } else if (type === 'youtube') {
    // YouTube動画モード
    videoPlayer.pause();
    videoContainer.style.display = 'none';
    vrContainer.style.display = 'none';
    youtubeContainer.style.display = 'block';
    vrButton.textContent = '🥽 VR MODE（YouTube 左右2画面）';
  }
}

/**
 * すべてのYouTubeプレイヤーを安全に一時停止
 */
function pauseAllYouTubePlayers() {
  if (ytPlayerNormal && typeof ytPlayerNormal.pauseVideo === 'function') {
    ytPlayerNormal.pauseVideo();
  }
  if (ytPlayerLeft && typeof ytPlayerLeft.pauseVideo === 'function') {
    ytPlayerLeft.pauseVideo();
  }
  if (ytPlayerRight && typeof ytPlayerRight.pauseVideo === 'function') {
    ytPlayerRight.pauseVideo();
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
 * YouTube動画を通常プレイヤーに読み込んで再生準備を行う関数
 * @param {string} videoId - YouTube動画ID
 */
function loadYouTubeVideo(videoId) {
  if (!videoId) {
    updateStatus('⚠️ 有効なYouTube動画のURLを入力してください。', 'warning');
    return;
  }

  currentYouTubeVideoId = videoId;
  setSourceType('youtube');
  updateStatus(`YouTube動画（ID: ${videoId}）を読み込み中...`, 'info');

  if (!isYTReady) {
    setTimeout(() => loadYouTubeVideo(videoId), 300);
    return;
  }

  if (ytPlayerNormal && typeof ytPlayerNormal.loadVideoById === 'function') {
    ytPlayerNormal.loadVideoById({
      videoId: videoId,
      suggestedQuality: 'hd720'
    });
    updateStatus(`✅ YouTube動画を読み込みました。再生または「VR MODE」を押してください。`, 'success');
  } else {
    try {
      ytPlayerNormal = new YT.Player('youtubeIframeNormal', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          origin: window.location.origin || undefined
        },
        events: {
          onReady: () => {
            updateStatus('✅ YouTubeプレイヤーの準備が完了しました。再生ボタンまたは「VR MODE」を押してください。', 'success');
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

/**
 * YouTube VR左右2画面プレイヤーのセットアップと同期再生
 * @param {string} videoId - 再生するYouTube動画ID
 * @param {number} startSeconds - 開始秒数
 */
function setupYouTubeVrPlayers(videoId, startSeconds = 0) {
  const roundedStart = Math.max(0, Math.floor(startSeconds));

  // 1. 左目用プレイヤー（マスター）の初期化 / ロード
  if (ytPlayerLeft && typeof ytPlayerLeft.loadVideoById === 'function') {
    ytPlayerLeft.loadVideoById({
      videoId: videoId,
      startSeconds: roundedStart,
      suggestedQuality: 'hd720'
    });
    ytPlayerLeft.playVideo();
  } else {
    try {
      ytPlayerLeft = new YT.Player('youtubeIframeLeft', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          start: roundedStart,
          origin: window.location.origin || undefined
        },
        events: {
          onReady: (e) => {
            e.target.seekTo(startSeconds, true);
            e.target.playVideo();
          },
          onStateChange: handleLeftPlayerStateChange
        }
      });
    } catch (err) {
      console.error('YouTube VR Left Player Error:', err);
    }
  }

  // 2. 右目用プレイヤー（スレーブ）の初期化 / ロード（音声をミュートしてエコー・ズレを完全防止）
  if (ytPlayerRight && typeof ytPlayerRight.loadVideoById === 'function') {
    ytPlayerRight.mute(); // 右側はミュート
    ytPlayerRight.loadVideoById({
      videoId: videoId,
      startSeconds: roundedStart,
      suggestedQuality: 'hd720'
    });
    ytPlayerRight.playVideo();
  } else {
    try {
      ytPlayerRight = new YT.Player('youtubeIframeRight', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          start: roundedStart,
          origin: window.location.origin || undefined
        },
        events: {
          onReady: (e) => {
            e.target.mute(); // 右側はミュート
            e.target.seekTo(startSeconds, true);
            e.target.playVideo();
          }
        }
      });
    } catch (err) {
      console.error('YouTube VR Right Player Error:', err);
    }
  }
}

/**
 * 左目YouTubeプレイヤー（マスター）の再生状態変化を右目プレイヤーに同期
 */
function handleLeftPlayerStateChange(event) {
  if (!ytPlayerRight || typeof ytPlayerRight.playVideo !== 'function') return;

  if (event.data === YT.PlayerState.PLAYING) {
    // 再生状態の同期 & 再生位置の微調整
    const leftTime = (ytPlayerLeft && typeof ytPlayerLeft.getCurrentTime === 'function') ? ytPlayerLeft.getCurrentTime() : 0;
    const rightTime = (typeof ytPlayerRight.getCurrentTime === 'function') ? ytPlayerRight.getCurrentTime() : 0;
    if (Math.abs(leftTime - rightTime) > 0.3) {
      ytPlayerRight.seekTo(leftTime, true);
    }
    ytPlayerRight.playVideo();
  } else if (event.data === YT.PlayerState.PAUSED) {
    ytPlayerRight.pauseVideo();
  } else if (event.data === YT.PlayerState.BUFFERING) {
    ytPlayerRight.pauseVideo();
  }
}

// ============================================================
// ローカル2D動画 VRプレイヤー描画処理（Phase 4完全維持）
// ============================================================

/**
 * Canvas の内部解像度を動画の本来のネイティブ解像度に合わせる関数
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
 * VRモード時の描画ループ（1つのvideoから左右Canvasへ同時描画）
 */
function renderVRFrame() {
  if (!isVRMode || currentSourceType !== 'local') return;

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

// ============================================================
// VRモード開始・終了処理（LOCAL / YOUTUBE 完全分岐）
// ============================================================

/**
 * VRモードを開始する関数
 * 現在選択中の動画ソース（LOCAL / YOUTUBE）を正しく判定して起動
 */
function enterVR() {
  if (currentSourceType === 'local') {
    // ----------------------------------------------------
    // 1. ローカル動画の場合: Phase 4 左右2画面 Canvas VR表示
    // ----------------------------------------------------
    if (videoPlayer.error || (!videoPlayer.src && videoPlayer.children.length === 0)) {
      alert('ローカル動画が読み込まれていません。test.mp4を配置するか、動画ファイルを選択してください。');
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

  } else if (currentSourceType === 'youtube') {
    // ----------------------------------------------------
    // 2. YouTube動画の場合: 左右50:50 YouTube 2画面 VR表示
    // ----------------------------------------------------
    if (!currentYouTubeVideoId) {
      alert('YouTube動画が読み込まれていません。YouTube URLを入力して「読み込む」を押してください。');
      return;
    }

    // test.mp4 は絶対に再生しない
    videoPlayer.pause();

    // 通常プレイヤーの現在再生位置を取得
    let currentSeconds = 0;
    if (ytPlayerNormal && typeof ytPlayerNormal.getCurrentTime === 'function') {
      currentSeconds = ytPlayerNormal.getCurrentTime() || 0;
      ytPlayerNormal.pauseVideo();
    }

    isVRMode = true;
    document.documentElement.classList.add('vr-active');
    document.body.classList.add('vr-active');

    // YouTube 左右2画面 VRコンテナを表示
    youtubeVrContainer.style.display = 'flex';

    // 左右のプレイヤーを初期化・同期再生開始
    setupYouTubeVrPlayers(currentYouTubeVideoId, currentSeconds);
  }
}

/**
 * VRモードを終了する関数
 */
function exitVR() {
  isVRMode = false;
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  if (currentSourceType === 'local') {
    // ローカルVRの終了
    vrContainer.style.display = 'none';

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
  } else if (currentSourceType === 'youtube') {
    // YouTube VRの終了（左右プレイヤーを停止し、通常プレイヤーへ復帰）
    let currentSeconds = 0;
    if (ytPlayerLeft && typeof ytPlayerLeft.getCurrentTime === 'function') {
      currentSeconds = ytPlayerLeft.getCurrentTime() || 0;
    }

    pauseAllYouTubePlayers();
    youtubeVrContainer.style.display = 'none';

    // 通常プレイヤーに再生位置を引き継ぐ
    if (ytPlayerNormal && typeof ytPlayerNormal.seekTo === 'function') {
      ytPlayerNormal.seekTo(currentSeconds, true);
    }
  }
}

// ============================================================
// 初期化処理
// ============================================================
function initPlayer() {
  // 初期状態はローカル動画モード
  setSourceType('local');
  updateStatus('動画（test.mp4）の読み込みを確認中...', 'info');

  // ローカル動画のイベントリスナー
  videoPlayer.addEventListener('loadeddata', () => {
    if (currentSourceType === 'local') {
      updateStatus('✅ 動画の読み込みに成功しました。再生または「2D VR MODE」を押してください。', 'success');
      updateCanvasDimensions();
    }
  });

  videoPlayer.addEventListener('loadedmetadata', updateCanvasDimensions);
  videoPlayer.addEventListener('canplay', updateCanvasDimensions);

  videoPlayer.addEventListener('error', (e) => {
    console.warn('動画の読み込みエラー:', videoPlayer.error);
    if (currentSourceType === 'local') {
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
      setSourceType('local'); // ローカルモードへ確実に切り替え
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

  // ローカルVR用の EXIT VRボタン
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // YouTube VR用の EXIT VRボタン
  exitYoutubeVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // ローカルVR画面タップ（再生 / 一時停止）
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
    } else if (e.key === ' ' && currentSourceType === 'local') {
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
    if (isVRMode && currentSourceType === 'local') {
      updateCanvasDimensions();
    }
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (isVRMode && currentSourceType === 'local') {
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
      if (isVRMode && currentSourceType === 'local' && !animationFrameId) {
        animationFrameId = requestAnimationFrame(renderVRFrame);
      }
    }
  });
}

// ページの読み込み完了時に初期化を実行
document.addEventListener('DOMContentLoaded', initPlayer);
