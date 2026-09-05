/**
 * VR Browser - Phase 6: YouTube 360°動画 実機検証 & ローカルVR
 * （1つのYouTube公式プレイヤーを用いてiPhone Safariでの360°動作を検証）
 */

// ============================================================
// DOM要素の取得
// ============================================================
const videoPlayer = document.getElementById('videoPlayer');
const videoContainer = document.getElementById('videoContainer');
const youtubeContainer = document.getElementById('youtubeContainer');
const test360UiLayer = document.getElementById('test360UiLayer');
const exit360TestButton = document.getElementById('exit360TestButton');
const youtubeUrlInput = document.getElementById('youtubeUrlInput');
const loadYoutubeButton = document.getElementById('loadYoutubeButton');
const sample360Btn = document.getElementById('sample360Btn');
const vrButton = document.getElementById('vrButton');
const test360Button = document.getElementById('test360Button');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// 360° 検証情報表示要素
const infoVideoId = document.getElementById('infoVideoId');
const infoSpherical = document.getElementById('infoSpherical');
const infoProperties = document.getElementById('infoProperties');

// LOCAL VR関連要素の取得
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
let is360TestMode = false;
let animationFrameId = null;
let uiFadeTimeout = null;
let indicatorTimeout = null;
let sphericalPollInterval = null;

// YouTube IFrame Player API 関連変数（単一プレイヤー）
let isYTReady = false;
let currentYouTubeVideoId = null;
let ytPlayer = null;

// 定番の360°テスト用サンプル動画URL
const SAMPLE_360_URL = 'https://www.youtube.com/watch?v=2OzlksZBTiA';

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
    if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') {
      ytPlayer.pauseVideo();
    }
    youtubeContainer.style.display = 'none';
    youtubeContainer.classList.remove('test360-fullscreen');
    test360UiLayer.style.display = 'none';
    videoContainer.style.display = 'flex';
    vrButton.style.display = 'block';
    test360Button.style.display = 'none';
  } else if (type === 'youtube') {
    // YouTube動画モード
    videoPlayer.pause();
    videoContainer.style.display = 'none';
    vrContainer.style.display = 'none';
    youtubeContainer.style.display = 'block';
    vrButton.style.display = 'none';
    test360Button.style.display = 'block';
  }
}

// ============================================================
// YouTube IFrame Player API 関連処理（単一プレイヤー）
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
 * YouTube動画を単一プレイヤーに読み込んで再生準備を行う関数
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

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    ytPlayer.loadVideoById({
      videoId: videoId,
      suggestedQuality: 'hd720'
    });
    updateStatus(`✅ YouTube動画を読み込みました。再生または「360° TEST」を押してください。`, 'success');
  } else {
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
          onReady: () => {
            updateStatus('✅ YouTubeプレイヤーの準備が完了しました。再生または「360° TEST」を押してください。', 'success');
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              updateStatus('▶️ YouTube動画を再生中', 'success');
              checkSphericalProperties();
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
// Phase 6: YouTube 360°動画 実機検証機能
// ============================================================

/**
 * YouTube IFrame Player API の 360°（Spherical）関連APIを呼び出して確認
 */
function checkSphericalProperties() {
  if (!ytPlayer) return;

  infoVideoId.textContent = currentYouTubeVideoId || '-';

  // 公式API: getSphericalProperties() の存在と実行確認
  if (typeof ytPlayer.getSphericalProperties === 'function') {
    try {
      const props = ytPlayer.getSphericalProperties();
      if (props && Object.keys(props).length > 0) {
        infoSpherical.textContent = '✅ 360°動画として認識中 (Spherical API対応)';
        const yaw = props.yaw !== undefined ? props.yaw.toFixed(1) + '°' : 'N/A';
        const pitch = props.pitch !== undefined ? props.pitch.toFixed(1) + '°' : 'N/A';
        const roll = props.roll !== undefined ? props.roll.toFixed(1) + '°' : 'N/A';
        const fov = props.fov !== undefined ? props.fov.toFixed(1) + '°' : 'N/A';
        infoProperties.textContent = `yaw: ${yaw}, pitch: ${pitch}, roll: ${roll}, fov: ${fov}`;
      } else {
        infoSpherical.textContent = '⚠️ Spherical API利用可能（空または未初期化）';
        infoProperties.textContent = '通常2D動画 または メタデータ読み込み中';
      }
    } catch (err) {
      infoSpherical.textContent = `⚠️ 例外: ${err.message}`;
      infoProperties.textContent = '取得エラー';
    }
  } else {
    infoSpherical.textContent = '❌ getSphericalProperties API 未提供（ブラウザ環境または埋め込み制限）';
    infoProperties.textContent = 'N/A';
  }
}

/**
 * 360° TEST を開始する関数（全画面シアター表示 + 検証パネル表示）
 */
function enter360Test() {
  if (!currentYouTubeVideoId || !ytPlayer) {
    alert('YouTube動画が読み込まれていません。YouTube URLを入力して「読み込む」を押してください。');
    return;
  }

  // test.mp4 は絶対に再生しない
  videoPlayer.pause();

  is360TestMode = true;
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  // 単一のYouTubeプレイヤーを全画面シアター表示化
  youtubeContainer.classList.add('test360-fullscreen');
  test360UiLayer.style.display = 'flex';

  // 動画を再生開始
  if (typeof ytPlayer.playVideo === 'function') {
    ytPlayer.playVideo();
  }

  // 1秒ごとにSpherical APIの状態を更新
  checkSphericalProperties();
  if (sphericalPollInterval) clearInterval(sphericalPollInterval);
  sphericalPollInterval = setInterval(checkSphericalProperties, 1000);
}

/**
 * 360° TEST を終了する関数
 */
function exit360Test() {
  is360TestMode = false;
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  youtubeContainer.classList.remove('test360-fullscreen');
  test360UiLayer.style.display = 'none';

  if (sphericalPollInterval) {
    clearInterval(sphericalPollInterval);
    sphericalPollInterval = null;
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

/**
 * ローカル動画用 VRモードを開始する関数
 */
function enterVR() {
  if (currentSourceType !== 'local') return;

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
}

/**
 * ローカル動画用 VRモードを終了する関数
 */
function exitVR() {
  isVRMode = false;
  vrContainer.style.display = 'none';
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

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

  // 360° サンプルURLボタンのイベント
  sample360Btn.addEventListener('click', () => {
    youtubeUrlInput.value = SAMPLE_360_URL;
    const videoId = extractYouTubeVideoId(SAMPLE_360_URL);
    if (videoId) {
      loadYouTubeVideo(videoId);
    }
  });

  // YouTube入力欄でのEnterキー押下
  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadYoutubeButton.click();
    }
  });

  // ローカルVR開始ボタン
  vrButton.addEventListener('click', enterVR);

  // 360° TEST開始ボタン
  test360Button.addEventListener('click', enter360Test);

  // ローカルVR用の EXIT VRボタン
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // 360° TEST用の EXIT ボタン
  exit360TestButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exit360Test();
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
    if (isVRMode) {
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
    } else if (is360TestMode) {
      if (e.key === 'Escape') {
        exit360Test();
      }
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
    if (isVRMode || is360TestMode) {
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
