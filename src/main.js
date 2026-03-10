import './style.css'
import { sentences } from './sentences.js'
import { pinyin } from 'pinyin-pro'

// App State
let currentSentence = "";
let currentStage = 1;
let recognition = null;
let isRecording = false;
let completedCount = parseInt(localStorage.getItem('completedCount')) || 0;
let skippedCount = parseInt(localStorage.getItem('skippedCount')) || 0;
let accumulatedTranscript = ""; // New global buffer for manual mode

// DOM Elements
const targetDisplay = document.getElementById('target-sentence');
const userResultDisplay = document.getElementById('user-result');
const accuracyBadge = document.getElementById('accuracy-badge');
const btnPlay = document.getElementById('btn-play');
const btnBackStage1 = document.getElementById('btn-back-stage1');
const btnRecord = document.getElementById('btn-record');
const btnConfirmRetry = document.getElementById('btn-confirm-retry');
const btnNext = document.getElementById('btn-next');
const btnSkip = document.getElementById('btn-skip');
const btnOverlayNext = document.getElementById('btn-overlay-next');
const nextContainer = document.getElementById('next-container');
const successOverlay = document.getElementById('success-overlay');
const completedCountDisplay = document.getElementById('completed-count');
const skippedCountDisplay = document.getElementById('skipped-count');

function getHiddenSentence() {
  let hiddenText = "";
  for (const char of currentSentence) {
    if (/[\p{P}\p{S}\p{Z}]/gu.test(char)) {
      hiddenText += char;
    } else {
      hiddenText += "❓";
    }
  }
  return hiddenText;
}

// Initialize Speech Recognition
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("您的瀏覽器不支援語音辨識。請使用 Chrome 或 Safari。");
    return null;
  }

  const reco = new SpeechRecognition();
  reco.lang = 'zh-TW';
  reco.interimResults = true; // Show interim results for feedback
  reco.continuous = true;    // Don't stop on silence
  reco.maxAlternatives = 1;

  reco.onstart = () => {
    isRecording = true;
    accumulatedTranscript = ""; // Reset buffer
    btnRecord.textContent = "說完了 (點擊停止)";
    btnRecord.classList.add('recording');
    userResultDisplay.textContent = "正在聆聽...請說出畫面上的句子。";
  };

  reco.onresult = (event) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        accumulatedTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    // Live feedback only, don't process yet
    const displayResult = accumulatedTranscript || interimTranscript;
    if (displayResult) {
      userResultDisplay.innerHTML = `<span style="opacity: 0.6">辨識中:</span> ${displayResult}`;
    }
  };

  reco.onerror = (event) => {
    console.error("辨識錯誤:", event.error);
    stopRecording();
    userResultDisplay.textContent = "辨識出錯，請再試一次。";
  };

  reco.onend = () => {
    stopRecording();
    if (accumulatedTranscript) {
      processResult(accumulatedTranscript);
    } else {
      userResultDisplay.textContent = "未偵測到語音，請再試一次。";
    }
  };

  return reco;
}

function stopRecording() {
  isRecording = false;
  btnRecord.innerHTML = '<span class="icon">🎤</span> 按下說話';
  btnRecord.classList.remove('recording');
}

// Comparison Logic
function processResult(spokenText) {
  const punctuationRegex = /[\p{P}\p{S}\p{Z}]/gu;
  const cleanSpoken = spokenText.replace(punctuationRegex, "");

  let matchTypes = new Map();
  let lastMatchedIdx = -1;

  for (const char of cleanSpoken) {
    const charPinyins = pinyin(char, { toneType: 'num', type: 'array', multiple: true });

    for (let i = lastMatchedIdx + 1; i < currentSentence.length; i++) {
      const targetChar = currentSentence[i];
      if (punctuationRegex.test(targetChar)) continue;

      if (targetChar === char) {
        matchTypes.set(i, 'correct');
        lastMatchedIdx = i;
        break; // Match found, move to next spoken character
      }

      const targetPinyins = pinyin(targetChar, { toneType: 'num', type: 'array', multiple: true });
      if (targetPinyins.some(tp => charPinyins.includes(tp))) {
        matchTypes.set(i, 'homophone');
        lastMatchedIdx = i;
        break;
      }
    }
  }

  let highlightedHTML = "";
  let correctCount = 0;
  let targetCharCount = 0;

  for (let i = 0; i < currentSentence.length; i++) {
    const char = currentSentence[i];

    if (punctuationRegex.test(char)) {
      highlightedHTML += char;
      continue;
    }

    targetCharCount++;

    if (matchTypes.has(i)) {
      const type = matchTypes.get(i);
      if (type === 'correct') {
        highlightedHTML += `<span class="char-correct">${char}</span>`;
      } else {
        highlightedHTML += `<span class="char-homophone">${char}</span>`;
      }
      correctCount++;
    } else {
      highlightedHTML += `<span class="char-incorrect">${char}</span>`;
    }
  }

  userResultDisplay.innerHTML = `你說了: "${spokenText}"<br><br>比對結果: ${highlightedHTML}`;

  const accuracy = targetCharCount > 0 ? Math.round((correctCount / targetCharCount) * 100) : 0;

  if (accuracy === 100) {
    if (currentStage === 1) {
      currentStage = 2;
      targetDisplay.textContent = getHiddenSentence();
      userResultDisplay.innerHTML = "第一階段成功！請在無提示的情況下再次說出。";
      accuracyBadge.classList.add('hidden');
      btnBackStage1.classList.remove('hidden');
    } else {
      showSuccess();
    }
  } else {
    accuracyBadge.textContent = `${accuracy}% 正確`;
    accuracyBadge.classList.remove('hidden');

    if (currentStage === 1) {
      nextContainer.classList.remove('hidden');
    } else {
      btnRecord.classList.add('hidden');
      btnConfirmRetry.classList.remove('hidden');
      nextContainer.classList.add('hidden');
    }
  }
}

// TTS Logic
function speakSentence() {
  if ('speechSynthesis' in window) {
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(currentSentence);
    utterance.lang = 'zh-TW';
    utterance.rate = 0.8; // Slightly slower for better clarity
    window.speechSynthesis.speak(utterance);
  }
}

// UI Actions
function loadRandomSentence() {
  const randomIndex = Math.floor(Math.random() * sentences.length);
  currentSentence = sentences[randomIndex];
  targetDisplay.textContent = currentSentence;

  // Reset state
  currentStage = 1;
  userResultDisplay.textContent = "尚未開始";
  accuracyBadge.classList.add('hidden');
  nextContainer.classList.add('hidden');
  successOverlay.classList.add('hidden');
  btnBackStage1.classList.add('hidden');
  btnConfirmRetry.classList.add('hidden');
  btnRecord.classList.remove('hidden');
}

function showSuccess() {
  completedCount++;
  localStorage.setItem('completedCount', completedCount);
  completedCountDisplay.textContent = completedCount;

  accuracyBadge.textContent = "100% 正確！";
  accuracyBadge.classList.remove('hidden');
  successOverlay.classList.remove('hidden');
  nextContainer.classList.remove('hidden');
}

// Event Listeners
btnPlay.addEventListener('click', speakSentence);

btnRecord.addEventListener('click', () => {
  if (!recognition) recognition = initSpeechRecognition();
  if (!recognition) return;

  if (isRecording) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

function skipSentence() {
  skippedCount++;
  localStorage.setItem('skippedCount', skippedCount);
  skippedCountDisplay.textContent = skippedCount;
  loadRandomSentence();
}

btnNext.addEventListener('click', loadRandomSentence);
btnSkip.addEventListener('click', skipSentence);
btnOverlayNext.addEventListener('click', loadRandomSentence);

btnBackStage1.addEventListener('click', () => {
  currentStage = 1;
  targetDisplay.textContent = currentSentence;
  userResultDisplay.textContent = "已回到第一階段，請看著提示再次練習。";
  accuracyBadge.classList.add('hidden');
  btnBackStage1.classList.add('hidden');
  btnConfirmRetry.classList.add('hidden');
  btnRecord.classList.remove('hidden');
});

btnConfirmRetry.addEventListener('click', () => {
  targetDisplay.textContent = getHiddenSentence();
  userResultDisplay.textContent = "請再次嘗試！";
  accuracyBadge.classList.add('hidden');
  btnConfirmRetry.classList.add('hidden');
  btnRecord.classList.remove('hidden');
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  completedCountDisplay.textContent = completedCount;
  skippedCountDisplay.textContent = skippedCount;
  loadRandomSentence();
});
