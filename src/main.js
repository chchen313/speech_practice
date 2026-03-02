import './style.css'
import { sentences } from './sentences.js'

// App State
let currentSentence = "";
let recognition = null;
let isRecording = false;
let completedCount = 0;
let skippedCount = 0;
let accumulatedTranscript = ""; // New global buffer for manual mode

// DOM Elements
const targetDisplay = document.getElementById('target-sentence');
const userResultDisplay = document.getElementById('user-result');
const accuracyBadge = document.getElementById('accuracy-badge');
const btnPlay = document.getElementById('btn-play');
const btnRecord = document.getElementById('btn-record');
const btnNext = document.getElementById('btn-next');
const btnSkip = document.getElementById('btn-skip');
const btnOverlayNext = document.getElementById('btn-overlay-next');
const nextContainer = document.getElementById('next-container');
const successOverlay = document.getElementById('success-overlay');
const completedCountDisplay = document.getElementById('completed-count');
const skippedCountDisplay = document.getElementById('skipped-count');

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
  const punctuationRegex = /[，。？！：；""''“”‘’（）(),.\?!\s]/g;
  const cleanSpoken = spokenText.replace(punctuationRegex, "");

  // We will track which characters in the target sentence have been correctly spoken in order
  let correctIndices = new Set();
  let lastMatchedIdx = -1;

  // Iterate through what the user said
  for (const char of cleanSpoken) {
    // Search for this character in the target sentence, but only AFTER the last match
    for (let i = lastMatchedIdx + 1; i < currentSentence.length; i++) {
      const targetChar = currentSentence[i];
      if (punctuationRegex.test(targetChar)) continue;

      if (targetChar === char) {
        correctIndices.add(i);
        lastMatchedIdx = i;
        break; // Match found, move to next spoken character
      }
    }
  }

  let highlightedHTML = "";
  let correctCount = 0;
  let targetCharCount = 0;

  // Build the display based on the correctIndices
  for (let i = 0; i < currentSentence.length; i++) {
    const char = currentSentence[i];

    if (punctuationRegex.test(char)) {
      highlightedHTML += char;
      continue;
    }

    targetCharCount++;

    if (correctIndices.has(i)) {
      highlightedHTML += `<span class="char-correct">${char}</span>`;
      correctCount++;
    } else {
      highlightedHTML += `<span class="char-incorrect">${char}</span>`;
    }
  }

  userResultDisplay.innerHTML = `你說了: "${spokenText}"<br><br>比對結果: ${highlightedHTML}`;

  const accuracy = targetCharCount > 0 ? Math.round((correctCount / targetCharCount) * 100) : 0;

  if (accuracy === 100) {
    showSuccess();
  } else {
    accuracyBadge.textContent = `${accuracy}% 正確`;
    accuracyBadge.classList.remove('hidden');
    nextContainer.classList.remove('hidden');
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
  userResultDisplay.textContent = "尚未開始";
  accuracyBadge.classList.add('hidden');
  nextContainer.classList.add('hidden');
  successOverlay.classList.add('hidden');
}

function showSuccess() {
  completedCount++;
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
  skippedCountDisplay.textContent = skippedCount;
  loadRandomSentence();
}

btnNext.addEventListener('click', loadRandomSentence);
btnSkip.addEventListener('click', skipSentence);
btnOverlayNext.addEventListener('click', loadRandomSentence);

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadRandomSentence();
});
