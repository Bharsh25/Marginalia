import os
import re
import hashlib
from collections import Counter

import chromadb
from fastembed import TextEmbedding
from langchain_groq import ChatGroq


class EmbeddingManager:
    def __init__(self, model_name="sentence-transformers/all-MiniLM-L6-v2"):
        print("Loading fastembed model....", model_name)
        self.model = TextEmbedding(model_name=model_name)

    def generate_embeddings(self, text):
        # text can be a single string or a list of strings
        if isinstance(text, str):
            text = [text]
        # fastembed returns a generator of numpy arrays — convert to plain lists
        return [emb.tolist() for emb in self.model.embed(text)]

class VectorStoreManager:
    """Same store your notebook already built and ingested into.
    Point persist_directory at the same path used during ingestion."""

    def __init__(self, persist_directory="data/vector_store", collection_name="pdf_documents"):
        self.persist_directory = persist_directory
        self.collection_name = collection_name
        os.makedirs(persist_directory, exist_ok=True)
        self.client = chromadb.PersistentClient(path=persist_directory)
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={
                "description": "vector store collection for pdf embeddings in RAG",
                "hnsw:space": "cosine",
            },
        )
        print("initialized vector store:", collection_name, "| docs:", self.collection.count())

    def add_documents(self, documents, embeddings):
        """Kept here in case you want to (re)ingest via the API later.
        Deduplicates within the batch to avoid Chroma's DuplicateIDError."""
        if len(documents) != len(embeddings):
            raise ValueError("num of documents does not match num of embeddings")

        seen_ids = set()
        ids, all_metadata, documents_content, embeddings_list = [], [], [], []

        for i, (doc, embedding) in enumerate(zip(documents, embeddings)):
            doc_id = f"doc_{hashlib.md5(doc.page_content.encode()).hexdigest()}"
            if doc_id in seen_ids:
                continue
            seen_ids.add(doc_id)
            ids.append(doc_id)

            metadata = dict(doc.metadata)
            metadata["doc_index"] = i
            metadata["content_length"] = len(doc.page_content)
            all_metadata.append(metadata)

            documents_content.append(doc.page_content)
            embeddings_list.append(embedding)

        self.collection.upsert(
            ids=ids, metadatas=all_metadata, documents=documents_content, embeddings=embeddings_list
        )


class RAGRetriever:
    def __init__(self, embedding_manager, vector_store):
        self.embedding_manager = embedding_manager
        self.vector_store = vector_store

    def retrieve(self, query, top_k=6, score_threshold=0.3, source=None):
        query_embedding = self.embedding_manager.generate_embeddings([query])[0]

        # optional: restrict search to a single paper (used by the "shelf" filter in the UI)
        where = {"source": source} if source else None

        results = self.vector_store.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where,
        )

        retrieved_docs = []
        if results["documents"] and results["documents"][0]:
            for i, (doc_id, metadata, document, distance) in enumerate(
                zip(results["ids"][0], results["metadatas"][0], results["documents"][0], results["distances"][0])
            ):
                similarity_score = 1 - distance
                if similarity_score >= score_threshold:
                    retrieved_docs.append(
                        {
                            "id": doc_id,
                            "document": document,
                            "metadata": metadata,
                            "distance": distance,
                            "similarity_score": similarity_score,
                            "rank": i + 1,
                        }
                    )
        return retrieved_docs


def strip_latex(text):
    """Catches any LaTeX the model writes despite the prompt instruction."""
    text = re.sub(r"\\\((.*?)\\\)", r"\1", text)
    text = re.sub(r"\\\[(.*?)\\\]", r"\1", text, flags=re.DOTALL)
    text = text.replace("\\dots", "...")
    text = re.sub(r"\\mathbf\{(.*?)\}", r"\1", text)
    text = re.sub(r"_\{?(\w+)\}?", r"\1", text)
    text = text.replace("\\", "")
    return text


def list_papers(vector_store):
    """Returns each indexed paper's filename and chunk count, for the sidebar shelf."""
    data = vector_store.collection.get(include=["metadatas"])
    sources_and_paths = {}
    for m in data["metadatas"]:
        path = m.get("source", "unknown")
        sources_and_paths[os.path.basename(path)] = path

    counts = Counter(os.path.basename(m.get("source", "unknown")) for m in data["metadatas"])
    return [
        {"name": name, "path": sources_and_paths[name], "chunks": count}
        for name, count in sorted(counts.items())
    ]


def generate_output(query, retriever, llm, top_k=6, score_threshold=0.3, source=None):
    results = retriever.retrieve(query, top_k=top_k, score_threshold=score_threshold, source=source)

    if not results:
        return {
            "answer": "No relevant passages were found in the archive for this request. Try rephrasing, or clear the paper focus if one is set.",
            "sources": [],
        }

    context = "\n\n".join(
        f"[Source: {os.path.basename(doc['metadata'].get('source', 'unknown'))}, "
        f"page {doc['metadata'].get('page', '?')}]\n{doc['document']}"
        for doc in results
    )

    prompt = f"""You are a research assistant helping a student deeply understand AI papers. Using ONLY the given context, write a thorough, detailed answer to the query below.

Guidelines:
- Explain the concept fully: how it works, why it was designed that way, and how it fits the broader system.
- Use specifics from the context (numbers, layer counts, architecture details) wherever available.
- Structure the answer with short paragraphs or bullet points.
- If the context only partially covers the query, answer what you can and note what's missing rather than guessing.
- Do not use LaTeX notation of any kind (no \\(, \\), \\dots, \\mathbf, underscores for subscripts). Write math in plain text, e.g. "x1, x2, ..., xn".

Context:
{context}

Query: {query}"""

    response = llm.invoke(prompt)
    answer = strip_latex(response.content)

    seen = set()
    sources_out = []
    for doc in results:
        file = os.path.basename(doc["metadata"].get("source", "unknown"))
        page = doc["metadata"].get("page", "?")
        key = (file, page)
        if key not in seen:
            seen.add(key)
            sources_out.append({"file": file, "page": page})

    return {"answer": answer, "sources": sources_out}


def build_pipeline(persist_directory="data/vector_store", collection_name="pdf_documents"):
    """Call this once at API startup. Assumes you've already run ingestion
    (loading PDFs, chunking, embedding, and adding to the vector store) —
    this just connects to that existing persisted store."""
    embedding_manager = EmbeddingManager()
    vector_store = VectorStoreManager(persist_directory=persist_directory, collection_name=collection_name)
    retriever = RAGRetriever(embedding_manager, vector_store)

    llm = ChatGroq(
        groq_api_key=os.environ["GROQ_API_KEY"],  # set this in your environment, never hardcode it
        model="openai/gpt-oss-120b",
        temperature=0.1,
        max_tokens=2048,
    )

    return {
        "embedding_manager": embedding_manager,
        "vector_store": vector_store,
        "retriever": retriever,
        "llm": llm,
    }
