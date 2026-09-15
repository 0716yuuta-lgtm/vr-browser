/**
 * VR Browser - Phase 5 復旧安定版: YouTube & ローカル動画 VRプレイヤー
 * （YouTube URLの確実な読み込み・再生・一時停止と、ローカル動画の左右2画面Canvas VRモードを完全復旧）
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

// 360° 実機検証用要素の取得
const sample360Btn = document.getElementById('sample360Btn');
const test360Button = document.getElementById('test360Button');
const test360UiLayer = document.getElementById('test360UiLayer');
const exit360TestButton = document.getElementById('exit360TestButton');
const hudApiStatus = document.getElementById('hudApiStatus');
const valYaw = document.getElementById('valYaw');
const valPitch = document.getElementById('valPitch');
const valRoll = document.getElementById('valRoll');
const valFov = document.getElementById('valFov');
const btnYawLeft = document.getElementById('btnYawLeft');
const btnPitchUp = document.getElementById('btnPitchUp');
const btnPitchDown = document.getElementById('btnPitchDown');
const btnYawRight = document.getElementById('btnYawRight');
const btnResetSpherical = document.getElementById('btnResetSpherical');
const toggleHudDetailsBtn = document.getElementById('toggleHudDetailsBtn');
const hudBody = document.getElementById('hudBody');

// Phase 7: WebGL 360° 要素の取得
const webgl360Button = document.getElementById('webgl360Button');
const webgl360Container = document.getElementById('webgl360Container');
const webglCanvas = document.getElementById('webglCanvas');
const webglUiLayer = document.getElementById('webglUiLayer');
const exitWebgl360Button = document.getElementById('exitWebgl360Button');
const webglHudPanel = document.getElementById('webglHudPanel');
const toggleWebglHudBtn = document.getElementById('toggleWebglHudBtn');
const webglHudBody = document.getElementById('webglHudBody');
const webglYawVal = document.getElementById('webglYawVal');
const webglPitchVal = document.getElementById('webglPitchVal');
const webglFovVal = document.getElementById('webglFovVal');
const webglTextureStatus = document.getElementById('webglTextureStatus');
const webglBtnLeft = document.getElementById('webglBtnLeft');
const webglBtnUp = document.getElementById('webglBtnUp');
const webglBtnDown = document.getElementById('webglBtnDown');
const webglBtnRight = document.getElementById('webglBtnRight');
const webglBtnReset = document.getElementById('webglBtnReset');
const webglFileInput = document.getElementById('webglFileInput');

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

// ============================================================
// 状態管理変数
// ============================================================
let currentSourceType = 'local'; // 'local' | 'youtube'
let isVRMode = false;
let is360TestMode = false;
let sphericalPollInterval = null;
let currentSpherical = { yaw: 0, pitch: 0, roll: 0, fov: 100 };
const SAMPLE_360_URL = 'https://www.youtube.com/watch?v=2OzlksZBTiA';
let animationFrameId = null;
let uiFadeTimeout = null;
let indicatorTimeout = null;

// Phase 7: WebGL 360° 状態変数
let isWebGL360Mode = false;
let webglYaw = 0.0;
let webglPitch = 0.0;
let webglFov = 75.0;
let webglAnimationFrameId = null;

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
    youtubeContainer.classList.remove('vr-fullscreen', 'test360-fullscreen');
    youtubeVrUi.style.display = 'none';
    if (test360UiLayer) test360UiLayer.style.display = 'none';
    if (test360Button) test360Button.style.display = 'none';
    if (webgl360Button) webgl360Button.style.display = 'block';
    videoContainer.style.display = 'flex';
    vrButton.textContent = '🥽 2D VR MODE（ローカル動画）';
  } else if (type === 'youtube') {
    // YouTube動画モード
    videoPlayer.pause();
    if (isWebGL360Mode) exitWebGL360();
    videoContainer.style.display = 'none';
    vrContainer.style.display = 'none';
    if (webgl360Container) webgl360Container.style.display = 'none';
    youtubeContainer.style.display = 'block';
    if (webgl360Button) webgl360Button.style.display = 'none';
    if (test360Button) test360Button.style.display = 'block';
    vrButton.textContent = '🥽 VR MODE（YouTube動画）';
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

    // youtube.com/watch?v=XXXXXXXXXXX または embed/XXXXXXXXXXX または shorts/XXXXXXXXXXX または v/XXXXXXXXXXX
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
    console.warn('URL抽出エラー:', err);
  }

  return null;
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

  currentYouTubeVideoId = videoId;
  setSourceType('youtube');
  updateStatus(`YouTube動画（ID: ${videoId}）を読み込み中...`, 'info');

  // APIの準備待ち
  if (!isYTReady && (!window.YT || !window.YT.Player)) {
    setTimeout(() => loadYouTubeVideo(videoId), 300);
    return;
  }
  isYTReady = true;

  if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
    // 既存プレイヤーがある場合は動画IDを差し替え
    try {
      ytPlayer.loadVideoById({
        videoId: videoId,
        suggestedQuality: 'hd720'
      });
      updateStatus(`✅ YouTube動画を読み込みました。再生または「VR MODE」「360° TEST」を押してください。`, 'success');
    } catch (e) {
      console.warn('loadVideoById例外、再生成を試みます:', e);
      ytPlayer = null;
      loadYouTubeVideo(videoId);
    }
  } else {
    // 新規にYT.Playerインスタンスを作成
    try {
      ytPlayer = new YT.Player('youtubeIframe', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
          playsinline: 1,              // iOS Safariでインライン再生
          rel: 0,                      // 関連動画の制限
          modestbranding: 1,           // YouTubeロゴの控えめ表示
          enablejsapi: 1,              // JS APIの有効化
          enableOrientationSensor: 1, // 360°動画時の端末センサー連携設定
          origin: window.location.origin || undefined
        },
        events: {
          onReady: (event) => {
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
    // 2. YouTube動画の場合: YouTube IFrame を全画面VRで表示
    // ----------------------------------------------------
    if (!ytPlayer || !currentYouTubeVideoId) {
      alert('YouTube動画が読み込まれていません。YouTube URLを入力して「読み込む」を押してください。');
      return;
    }

    // test.mp4 は絶対に再生しない
    videoPlayer.pause();

    isVRMode = true;
    document.documentElement.classList.add('vr-active');
    document.body.classList.add('vr-active');

    // YouTubeプレイヤーコンテナを全画面VR化
    youtubeContainer.classList.add('vr-fullscreen');
    youtubeVrUi.style.display = 'block';

    // 動画を再生開始
    if (typeof ytPlayer.playVideo === 'function') {
      ytPlayer.playVideo();
    }
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
    // YouTube VRの終了（全画面クラスを解除）
    youtubeContainer.classList.remove('vr-fullscreen');
    youtubeVrUi.style.display = 'none';
  }
}

// ============================================================
// Phase 6: YouTube 360° 実機検証処理 (YouTube Spherical API)
// ============================================================

/**
 * YouTube IFrame API の getSphericalProperties() を取得し、HUD表示を更新する関数
 */
function updateSphericalDisplay() {
  if (!ytPlayer || typeof ytPlayer.getSphericalProperties !== 'function') {
    if (hudApiStatus) {
      hudApiStatus.textContent = '⚠️ API未準備';
      hudApiStatus.style.color = '#ffd182';
    }
    return;
  }

  try {
    const props = ytPlayer.getSphericalProperties();
    if (props && typeof props === 'object' && ('yaw' in props || 'pitch' in props || 'fov' in props)) {
      currentSpherical = {
        yaw: props.yaw !== undefined ? props.yaw : currentSpherical.yaw,
        pitch: props.pitch !== undefined ? props.pitch : currentSpherical.pitch,
        roll: props.roll !== undefined ? props.roll : currentSpherical.roll,
        fov: props.fov !== undefined ? props.fov : currentSpherical.fov
      };

      if (hudApiStatus) {
        hudApiStatus.textContent = '✅ API利用可能 (360°動画)';
        hudApiStatus.style.color = '#86e49d';
      }
      if (valYaw) valYaw.textContent = `${currentSpherical.yaw.toFixed(1)}°`;
      if (valPitch) valPitch.textContent = `${currentSpherical.pitch.toFixed(1)}°`;
      if (valRoll) valRoll.textContent = `${currentSpherical.roll.toFixed(1)}°`;
      if (valFov) valFov.textContent = `${currentSpherical.fov.toFixed(1)}°`;
    } else {
      if (hudApiStatus) {
        hudApiStatus.textContent = 'ℹ️ 360°動画以外の可能性 (または未再生)';
        hudApiStatus.style.color = '#ffd182';
      }
    }
  } catch (err) {
    console.warn('getSphericalProperties 取得エラー:', err);
    if (hudApiStatus) {
      hudApiStatus.textContent = '⚠️ 取得エラー';
      hudApiStatus.style.color = '#ff8b85';
    }
  }
}

/**
 * YouTube IFrame API の setSphericalProperties() で視点オフセットを適用するテスト関数
 * @param {number} dYaw - 水平方向の相対変化量（度）
 * @param {number} dPitch - 垂直方向の相対変化量（度）
 */
function setSphericalOffset(dYaw, dPitch) {
  if (!ytPlayer || typeof ytPlayer.setSphericalProperties !== 'function') {
    updateStatus('⚠️ YouTubeプレイヤーのSpherical APIが利用できません。', 'warning');
    return;
  }

  let newYaw = (currentSpherical.yaw + dYaw) % 360;
  if (newYaw < -180) newYaw += 360;
  if (newYaw > 180) newYaw -= 360;

  let newPitch = Math.max(-90, Math.min(90, currentSpherical.pitch + dPitch));

  currentSpherical.yaw = newYaw;
  currentSpherical.pitch = newPitch;

  try {
    ytPlayer.setSphericalProperties({
      yaw: currentSpherical.yaw,
      pitch: currentSpherical.pitch,
      roll: currentSpherical.roll,
      fov: currentSpherical.fov
    });
    updateSphericalDisplay();
  } catch (err) {
    console.warn('setSphericalProperties 実行エラー:', err);
  }
}

/**
 * 視点を初期状態（正面: yaw=0, pitch=0, roll=0, fov=100）にリセットする関数
 */
function resetSpherical() {
  if (!ytPlayer || typeof ytPlayer.setSphericalProperties !== 'function') return;

  currentSpherical = { yaw: 0, pitch: 0, roll: 0, fov: 100 };

  try {
    ytPlayer.setSphericalProperties({
      yaw: 0,
      pitch: 0,
      roll: 0,
      fov: 100
    });
    updateSphericalDisplay();
  } catch (err) {
    console.warn('resetSpherical 実行エラー:', err);
  }
}

/**
 * 360°実機検証モードを開始する関数
 */
function enter360Test() {
  if (!ytPlayer || !currentYouTubeVideoId) {
    alert('YouTube動画が読み込まれていません。URLを入力して「読み込む」を押してください。');
    return;
  }

  // test.mp4 は絶対に再生しない
  videoPlayer.pause();

  is360TestMode = true;
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  // YouTubeプレイヤーを360°テスト用全画面化
  youtubeContainer.classList.add('test360-fullscreen');
  test360UiLayer.style.display = 'flex';

  // 動画を再生開始
  if (typeof ytPlayer.playVideo === 'function') {
    ytPlayer.playVideo();
  }

  // Spherical API の定期ポーリング開始 (500ms間隔)
  if (sphericalPollInterval) {
    clearInterval(sphericalPollInterval);
  }
  sphericalPollInterval = setInterval(updateSphericalDisplay, 500);
  updateSphericalDisplay();
}

/**
 * 360°実機検証モードを終了する関数
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
// Phase 7: Pure WebGL 360° 球面動画レンダラー
// ============================================================

let glContext = null;
let glProgram = null;
const glUniforms = {};
const glBuffers = {};
let glVideoTexture = null;
let glSphereIndexCount = 0;
let isWebGLInitialized = false;

// 頂点シェーダー（GLSL 1.0）
const VS_SOURCE = `
  attribute vec3 aPosition;
  attribute vec2 aTexCoord;

  uniform mat4 uProjectionMatrix;
  uniform mat4 uViewMatrix;

  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aTexCoord;
    gl_Position = uProjectionMatrix * uViewMatrix * vec4(aPosition, 1.0);
  }
`;

// フラグメントシェーダー（GLSL 1.0）
const FS_SOURCE = `
  precision mediump float;

  varying vec2 vTexCoord;
  uniform sampler2D uSampler;

  void main() {
    gl_FragColor = texture2D(uSampler, vTexCoord);
  }
`;

/**
 * シェーダーをコンパイルするヘルパー関数
 */
function compileShader(gl, source, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * UV球体の頂点・UV・インデックスを生成する関数
 * 内側から見渡すため、半径R=10の球体を作成
 */
function createUVSphere(latBands = 48, lonBands = 48, radius = 10.0) {
  const positions = [];
  const texCoords = [];
  const indices = [];

  for (let lat = 0; lat <= latBands; lat++) {
    const theta = (lat * Math.PI) / latBands; // 0 to PI
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= lonBands; lon++) {
      const phi = (lon * 2 * Math.PI) / lonBands; // 0 to 2PI
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      // 球体座標
      const x = radius * sinTheta * sinPhi;
      const y = radius * cosTheta;
      const z = radius * sinTheta * cosPhi;

      // UVテクスチャ座標（左右の自然な視界向きのためUを反転）
      const u = 1.0 - lon / lonBands;
      const v = lat / latBands;

      positions.push(x, y, z);
      texCoords.push(u, v);
    }
  }

  // インデックスの生成（内側から両面描画）
  for (let lat = 0; lat < latBands; lat++) {
    for (let lon = 0; lon < lonBands; lon++) {
      const first = lat * (lonBands + 1) + lon;
      const second = first + lonBands + 1;

      // 2つの三角形で四角形を形成
      indices.push(first, second, first + 1);
      indices.push(second, second + 1, first + 1);
    }
  }

  return {
    positions: new Float32Array(positions),
    texCoords: new Float32Array(texCoords),
    indices: new Uint16Array(indices)
  };
}

/**
 * 4x4 透視投影行列（Pure JS）
 */
function mat4Perspective(fovDeg, aspect, near, far) {
  const fovRad = (fovDeg * Math.PI) / 180.0;
  const f = 1.0 / Math.tan(fovRad / 2.0);
  const rangeInv = 1.0 / (near - far);

  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * rangeInv, -1,
    0, 0, (2 * far * near) * rangeInv, 0
  ]);
}

/**
 * 4x4 ビュー回転行列（Pitch * Yaw）
 */
function mat4Rotation(yawDeg, pitchDeg) {
  const yawRad = (yawDeg * Math.PI) / 180.0;
  const pitchRad = (pitchDeg * Math.PI) / 180.0;

  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);

  return new Float32Array([
    cosY,        sinP * sinY, -cosP * sinY, 0,
    0,           cosP,        sinP,         0,
    sinY,       -sinP * cosY,  cosP * cosY, 0,
    0,           0,           0,            1
  ]);
}

/**
 * WebGL 360° レンダラーの初期化
 */
function initWebGL360() {
  if (isWebGLInitialized && glContext) return true;

  try {
    const gl = webglCanvas.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: false })
            || webglCanvas.getContext('experimental-webgl');

    if (!gl) {
      alert('お使いのブラウザはWebGLに対応していません。');
      return false;
    }

    glContext = gl;

    // シェーダーのコンパイル & プログラム作成
    const vs = compileShader(gl, VS_SOURCE, gl.VERTEX_SHADER);
    const fs = compileShader(gl, FS_SOURCE, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return false;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return false;
    }

    glProgram = program;
    gl.useProgram(program);

    // Attribute & Uniform ロケーション取得
    const aPosition = gl.getAttribLocation(program, 'aPosition');
    const aTexCoord = gl.getAttribLocation(program, 'aTexCoord');
    glUniforms.uProjectionMatrix = gl.getUniformLocation(program, 'uProjectionMatrix');
    glUniforms.uViewMatrix = gl.getUniformLocation(program, 'uViewMatrix');
    glUniforms.uSampler = gl.getUniformLocation(program, 'uSampler');

    // 球体メッシュの生成 & バッファ転送
    const sphere = createUVSphere(48, 48, 10.0);
    glSphereIndexCount = sphere.indices.length;

    // 頂点バッファ
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphere.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
    glBuffers.position = posBuffer;

    // UVバッファ
    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, sphere.texCoords, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(aTexCoord);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);
    glBuffers.texCoord = uvBuffer;

    // インデックスバッファ
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sphere.indices, gl.STATIC_DRAW);
    glBuffers.index = indexBuffer;

    // 動画テクスチャの作成 (iOS Safari WebKit NPOT設定)
    glVideoTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glVideoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // 初期1x1黒テクスチャ
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    // カリング無効（球体内部から全方位を描画）
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);

    isWebGLInitialized = true;
    console.log('Phase 7: Pure WebGL 360° renderer initialized successfully.');
    return true;
  } catch (err) {
    console.error('WebGL Initialization Error:', err);
    return false;
  }
}

/**
 * WebGL 360° キャンバスのサイズ調整
 */
function resizeWebGLCanvas() {
  if (!webglCanvas || !glContext) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  const displayWidth = Math.round(width * Math.min(dpr, 2));
  const displayHeight = Math.round(height * Math.min(dpr, 2));

  if (webglCanvas.width !== displayWidth || webglCanvas.height !== displayHeight) {
    webglCanvas.width = displayWidth;
    webglCanvas.height = displayHeight;
    glContext.viewport(0, 0, displayWidth, displayHeight);
  }
}

/**
 * WebGL 360° 毎フレーム描画ループ
 */
function renderWebGL360() {
  if (!isWebGL360Mode || !glContext) return;

  resizeWebGLCanvas();

  const gl = glContext;
  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // 動画フレームのテクスチャ更新 (iOS Safari WebKit対応)
  if (videoPlayer && videoPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    gl.bindTexture(gl.TEXTURE_2D, glVideoTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoPlayer);
      if (webglTextureStatus) {
        webglTextureStatus.textContent = videoPlayer.paused ? '⏸ 一時停止中' : '▶️ テクスチャ更新中';
        webglTextureStatus.style.color = '#86e49d';
      }
    } catch (texErr) {
      console.warn('texImage2D error:', texErr);
      if (webglTextureStatus) {
        webglTextureStatus.textContent = '⚠️ テクスチャ転送エラー';
        webglTextureStatus.style.color = '#ff8b85';
      }
    }
  } else {
    if (webglTextureStatus) {
      webglTextureStatus.textContent = '⏳ 動画データ待機中';
      webglTextureStatus.style.color = '#ffd182';
    }
  }

  // 行列計算
  const aspect = webglCanvas.width / (webglCanvas.height || 1);
  const projMatrix = mat4Perspective(webglFov, aspect, 0.1, 100.0);
  const viewMatrix = mat4Rotation(webglYaw, webglPitch);

  gl.useProgram(glProgram);
  gl.uniformMatrix4fv(glUniforms.uProjectionMatrix, false, projMatrix);
  gl.uniformMatrix4fv(glUniforms.uViewMatrix, false, viewMatrix);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glVideoTexture);
  gl.uniform1i(glUniforms.uSampler, 0);

  // 球体メッシュの描画
  gl.drawElements(gl.TRIANGLES, glSphereIndexCount, gl.UNSIGNED_SHORT, 0);

  // 次フレームの予約
  webglAnimationFrameId = requestAnimationFrame(renderWebGL360);
}

/**
 * カメラの視点を相対回転させる関数
 * @param {number} dYaw - 水平回転角（度）
 * @param {number} dPitch - 垂直回転角（度）
 */
function rotateWebGLCamera(dYaw, dPitch) {
  webglYaw = (webglYaw + dYaw) % 360;
  if (webglYaw > 180) webglYaw -= 360;
  if (webglYaw < -180) webglYaw += 360;

  webglPitch = Math.max(-85, Math.min(85, webglPitch + dPitch));

  updateWebGLHud();
}

/**
 * カメラの視点を初期位置（正面: Yaw 0°, Pitch 0°）にリセット
 */
function resetWebGLCamera() {
  webglYaw = 0.0;
  webglPitch = 0.0;
  webglFov = 75.0;
  updateWebGLHud();
}

/**
 * WebGL 360° HUD表示を更新
 */
function updateWebGLHud() {
  if (webglYawVal) webglYawVal.textContent = `${webglYaw.toFixed(1)}°`;
  if (webglPitchVal) webglPitchVal.textContent = `${webglPitch.toFixed(1)}°`;
  if (webglFovVal) webglFovVal.textContent = `${webglFov.toFixed(0)}°`;
}

/**
 * WebGL 360° 検証モードを開始
 */
function enterWebGL360() {
  if (videoPlayer.error || (!videoPlayer.src && videoPlayer.children.length === 0)) {
    alert('動画が読み込まれていません。test.mp4を配置するか、動画ファイルを選択してください。');
    return;
  }

  // WebGL初期化
  const ok = initWebGL360();
  if (!ok) return;

  isWebGL360Mode = true;
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  webgl360Container.style.display = 'flex';

  // 動画再生
  safePlayVideo();

  // 描画ループ開始
  if (webglAnimationFrameId) cancelAnimationFrame(webglAnimationFrameId);
  webglAnimationFrameId = requestAnimationFrame(renderWebGL360);

  updateWebGLHud();
}

/**
 * WebGL 360° 検証モードを終了
 */
function exitWebGL360() {
  isWebGL360Mode = false;
  document.documentElement.classList.remove('vr-active');
  document.body.classList.remove('vr-active');

  webgl360Container.style.display = 'none';

  if (webglAnimationFrameId) {
    cancelAnimationFrame(webglAnimationFrameId);
    webglAnimationFrameId = null;
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
      updateStatus('✅ 動画の読み込みに成功しました。再生または「2D VR MODE」「360° 球面TEST」を押してください。', 'success');
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

  // WebGL 360°画面内のファイル選択
  if (webglFileInput) {
    webglFileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const fileUrl = URL.createObjectURL(file);
        videoPlayer.src = fileUrl;
        videoPlayer.load();
        safePlayVideo();
        resetWebGLCamera();
        updateStatus(`📁 360°動画「${file.name}」を読み込みました。`, 'success');
      }
    });
  }

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

  // 360°サンプル動画URLセットボタン
  if (sample360Btn) {
    sample360Btn.addEventListener('click', () => {
      youtubeUrlInput.value = SAMPLE_360_URL;
      loadYoutubeButton.click();
    });
  }

  // YouTube入力欄でのEnterキー押下
  youtubeUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadYoutubeButton.click();
    }
  });

  // 2D VR開始ボタン (Phase 4)
  vrButton.addEventListener('click', enterVR);

  // Phase 7: WebGL 360° 実機検証開始ボタン
  if (webgl360Button) {
    webgl360Button.addEventListener('click', enterWebGL360);
  }

  // Phase 6: YouTube 360° 実機検証開始ボタン
  if (test360Button) {
    test360Button.addEventListener('click', enter360Test);
  }

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

  // Phase 6: YouTube 360° 実機検証用の EXIT ボタン
  if (exit360TestButton) {
    exit360TestButton.addEventListener('click', (e) => {
      e.stopPropagation();
      exit360Test();
    });
  }

  // Phase 7: WebGL 360° 用の EXIT ボタン
  if (exitWebgl360Button) {
    exitWebgl360Button.addEventListener('click', (e) => {
      e.stopPropagation();
      exitWebGL360();
    });
  }

  // Phase 7: WebGL 360° 視点制御ボタン群
  if (webglBtnLeft) {
    webglBtnLeft.addEventListener('click', () => rotateWebGLCamera(15, 0));
  }
  if (webglBtnRight) {
    webglBtnRight.addEventListener('click', () => rotateWebGLCamera(-15, 0));
  }
  if (webglBtnUp) {
    webglBtnUp.addEventListener('click', () => rotateWebGLCamera(0, 15));
  }
  if (webglBtnDown) {
    webglBtnDown.addEventListener('click', () => rotateWebGLCamera(0, -15));
  }
  if (webglBtnReset) {
    webglBtnReset.addEventListener('click', resetWebGLCamera);
  }

  // Phase 7: WebGL HUD パネル展開 / 最小化切り替え
  if (toggleWebglHudBtn && webglHudBody) {
    toggleWebglHudBtn.addEventListener('click', () => {
      webglHudBody.classList.toggle('collapsed');
      toggleWebglHudBtn.textContent = webglHudBody.classList.contains('collapsed') ? '展開' : '最小化';
    });
  }

  // Phase 6: YouTube 360° 視点制御テストボタン群
  if (btnYawLeft) {
    btnYawLeft.addEventListener('click', () => setSphericalOffset(30, 0));
  }
  if (btnYawRight) {
    btnYawRight.addEventListener('click', () => setSphericalOffset(-30, 0));
  }
  if (btnPitchUp) {
    btnPitchUp.addEventListener('click', () => setSphericalOffset(0, 20));
  }
  if (btnPitchDown) {
    btnPitchDown.addEventListener('click', () => setSphericalOffset(0, -20));
  }
  if (btnResetSpherical) {
    btnResetSpherical.addEventListener('click', resetSpherical);
  }

  // Phase 6: HUD パネル展開 / 最小化切り替え
  if (toggleHudDetailsBtn && hudBody) {
    toggleHudDetailsBtn.addEventListener('click', () => {
      hudBody.classList.toggle('collapsed');
      toggleHudDetailsBtn.textContent = hudBody.classList.contains('collapsed') ? '展開' : '最小化';
    });
  }

  // ローカル2D VR画面タップ（再生 / 一時停止）
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
    if (isWebGL360Mode) {
      if (e.key === 'Escape') {
        exitWebGL360();
        return;
      } else if (e.key === 'ArrowLeft') {
        rotateWebGLCamera(10, 0);
      } else if (e.key === 'ArrowRight') {
        rotateWebGLCamera(-10, 0);
      } else if (e.key === 'ArrowUp') {
        rotateWebGLCamera(0, 10);
      } else if (e.key === 'ArrowDown') {
        rotateWebGLCamera(0, -10);
      } else if (e.key === ' ') {
        e.preventDefault();
        if (videoPlayer.paused) safePlayVideo();
        else videoPlayer.pause();
      }
      return;
    }

    if (is360TestMode && e.key === 'Escape') {
      exit360Test();
      return;
    }

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
    if (isWebGL360Mode) {
      resizeWebGLCanvas();
    }
  });

  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (isVRMode && currentSourceType === 'local') {
        updateCanvasDimensions();
      }
      if (isWebGL360Mode) {
        resizeWebGLCanvas();
      }
    }, 200);
  });

  // VR / 360モード中のスクロール完全抑止
  window.addEventListener('touchmove', (e) => {
    if (isVRMode || is360TestMode || isWebGL360Mode) {
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
      if (webglAnimationFrameId) {
        cancelAnimationFrame(webglAnimationFrameId);
        webglAnimationFrameId = null;
      }
    } else {
      if (isVRMode && currentSourceType === 'local' && !animationFrameId) {
        animationFrameId = requestAnimationFrame(renderVRFrame);
      }
      if (isWebGL360Mode && !webglAnimationFrameId) {
        webglAnimationFrameId = requestAnimationFrame(renderWebGL360);
      }
    }
  });
}

// ページの読み込み完了時に初期化を実行
document.addEventListener('DOMContentLoaded', initPlayer);
