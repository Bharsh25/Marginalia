# Marginalia

**An archive of the research papers that built modern AI — ask it a question, get a detailed answer with page-level citations.**

Marginalia is a Retrieval-Augmented Generation (RAG) system built over fourteen foundational AI papers — Attention Is All You Need, BERT, RAG, LoRA, RLHF, and more. Instead of a generic chat window, it's built as a custom "reading room" interface: browse papers on a shelf, ask questions in a request slip, and get answers backed by citation "tickets" showing exactly which paper and page the answer came from.

## 📸 Screenshots
<img width="1720" height="913" alt="Screenshot 2026-09-01 234743" src="https://github.com/user-attachments/assets/d4d0bf3e-83ce-4acc-9a1b-cf167a961605" />

## ✨ Features

- **Custom-built interface** — FastAPI backend + plain HTML/CSS/JS frontend, no Streamlit or React boilerplate
- **Layout-aware PDF parsing** — correctly reads two-column academic papers in proper reading order, with OCR fallback for scanned/older papers
- **Grounded, cited answers** — every answer links back to the exact source file and page number
- **Paper-scoped search** — click a paper on the shelf to restrict a question to that paper alone
- **Deduplicated ingestion** — content-hash-based chunk IDs mean re-running ingestion never creates duplicate entries
- **Clean output** — LaTeX artifacts from academic PDFs are stripped so answers read as plain, readable text

## 🗂 The papers indexed

| # | Paper |
|---|-------|
| 1 | Attention Is All You Need (Transformers) |
| 2 | BERT |
| 3 | Diffusion Models (Stable Diffusion) |
| 4 | GANs |
| 5 | InstructGPT |
| 6 | LLaMA |
| 7 | LoRA |
| 8 | MoE (Mixture of Experts) |
| 9 | PEFT |
| 10 | RAG |
| 11 | RLHF |
| 12 | RoPE |
| 13 | VAE |
| 14 | ViT (Vision Transformer) |

## 🏗 Architecture

```
PDFs → layout-aware parsing (+ OCR fallback) → chunking
     → embeddings (sentence-transformers) → Chroma vector store
     → semantic retrieval → Groq LLM → cited, LaTeX-free answer
```

## 📁 Project structure

```
marginalia/
├── main.py              # FastAPI app — /api/papers, /api/query, serves the frontend
├── rag_pipeline.py       # Embedding, vector store, retrieval, and generation logic
├── requirements.txt
├── README.md
├── .env                  # GROQ_API_KEY (not committed)
├── data/
│   ├── pdfs/             # the 14 source papers
│   └── vector_store/     # persisted Chroma DB (already ingested)
└── static/
    ├── index.html        # the "Reading Room" layout
    ├── style.css         # archive/card-catalog visual design
    └── script.js         # shelf filtering, query submission, answer rendering
```

## 🚀 Getting started

### 1. Clone and install
```bash
git clone https://github.com/your-username/marginalia.git
cd marginalia
python -m venv venv
source venv/Scripts/activate   # Windows (Git Bash)
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
```

### 2. Set your Groq API key
Create a `.env` file in the project root:
```
GROQ_API_KEY=your-key-here
```
Get a free key at [console.groq.com](https://console.groq.com).

### 3. Run it
```bash
python -m uvicorn main:app --reload
```
Open **http://localhost:8000**.

> The vector store (`data/vector_store`) already contains the 14 ingested papers — no need to re-run ingestion unless you're adding new papers.

## 🛠 Tech stack

- **Backend:** FastAPI, Python
- **Embeddings:** `sentence-transformers` (all-MiniLM-L6-v2)
- **Vector store:** ChromaDB (cosine similarity)
- **LLM:** Groq (`openai/gpt-oss-120b`)
- **PDF parsing:** PyMuPDF + Tesseract OCR fallback
- **Frontend:** vanilla HTML, CSS, JavaScript (no build step)


## 📄 License

This project is for educational/portfolio purposes. The indexed papers remain the copyright of their respective authors/publishers — only citations and short excerpts are surfaced, not full reproductions.

## 🙋 Author

Built by Harsh Bhendarkar — B.E. student in Artificial Intelligence & Data Science, Datta Meghe College of Engineering.
