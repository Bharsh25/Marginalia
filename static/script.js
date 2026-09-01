const paperListEl = document.getElementById("paper-list");
const clearFilterBtn = document.getElementById("clear-filter");
const focusTagEl = document.getElementById("focus-tag");
const form = document.getElementById("request-form");
const queryInput = document.getElementById("query");
const submitBtn = document.getElementById("submit-btn");
const feedEl = document.getElementById("feed");

let activeSource = null; // "path" value from /api/papers, or null for "search all"
let requestCount = 0;
let loadedPapers = [];

// example questions per paper — matched to the shelf by keyword against the filename
const EXAMPLE_QUESTIONS = [
  { keyword: "attention", question: "What is the role of multi-head attention in the Transformer?" },
  { keyword: "attention", question: "How does positional encoding let the Transformer understand word order?" },

  { keyword: "rag", question: "How does Retrieval-Augmented Generation combine retrieval with generation?" },
  { keyword: "rag", question: "What's the difference between RAG and standard fine-tuning?" },

  { keyword: "diffusion", question: "How does the denoising process work in diffusion models?" },
  { keyword: "diffusion", question: "What is the forward noising process in a diffusion model?" },

  { keyword: "rope", question: "How does RoPE encode positional information differently from sinusoidal encoding?" },
  { keyword: "rope", question: "Why is RoPE well suited for long-context language models?" },

  { keyword: "moe", question: "How does a Mixture-of-Experts layer route tokens to different experts?" },
  { keyword: "moe", question: "What is the advantage of sparse expert activation in MoE models?" },

  { keyword: "vit", question: "How is an image turned into patch embeddings in Vision Transformer?" },
  { keyword: "vit", question: "How does ViT compare to CNNs for image classification?" },

  { keyword: "bert", question: "What is masked language modeling in BERT's pretraining?" },
  { keyword: "bert", question: "What is next sentence prediction used for in BERT?" },

  { keyword: "lora", question: "How does LoRA reduce the number of trainable parameters during fine-tuning?" },
  { keyword: "lora", question: "What are the low-rank matrices in LoRA and how are they applied?" },

  { keyword: "vae", question: "What is the role of the reparameterization trick in a VAE?" },
  { keyword: "vae", question: "How does a VAE's loss function balance reconstruction and regularization?" },

  { keyword: "instructgpt", question: "How is InstructGPT fine-tuned using human feedback?" },
  { keyword: "instructgpt", question: "What is the role of the reward model in InstructGPT's training?" },

  { keyword: "rlhf", question: "What are the main stages of RLHF training?" },
  { keyword: "rlhf", question: "How is a reward model trained from human preference data in RLHF?" },

  { keyword: "llama", question: "What architectural choices make LLaMA efficient at scale?" },
  { keyword: "llama", question: "What data was LLaMA trained on?" },

  { keyword: "gan", question: "How do the generator and discriminator compete in a GAN?" },
  { keyword: "gan", question: "What is mode collapse in GAN training?" },

  { keyword: "peft", question: "What's the difference between full fine-tuning and parameter-efficient fine-tuning?" },
  { keyword: "peft", question: "What are common PEFT techniques besides LoRA?" },
];

// ---------- Load the shelf ----------

async function loadPapers() {
  try {
    const res = await fetch("/api/papers");
    const papers = await res.json();
    loadedPapers = papers;

    if (!papers.length) {
      paperListEl.innerHTML = `<div class="paper-item skeleton">No papers indexed yet.</div>`;
      return;
    }

    paperListEl.innerHTML = "";
    papers.forEach((paper) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "paper-item";
      item.dataset.path = paper.path;
      item.innerHTML = `<span>${prettifyName(paper.name)}</span><span class="count">${paper.chunks}</span>`;
      item.addEventListener("click", () => toggleFocus(paper));
      paperListEl.appendChild(item);
    });
  } catch (err) {
    paperListEl.innerHTML = `<div class="paper-item skeleton">Couldn't reach the archive API.</div>`;
  }
}

// ---------- Example question chips (shown only once a paper is focused) ----------

function renderChipsForPaper(paper) {
  const section = document.getElementById("try-asking");
  const chipGrid = document.getElementById("chip-grid");

  const nameLower = paper.name.toLowerCase();
  const matches = EXAMPLE_QUESTIONS.filter((ex) => nameLower.includes(ex.keyword.toLowerCase()));

  if (!matches.length) {
    section.hidden = true;
    chipGrid.innerHTML = "";
    return;
  }

  chipGrid.innerHTML = "";
  matches.forEach((ex) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = ex.question;
    chip.addEventListener("click", () => {
      queryInput.value = ex.question;
      queryInput.focus();
    });
    chipGrid.appendChild(chip);
  });
  section.hidden = false;
}

function hideChips() {
  const section = document.getElementById("try-asking");
  section.hidden = true;
  document.getElementById("chip-grid").innerHTML = "";
}

function prettifyName(filename) {
  return filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
}

function toggleFocus(paper) {
  const items = paperListEl.querySelectorAll(".paper-item");

  if (activeSource === paper.path) {
    // clicking the active paper again clears the focus
    activeSource = null;
    items.forEach((el) => el.classList.remove("active"));
    focusTagEl.hidden = true;
    clearFilterBtn.hidden = true;
    hideChips();
    return;
  }

  activeSource = paper.path;
  items.forEach((el) => el.classList.toggle("active", el.dataset.path === paper.path));
  focusTagEl.hidden = false;
  focusTagEl.textContent = `Focused: ${prettifyName(paper.name)}`;
  clearFilterBtn.hidden = false;
  renderChipsForPaper(paper);
}

clearFilterBtn.addEventListener("click", () => {
  activeSource = null;
  paperListEl.querySelectorAll(".paper-item").forEach((el) => el.classList.remove("active"));
  focusTagEl.hidden = true;
  clearFilterBtn.hidden = true;
  hideChips();
});

// ---------- Submit a request ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = queryInput.value.trim();
  if (!query) return;

  requestCount += 1;
  const entry = renderPendingEntry(query, requestCount);
  queryInput.value = "";
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, top_k: 6, source: activeSource }),
    });

    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    fillEntry(entry, data);
  } catch (err) {
    fillEntryError(entry, err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

// allow Cmd/Ctrl+Enter to submit from the textarea
queryInput.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    form.requestSubmit();
  }
});

// ---------- Feed rendering ----------

function renderPendingEntry(query, num) {
  const entry = document.createElement("article");
  entry.className = "entry";
  entry.innerHTML = `
    <div class="entry-request">Request No. ${String(num).padStart(3, "0")}</div>
    <h3 class="entry-query"></h3>
    <div class="entry-answer entry-loading">Consulting the archive…</div>
  `;
  entry.querySelector(".entry-query").textContent = query;
  feedEl.prepend(entry);
  return entry;
}

function fillEntry(entry, data) {
  const answerEl = entry.querySelector(".entry-answer");
  answerEl.classList.remove("entry-loading");
  answerEl.innerHTML = renderAnswer(data.answer);

  if (data.sources && data.sources.length) {
    const tickets = document.createElement("div");
    tickets.className = "tickets";
    data.sources.forEach((s) => {
      const ticket = document.createElement("span");
      ticket.className = "ticket";
      ticket.textContent = `${prettifyName(s.file).toUpperCase()} · P.${s.page}`;
      tickets.appendChild(ticket);
    });
    entry.appendChild(tickets);
  }
}

function fillEntryError(entry, message) {
  const answerEl = entry.querySelector(".entry-answer");
  answerEl.classList.remove("entry-loading");
  answerEl.classList.add("entry-error");
  answerEl.textContent = `The archive couldn't process this request (${message}).`;
}

// minimal markdown -> HTML: **bold**, "- " bullet lines, paragraphs
function renderAnswer(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const blocks = withBold.split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const isList = lines.length > 0 && lines.every((l) => l.startsWith("- ") || l.startsWith("* "));
      if (isList) {
        const items = lines.map((l) => `<li>${l.replace(/^[-*]\s+/, "")}</li>`).join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${lines.join(" ")}</p>`;
    })
    .join("");
}

loadPapers();