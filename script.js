/**
 * VR Browser - Phase 5: ジャイロ視点移動（DeviceOrientation API）
 */

// DOM要素の取得
const videoPlayer = document.getElementById('videoPlayer');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// VR関連要素の取得
const vrButton = document.getElementById('vrButton');
const exitVrButton = document.getElementById('exitVrButton');
const resetViewButton = document.getElementById('resetViewButton');
const vrStatusBadge = document.getElementById('vrStatusBadge');
const vrContainer = document.getElementById('vrContainer');
const vrUiLayer = document.getElementById('vrUiLayer');
const screenLeft = document.getElementById('screenLeft');
const screenRight = document.getElementById('screenRight');
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

// ============================================================
// Phase 5: ジャイロ・視点移動 状態変数
// ============================================================
let isGyroActive = false;
let hasCalibrated = false;
const initialOrientation = { alpha: 0, beta: 0, gamma: 0 };
const targetOffset = { x: 0, y: 0 };
const currentOffset = { x: 0, y: 0 };

// 視点移動のチューニングパラメータ
const SENSITIVITY_X = 6.0;   // 左右の感度（度あたりのピクセル移動量）
const SENSITIVITY_Y = 5.0;   // 上下の感度
const MAX_OFFSET_X = 200;    // 左右の最大移動制限（px）
const MAX_OFFSET_Y = 140;    // 上下の最大移動制限（px）
const LERP_FACTOR = 0.14;    // スムージング補間係数（手ブレ吸収・滑らかさ）

// PCテスト用（マウスドラッグ視点移動）
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let lastTapTime = 0;

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
 * センサーステータスバッジの更新
 */
function updateGyroBadge(active, message) {
  if (vrStatusBadge) {
    if (active) {
      vrStatusBadge.textContent = message || '🧭 ジャイロ視点連動中';
      vrStatusBadge.className = 'vr-status-badge active';
    } else {
      vrStatusBadge.textContent = message || '⚠️ センサー無効（固定視点）';
      vrStatusBadge.className = 'vr-status-badge disabled';
    }
  }
}

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
 * 視点（ゼロ点）を正面にリセットする関数
 */
function resetView() {
  hasCalibrated = false;
  targetOffset.x = 0;
  targetOffset.y = 0;
  currentOffset.x = 0;
  currentOffset.y = 0;

  if (screenLeft && screenRight) {
    screenLeft.style.transform = 'translate3d(0, 0, 0)';
    screenRight.style.transform = 'translate3d(0, 0, 0)';
  }

  // HUDにリセット完了を表示
  showCenterMessage('🎯 正面リセット');
  resetUiFadeTimer();
}

/**
 * 画面中央に一時的なHUDメッセージを表示
 */
function showCenterMessage(text) {
  indicatorLeft.textContent = text;
  indicatorRight.textContent = text;
  indicatorLeft.style.fontSize = '0.9rem';
  indicatorRight.style.fontSize = '0.9rem';
  indicatorLeft.style.width = 'auto';
  indicatorRight.style.width = 'auto';
  indicatorLeft.style.padding = '8px 16px';
  indicatorRight.style.padding = '8px 16px';
  indicatorLeft.style.borderRadius = '20px';
  indicatorRight.style.borderRadius = '20px';

  indicatorLeft.classList.add('show');
  indicatorRight.classList.add('show');

  if (indicatorTimeout) clearTimeout(indicatorTimeout);
  indicatorTimeout = setTimeout(() => {
    indicatorLeft.classList.remove('show');
    indicatorRight.classList.remove('show');
    // 元のアイコンスタイルに戻す
    setTimeout(() => {
      indicatorLeft.style.fontSize = '';
      indicatorRight.style.fontSize = '';
      indicatorLeft.style.width = '';
      indicatorRight.style.width = '';
      indicatorLeft.style.padding = '';
      indicatorRight.style.padding = '';
      indicatorLeft.style.borderRadius = '';
      indicatorRight.style.borderRadius = '';
    }, 300);
  }, 900);
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
 * DeviceOrientation イベントハンドラー
 * 端末の傾き（オイラー角）から左右・上下の視線移動量を計算
 */
function handleDeviceOrientation(event) {
  if (!isVRMode) return;

  const { alpha, beta, gamma } = event;
  if (beta === null || gamma === null) return;

  // 初回受信時に基準位置（正面）としてキャリブレーション
  if (!hasCalibrated) {
    initialOrientation.alpha = alpha || 0;
    initialOrientation.beta = beta;
    initialOrientation.gamma = gamma;
    hasCalibrated = true;
    isGyroActive = true;
    updateGyroBadge(true);
    return;
  }

  // 端末の向き（Landscape/Portrait）に応じた軸変換
  const orientationAngle = window.orientation ?? (screen.orientation?.angle || 0);

  let rawDeltaX = 0;
  let rawDeltaY = 0;

  if (orientationAngle === 90) {
    // 横向き（Landscape Right: ノッチが左・充電口が右）
    rawDeltaX = -(beta - initialOrientation.beta);
    rawDeltaY = (gamma - initialOrientation.gamma);
  } else if (orientationAngle === -90 || orientationAngle === 270) {
    // 横向き（Landscape Left: ノッチが右・充電口が左）
    rawDeltaX = (beta - initialOrientation.beta);
    rawDeltaY = -(gamma - initialOrientation.gamma);
  } else {
    // 縦向き（Portrait）
    rawDeltaX = -(gamma - initialOrientation.gamma);
    rawDeltaY = -(beta - initialOrientation.beta);
  }

  // 目標オフセットを計算（範囲クランプ）
  targetOffset.x = Math.max(-MAX_OFFSET_X, Math.min(MAX_OFFSET_X, rawDeltaX * SENSITIVITY_X));
  targetOffset.y = Math.max(-MAX_OFFSET_Y, Math.min(MAX_OFFSET_Y, rawDeltaY * SENSITIVITY_Y));
}

/**
 * VRモード時の描画 & 視点補間ループ
 */
function renderVRFrame() {
  if (!isVRMode) return;

  // 1. 視点移動のスムージング計算（線形補間 LERP）
  currentOffset.x += (targetOffset.x - currentOffset.x) * LERP_FACTOR;
  currentOffset.y += (targetOffset.y - currentOffset.y) * LERP_FACTOR;

  // 左右両方のスクリーンに同一のトランスフォームを適用（左右同期・ズレなし）
  const transformStr = `translate3d(${currentOffset.x.toFixed(2)}px, ${currentOffset.y.toFixed(2)}px, 0)`;
  if (screenLeft && screenRight) {
    screenLeft.style.transform = transformStr;
    screenRight.style.transform = transformStr;
  }

  // 2. 1つのvideoから左右Canvasへの同一フレーム描画
  if (videoPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (videoPlayer.videoWidth && canvasLeft.width !== videoPlayer.videoWidth) {
      updateCanvasDimensions();
    }
    ctxLeft.drawImage(videoPlayer, 0, 0, canvasLeft.width, canvasLeft.height);
    ctxRight.drawImage(videoPlayer, 0, 0, canvasRight.width, canvasRight.height);
  }

  // 次の描画フレームを予約
  animationFrameId = requestAnimationFrame(renderVRFrame);
}

/**
 * iOS 13+ センサー権限リクエスト
 */
async function requestSensorPermission() {
  // iOS Safari 13+ 専用の許可リクエスト API
  if (
    typeof DeviceOrientationEvent !== 'undefined' &&
    typeof DeviceOrientationEvent.requestPermission === 'function'
  ) {
    try {
      const response = await DeviceOrientationEvent.requestPermission();
      return response === 'granted';
    } catch (err) {
      console.warn('DeviceOrientation 権限リクエスト例外:', err);
      return false;
    }
  }

  // requestPermission が存在しないブラウザ（Android, PC等）
  return 'ondeviceorientation' in window;
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
 * VRモードを開始する関数
 */
async function enterVR() {
  if (videoPlayer.error || (!videoPlayer.src && videoPlayer.children.length === 0)) {
    alert('動画が読み込まれていません。test.mp4を配置するか、動画ファイルを選択してください。');
    return;
  }

  // 1. モーションセンサー許可の要求（iOS 13+）
  const permissionGranted = await requestSensorPermission();

  isVRMode = true;
  vrContainer.style.display = 'flex';
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  // Canvasの解像度初期化
  updateCanvasDimensions();

  // 2. ジャイロセンサーイベントの登録
  if (permissionGranted) {
    window.addEventListener('deviceorientation', handleDeviceOrientation, true);
    updateGyroBadge(true, '🧭 ジャイロ視点連動中');
  } else {
    updateGyroBadge(false, '⚠️ センサー無効（固定視点）');
  }

  // 視点のリセット
  resetView();

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

  // ジャイロリスナーの解除
  window.removeEventListener('deviceorientation', handleDeviceOrientation, true);
  isGyroActive = false;
  hasCalibrated = false;

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

  // オフセットリセット
  targetOffset.x = 0;
  targetOffset.y = 0;
  currentOffset.x = 0;
  currentOffset.y = 0;
  if (screenLeft && screenRight) {
    screenLeft.style.transform = 'translate3d(0, 0, 0)';
    screenRight.style.transform = 'translate3d(0, 0, 0)';
  }
}

/**
 * 初期化処理
 */
function initPlayer() {
  updateStatus('動画（test.mp4）の読み込みを確認中...', 'info');

  videoPlayer.addEventListener('loadeddata', () => {
    updateStatus('✅ 動画の読み込みに成功しました。再生または「VR MODE」を押してください。', 'success');
    updateCanvasDimensions();
  });

  videoPlayer.addEventListener('loadedmetadata', updateCanvasDimensions);
  videoPlayer.addEventListener('canplay', updateCanvasDimensions);

  videoPlayer.addEventListener('error', (e) => {
    console.warn('動画の読み込みエラー:', videoPlayer.error);
    updateStatus(
      '⚠️ 「test.mp4」がプロジェクトフォルダに見つかりません。プロジェクトフォルダ内に「test.mp4」を追加してください。（下のボタンから手動で動画を選択することも可能です）',
      'warning'
    );
  });

  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      videoPlayer.src = fileUrl;
      videoPlayer.load();
      updateStatus(`📁 選択した動画「${file.name}」を読み込みました。`, 'success');
    }
  });

  // VRボタン
  vrButton.addEventListener('click', enterVR);

  // EXIT VRボタン
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // 正面リセットボタン
  resetViewButton.addEventListener('click', (e) => {
    e.stopPropagation();
    resetView();
  });

  // VR画面タップ（再生/停止） & ダブルタップ（正面リセット）
  vrContainer.addEventListener('click', (e) => {
    if (e.target === exitVrButton || e.target === resetViewButton) {
      return;
    }

    const currentTime = Date.now();
    const timeDiff = currentTime - lastTapTime;
    lastTapTime = currentTime;

    // 300ms以内の連続タップはダブルタップと判定（正面リセット）
    if (timeDiff < 300 && timeDiff > 0) {
      resetView();
    } else {
      // シングルタップ: 再生 / 一時停止
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

  // PCテスト用: マウスドラッグによる視点移動シミュレーション
  vrContainer.addEventListener('mousedown', (e) => {
    if (!isVRMode) return;
    isDragging = true;
    dragStartX = e.clientX - targetOffset.x;
    dragStartY = e.clientY - targetOffset.y;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isVRMode || !isDragging) return;
    const nextX = e.clientX - dragStartX;
    const nextY = e.clientY - dragStartY;
    targetOffset.x = Math.max(-MAX_OFFSET_X, Math.min(MAX_OFFSET_X, nextX));
    targetOffset.y = Math.max(-MAX_OFFSET_Y, Math.min(MAX_OFFSET_Y, nextY));
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

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
    } else if (e.key === 'r' || e.key === 'R') {
      resetView(); // Rキーで正面リセット
    } else if (e.key === 'ArrowLeft') {
      targetOffset.x = Math.min(MAX_OFFSET_X, targetOffset.x + 30);
    } else if (e.key === 'ArrowRight') {
      targetOffset.x = Math.max(-MAX_OFFSET_X, targetOffset.x - 30);
    } else if (e.key === 'ArrowUp') {
      targetOffset.y = Math.min(MAX_OFFSET_Y, targetOffset.y + 30);
    } else if (e.key === 'ArrowDown') {
      targetOffset.y = Math.max(-MAX_OFFSET_Y, targetOffset.y - 30);
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
        resetView(); // 向きが変わった時は正面を再キャリブレーション
      }
    }, 200);
  });

  // VRモード中のスクロール完全抑止
  window.addEventListener('touchmove', (e) => {
    if (isVRMode) {
      e.preventDefault();
    }
  }, { passive: false });

  // バックグラウンド復帰処理
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
