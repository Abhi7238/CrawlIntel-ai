import json
from pathlib import Path

import faiss
import numpy as np


class FaissStore:
    def __init__(self, index_path: Path, metadata_path: Path) -> None:
        self.index_path = index_path
        self.metadata_path = metadata_path

    def save(self, embeddings: list[list[float]], metadata: list[dict]) -> int:
        if not embeddings:
            raise ValueError("No embeddings provided to save")

        matrix = np.array(embeddings, dtype="float32")
        dim = matrix.shape[1]

        index = faiss.IndexFlatL2(dim)
        index.add(matrix)

        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        faiss.write_index(index, str(self.index_path))

        with self.metadata_path.open("w", encoding="utf-8") as file:
            for item in metadata:
                file.write(json.dumps(item, ensure_ascii=True) + "\n")

        return index.ntotal

    def load(self) -> tuple[faiss.Index, list[dict]]:
        if not self.index_path.exists() or not self.metadata_path.exists():
            raise FileNotFoundError("FAISS index or metadata is missing")

        index = faiss.read_index(str(self.index_path))

        metadata: list[dict] = []
        with self.metadata_path.open("r", encoding="utf-8") as file:
            for line in file:
                stripped = line.strip()
                if stripped:
                    metadata.append(json.loads(stripped))

        return index, metadata

    def search(self, query_embedding: list[float], top_k: int) -> list[dict]:
        index, metadata = self.load()
        query = np.array([query_embedding], dtype="float32")
        distances, indices = index.search(query, top_k)

        results: list[dict] = []
        for idx, distance in zip(indices[0], distances[0]):
            if idx == -1:
                continue
            item = metadata[idx].copy()
            item["score"] = float(distance)
            results.append(item)

        return results
