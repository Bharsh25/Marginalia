import os
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from rag_pipeline import build_pipeline, generate_output, list_papers

app = FastAPI(title="The Archive — RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = None


@app.on_event("startup")
def startup():
    global pipeline
    pipeline = build_pipeline()


class QueryRequest(BaseModel):
    query: str
    top_k: int = 6
    source: Optional[str] = None  # exact "path" value from /api/papers, or None for all papers


@app.get("/api/papers")
def get_papers():
    return list_papers(pipeline["vector_store"])


@app.post("/api/query")
def post_query(req: QueryRequest):
    return generate_output(
        req.query,
        pipeline["retriever"],
        pipeline["llm"],
        top_k=req.top_k,
        source=req.source,
    )



app.mount("/", StaticFiles(directory="static", html=True), name="static")
