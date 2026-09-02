/**
 * VR Browser - Phase 4: iPhone Safari 最適化
 */

// DOM要素の取得
const videoPlayer = document.getElementById('videoPlayer');
const statusMessage = document.getElementById('statusMessage');
const statusText = document.getElementById('statusText');
const fileInput = document.getElementById('fileInput');

// VR関連要素の取得
const vrButton = document.getElementById('vrButton');
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

/**
 * ステータスメッセージを更新する関数
 * @param {string} message - 表示するメッセージ
 * @param {'info' | 'warning' | 'success'} type - メッセージの種類（スタイル切り替え用）
 */
function updateStatus(message, type = 'info') {
  statusText.textContent = message;
  statusMessage.className = `status-message ${type}`;
}

/**
 * Canvas の内部解像度を動画の本来のネイティブ解像度に合わせる関数
 * ※iPhoneの高DPI（Retina）ディスプレイでも動画本来の最高画質を維持
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
 * VRモード時の描画ループ
 * 1つの video 要素からフレームを取得し、左目・右目の両方の Canvas に同時に描画
 * ※iPhone Safariでの描画安定性のため readyState >= HAVE_CURRENT_DATA を確認
 */
function renderVRFrame() {
  if (!isVRMode) return;

  // iOS Safariで動画のデコードデータが利用可能な場合のみ描画
  if (videoPlayer.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    // 動画サイズが確定していればCanvas解像度を更新
    if (videoPlayer.videoWidth && canvasLeft.width !== videoPlayer.videoWidth) {
      updateCanvasDimensions();
    }
    // 左目用Canvasに現在の動画フレームを描画
    ctxLeft.drawImage(videoPlayer, 0, 0, canvasLeft.width, canvasLeft.height);
    // 右目用Canvasに同じ動画フレームを描画
    ctxRight.drawImage(videoPlayer, 0, 0, canvasRight.width, canvasRight.height);
  }

  // 次の描画フレームを予約（約60fps〜端末のリフレッシュレートで同期）
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
  // 3秒間操作がなければUIを薄くフェードアウト
  uiFadeTimeout = setTimeout(() => {
    if (isVRMode && vrUiLayer) {
      vrUiLayer.classList.add('faded');
    }
  }, 3000);
}

/**
 * 再生 / 一時停止時のHUDインジケーター表示
 * @param {boolean} isPlaying - 再生状態（true: 再生中, false: 一時停止中）
 */
function showPlayPauseIndicator(isPlaying) {
  const icon = isPlaying ? '▶' : '⏸';
  indicatorLeft.textContent = icon;
  indicatorRight.textContent = icon;

  indicatorLeft.classList.add('show');
  indicatorRight.classList.add('show');

  if (indicatorTimeout) {
    clearTimeout(indicatorTimeout);
  }
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
        console.warn('iOS Safari: 自動再生ポリシーによる一時停止または再生制限:', err);
      });
  }
}

/**
 * VRモードを開始する関数
 */
function enterVR() {
  // 動画が読み込まれているかチェック
  if (videoPlayer.error || (!videoPlayer.src && videoPlayer.children.length === 0)) {
    alert('動画が読み込まれていません。test.mp4を配置するか、動画ファイルを選択してください。');
    return;
  }

  isVRMode = true;
  vrContainer.style.display = 'flex';
  document.documentElement.classList.add('vr-active');
  document.body.classList.add('vr-active');

  // Canvasの解像度を初期化
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

  // 描画ループを停止して負荷・電力消費を削減
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

/**
 * 初期化処理
 */
function initPlayer() {
  updateStatus('動画（test.mp4）の読み込みを確認中...', 'info');

  // 動画の読み込みが成功したとき
  videoPlayer.addEventListener('loadeddata', () => {
    updateStatus('✅ 動画の読み込みに成功しました。再生または「VR MODE」を押してください。', 'success');
    updateCanvasDimensions();
  });

  // 動画のメタデータが読み込まれたとき
  videoPlayer.addEventListener('loadedmetadata', () => {
    updateCanvasDimensions();
  });

  // 動画が再生可能状態になったとき
  videoPlayer.addEventListener('canplay', () => {
    updateCanvasDimensions();
  });

  // 動画の読み込みに失敗したとき（test.mp4が存在しない場合など）
  videoPlayer.addEventListener('error', (e) => {
    console.warn('動画の読み込みエラー:', videoPlayer.error);
    updateStatus(
      '⚠️ 「test.mp4」がプロジェクトフォルダに見つかりません。プロジェクトフォルダ内に「test.mp4」を追加してください。（下のボタンから手動で動画を選択することも可能です）',
      'warning'
    );
  });

  // ファイルピッカーで任意の動画ファイルが選択されたときの処理
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const fileUrl = URL.createObjectURL(file);
      videoPlayer.src = fileUrl;
      videoPlayer.load();
      updateStatus(`📁 選択した動画「${file.name}」を読み込みました。`, 'success');
    }
  });

  // VRボタンのイベントリスナー
  vrButton.addEventListener('click', enterVR);

  // EXIT VRボタンのイベントリスナー（バブリング防止）
  exitVrButton.addEventListener('click', (e) => {
    e.stopPropagation();
    exitVR();
  });

  // VR画面タップで動画の再生 / 一時停止を切り替え
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

  // マウス移動・タッチ時にVR UIを表示（iOSのtouchstart対応）
  vrContainer.addEventListener('mousemove', resetUiFadeTimer);
  vrContainer.addEventListener('touchstart', resetUiFadeTimer, { passive: true });

  // キーボードの Esc キーでVRモードを終了できるようにする（PCテスト用）
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isVRMode) {
      exitVR();
    } else if (e.key === ' ' && isVRMode) {
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

  // 画面回転やウィンドウリサイズ時にCanvasの追従を行う
  window.addEventListener('resize', () => {
    if (isVRMode) {
      updateCanvasDimensions();
    }
  });

  // iOS Safariの画面の向き変更イベント
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (isVRMode) {
        updateCanvasDimensions();
      }
    }, 200);
  });

  // VRモード中のスクロール（バウンス）を完全に抑止
  window.addEventListener('touchmove', (e) => {
    if (isVRMode) {
      e.preventDefault();
    }
  }, { passive: false });

  // タブ切り替えやスリープ時の省電力・フリーズ防止
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
