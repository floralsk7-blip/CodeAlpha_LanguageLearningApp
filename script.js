const $ = id => document.getElementById(id);

// [MyMemory code, display name, speech-voice code]
const LANGS = [
  ["es","Spanish","es-ES"],["fr","French","fr-FR"],["de","German","de-DE"],
  ["it","Italian","it-IT"],["pt","Portuguese","pt-PT"],["hi","Hindi","hi-IN"],
  ["bn","Bengali","bn-IN"],["pa","Punjabi","pa-IN"],["ta","Tamil","ta-IN"],
  ["te","Telugu","te-IN"],["mr","Marathi","mr-IN"],["gu","Gujarati","gu-IN"],
  ["ur","Urdu","ur-PK"],["ar","Arabic","ar-SA"],["ja","Japanese","ja-JP"],
  ["ko","Korean","ko-KR"],["zh-CN","Chinese","zh-CN"],["ru","Russian","ru-RU"],
  ["tr","Turkish","tr-TR"],["nl","Dutch","nl-NL"],["id","Indonesian","id-ID"]
];
const langName = c => (LANGS.find(l => l[0] === c) || [c, c])[1];
const langVoice = c => (LANGS.find(l => l[0] === c) || [])[2] || c;

const BASE = {
  vocabulary: ["Hello","Thank you","Water","Friend","House","Book","Food","Good morning","Welcome","Please","Yes","No"],
  grammar: ["I am a student.","You are kind.","We are friends.","He is my teacher.","She is happy.","They are students.","I want water.","Where is the book?"]
};

// ---------- storage ----------
const PROGRESS_KEY = "lingualearn-progress-v2";
const CACHE_KEY = "lingualearn-cache-v2";
const defaultProgress = () => ({ learned: {}, best: {}, quizzes: 0, custom: [] });

function load(key, fallback) {
  try { const s = localStorage.getItem(key); if (s) return Object.assign(fallback, JSON.parse(s)); } catch (e) {}
  return fallback;
}
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

let progress = load(PROGRESS_KEY, defaultProgress());
let cache = load(CACHE_KEY, {});

// ---------- translation API (MyMemory) ----------
async function translate(text, lang) {
  const key = lang + "|" + text;
  if (cache[key]) return cache[key];

  const url = "https://api.mymemory.translated.net/get?" +
    new URLSearchParams({ q: text, langpair: "en|" + lang });
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network problem. Check your internet and try again.");

  const data = await res.json();
  const out = data.responseData && data.responseData.translatedText;
  if (Number(data.responseStatus) !== 200 || !out || /MYMEMORY WARNING/i.test(out)) {
    throw new Error("Translation is unavailable right now (the free daily limit may be used up). Try again later.");
  }
  cache[key] = out;
  save(CACHE_KEY, cache);
  return out;
}

async function getLesson(lang, cat, onProgress) {
  if (cat === "mywords") {
    return progress.custom.filter(w => w.lang === lang)
      .map(w => ({ id: lang + "|" + w.en, word: w.tr, meaning: w.en, lang }));
  }
  const base = BASE[cat], out = [];
  for (let i = 0; i < base.length; i++) {
    if (onProgress) onProgress(i + 1, base.length);
    out.push({ id: lang + "|" + base[i], word: await translate(base[i], lang), meaning: base[i], lang });
  }
  return out;
}

// ---------- speech ----------
let voices = [];
function loadVoices() {
  if ("speechSynthesis" in window) voices = speechSynthesis.getVoices();
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

function speak(text, lang, say) {
  if (!("speechSynthesis" in window)) {
    say("This browser can't read aloud. Try Chrome or Edge.");
    return;
  }
  if (!voices.length) loadVoices();

  const code = langVoice(lang);
  const prefix = code.split("-")[0].toLowerCase();
  const voice =
    voices.find(v => v.lang.replace("_", "-").toLowerCase() === code.toLowerCase()) ||
    voices.find(v => v.lang.toLowerCase().startsWith(prefix));

  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : code;
  if (voice) u.voice = voice;
  u.rate = 0.85;
  u.onerror = e => {
    if (e.error === "interrupted" || e.error === "canceled") return;
    say("Could not play the voice (" + e.error + ").");
  };

  say(voices.length && !voice
    ? "No " + langName(lang) + " voice is installed on this device, so there may be no sound. Install one in your device's text-to-speech or language settings."
    : "");

  speechSynthesis.cancel();
  setTimeout(() => speechSynthesis.speak(u), 60);
}

// ---------- learn ----------
let cards = [], idx = 0, loadToken = 0;
const curLang = () => $("language").value;
const curCat = () => $("category").value;
const notice = m => { $("notice").textContent = m; };

async function loadLearn() {
  const token = ++loadToken;
  cards = []; idx = 0;
  renderCard();
  try {
    const lesson = await getLesson(curLang(), curCat(),
      (i, n) => { if (token === loadToken) notice(`Loading ${langName(curLang())}... ${i}/${n}`); });
    if (token !== loadToken) return;
    cards = lesson;
    notice("");
  } catch (e) {
    if (token !== loadToken) return;
    notice(e.message);
  }
  renderCard();
}

function renderCard() {
  const has = cards.length > 0;
  const card = cards[idx];

  $("word").textContent = has ? card.word : "...";
  $("pronunciation").textContent = has ? langName(card.lang) : "";
  $("meaning").textContent = has ? card.meaning : "";
  $("cardCounter").textContent = has ? `Card ${idx + 1} of ${cards.length}` :
    (curCat() === "mywords" ? "No saved words yet. Use Search to add some." : "");
  $("meaningBox").classList.add("hidden");
  $("meaningBtn").textContent = "Show meaning";

  ["meaningBtn", "listenBtn", "learnedBtn"].forEach(id => { $(id).disabled = !has; });
  $("prevBtn").disabled = !has || idx === 0;
  $("nextBtn").disabled = !has || idx === cards.length - 1;

  const learned = has && progress.learned[card.id];
  $("learnedBtn").textContent = learned ? "✓ Learned (tap to undo)" : "✓ Mark as learned";
  renderProgress();
}

function renderProgress() {
  const done = cards.filter(c => progress.learned[c.id]).length;
  const pct = cards.length ? Math.round(done / cards.length * 100) : 0;
  $("progressBar").style.width = pct + "%";
  $("progressText").textContent = pct + "% learned";
  $("learnedCount").textContent = done;
  $("bestScore").textContent = `${progress.best[curLang() + "-" + curCat()] || 0}/${cards.length}`;
  $("quizCount").textContent = progress.quizzes;

  const list = $("learnedList");
  list.replaceChildren();
  const items = Object.values(progress.learned);
  $("learnedEmpty").classList.toggle("hidden", items.length > 0);
  items.forEach(w => {
    const li = document.createElement("li");
    li.textContent = `${w.word} (${langName(w.lang)}) - ${w.meaning}`;
    list.appendChild(li);
  });
}

function toggleMeaning() {
  const hidden = $("meaningBox").classList.toggle("hidden");
  $("meaningBtn").textContent = hidden ? "Show meaning" : "Hide meaning";
}

function toggleLearned() {
  const c = cards[idx];
  if (progress.learned[c.id]) { delete progress.learned[c.id]; notice("Removed from learned words."); }
  else { progress.learned[c.id] = { word: c.word, meaning: c.meaning, lang: c.lang }; notice("Great job! Marked as learned."); }
  save(PROGRESS_KEY, progress);
  renderCard();
}

function changeCard(d) {
  idx = Math.max(0, Math.min(cards.length - 1, idx + d));
  renderCard();
}

// ---------- search ----------
let lastSearch = null;

async function doSearch() {
  const q = $("searchInput").value.trim();
  if (!q) { $("searchStatus").textContent = "Type a word or phrase first."; return; }
  const lang = curLang();
  $("searchStatus").textContent = "Translating...";
  $("searchResult").classList.add("hidden");
  try {
    const tr = await translate(q, lang);
    lastSearch = { en: q, tr, lang };
    $("searchWord").textContent = tr;
    $("searchMeaning").textContent = `${q} (${langName(lang)})`;
    $("searchResult").classList.remove("hidden");
    $("searchStatus").textContent = "";
  } catch (e) {
    $("searchStatus").textContent = e.message;
  }
}

function addSearchWord() {
  if (!lastSearch) return;
  const exists = progress.custom.some(w => w.lang === lastSearch.lang && w.en === lastSearch.en);
  if (!exists) { progress.custom.push(lastSearch); save(PROGRESS_KEY, progress); }
  $("searchStatus").textContent = exists ? "Already in My words." : "Added to My words.";
  if (curCat() === "mywords") loadLearn();
}

// ---------- quiz ----------
let quiz = [], qi = 0, score = 0, answered = false, quizKey = "";

function shuffle(a) {
  const c = [...a];
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

async function startQuiz() {
  const lang = $("quizLanguage").value, cat = $("quizCategory").value;
  quizKey = lang + "-" + cat;
  $("quizResult").classList.add("hidden");
  $("quizPanel").classList.add("hidden");
  $("startQuizBtn").disabled = true;
  try {
    const lesson = await getLesson(lang, cat, (i, n) => { $("quizStatus").textContent = `Loading ${langName(lang)}... ${i}/${n}`; });
    if (lesson.length < 4) { $("quizStatus").textContent = "You need at least 4 words in this category. Add more with Search."; return; }
    $("quizStatus").textContent = "";
    quiz = shuffle(lesson); qi = 0; score = 0;
    $("quizPanel").classList.remove("hidden");
    renderQuestion();
  } catch (e) {
    $("quizStatus").textContent = e.message;
  } finally {
    $("startQuizBtn").disabled = false;
  }
}

function renderQuestion() {
  const card = quiz[qi];
  answered = false;
  $("quizCounter").textContent = `Question ${qi + 1} of ${quiz.length}`;
  $("quizScore").textContent = `Score: ${score}`;
  $("quizProgressBar").style.width = (qi / quiz.length * 100) + "%";
  $("quizQuestion").textContent = `What does "${card.word}" mean?`;
  $("quizFeedback").textContent = "";
  $("quizNextBtn").disabled = true;
  $("quizNextBtn").textContent = qi === quiz.length - 1 ? "See results" : "Next question →";

  const wrong = shuffle(quiz.filter(c => c.meaning !== card.meaning).map(c => c.meaning)).slice(0, 3);
  const box = $("quizOptions");
  box.replaceChildren();
  shuffle([card.meaning, ...wrong]).forEach(opt => {
    const b = document.createElement("button");
    b.className = "quiz-option";
    b.textContent = opt;
    b.addEventListener("click", () => choose(b, opt, card.meaning));
    box.appendChild(b);
  });
}

function choose(btn, picked, correct) {
  if (answered) return;
  answered = true;
  $("quizOptions").querySelectorAll("button").forEach(b => {
    b.disabled = true;
    if (b.textContent === correct) b.classList.add("correct");
  });
  if (picked === correct) { score++; $("quizFeedback").textContent = "Correct! 🎉"; }
  else { btn.classList.add("incorrect"); $("quizFeedback").textContent = `Not quite. The answer is "${correct}".`; }
  $("quizScore").textContent = `Score: ${score}`;
  $("quizNextBtn").disabled = false;
}

function nextQuestion() {
  if (!answered) return;
  qi++;
  qi < quiz.length ? renderQuestion() : finishQuiz();
}

function finishQuiz() {
  $("quizPanel").classList.add("hidden");
  $("quizResult").classList.remove("hidden");
  const total = quiz.length, pct = Math.round(score / total * 100);
  progress.best[quizKey] = Math.max(progress.best[quizKey] || 0, score);
  progress.quizzes++;
  save(PROGRESS_KEY, progress);
  renderProgress();
  $("resultTitle").textContent = pct >= 80 ? "Excellent work! 🏆" : pct >= 50 ? "Good effort! 💪" : "Keep practising! 🌱";
  $("resultScore").textContent = `${score} / ${total}`;
  $("resultMessage").textContent = `You scored ${pct}%. Best score for this quiz: ${progress.best[quizKey]}/${total}.`;
}

// ---------- reset, tabs, start ----------
function resetProgress() {
  if (!confirm("Reset all learned words and quiz scores? Your saved My words list stays.")) return;
  const custom = progress.custom;
  progress = defaultProgress();
  progress.custom = custom;
  save(PROGRESS_KEY, progress);
  renderCard();
}

function fillLanguages(select, selected) {
  LANGS.forEach(([code, name]) => {
    const o = document.createElement("option");
    o.value = code; o.textContent = name;
    select.appendChild(o);
  });
  select.value = selected;
}

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    tab.classList.add("active");
    $(tab.dataset.view).classList.remove("hidden");
  });
});

document.addEventListener("DOMContentLoaded", () => {
  fillLanguages($("language"), "es");
  fillLanguages($("quizLanguage"), "es");

  $("language").addEventListener("change", () => { $("quizLanguage").value = curLang(); loadLearn(); });
  $("category").addEventListener("change", loadLearn);
  $("meaningBtn").addEventListener("click", toggleMeaning);
  $("listenBtn").addEventListener("click", () => speak(cards[idx].word, cards[idx].lang, notice));
  $("learnedBtn").addEventListener("click", toggleLearned);
  $("prevBtn").addEventListener("click", () => changeCard(-1));
  $("nextBtn").addEventListener("click", () => changeCard(1));

  $("searchBtn").addEventListener("click", doSearch);
  $("searchInput").addEventListener("keydown", e => { if (e.key === "Enter") doSearch(); });
  $("searchListenBtn").addEventListener("click", () => lastSearch && speak(lastSearch.tr, lastSearch.lang, m => { $("searchStatus").textContent = m; }));
  $("addWordBtn").addEventListener("click", addSearchWord);

  $("startQuizBtn").addEventListener("click", startQuiz);
  $("retryQuizBtn").addEventListener("click", startQuiz);
  $("quizNextBtn").addEventListener("click", nextQuestion);
  $("resetBtn").addEventListener("click", resetProgress);

  loadLearn();
});