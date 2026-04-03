import re

from openai import OpenAI

from app.core.config import Settings
from app.rag.retriever import Retriever


class QAService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)
        self.retriever = Retriever(settings=settings)
        self.corpus_score_threshold = 0.28

    def _normalize(self, query: str) -> str:
        return " ".join(query.strip().lower().split())

    def _general_answer(self, query: str) -> str:
        completion = self.client.chat.completions.create(
            model=self.settings.llm_chat_model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer as a helpful general-purpose assistant. "
                        "Do not mention sources unless the user asks for them. "
                        "Default to a concise paragraph unless the user clearly asks for a list, steps, or comparison."
                    ),
                },
                {
                    "role": "user",
                    "content": query,
                },
            ],
        )

        return completion.choices[0].message.content or "No response generated."

    def _should_use_numbered_points(self, query: str) -> bool:
        normalized = self._normalize(query)
        list_intent_patterns = [
            r"\b(list|points|bullet|bullets|steps|top\s*\d+|top|compare|comparison|pros\s*and\s*cons)\b",
            r"^(what are|which are|show me|give me)\b",
            r"\b(how to|roadmap|checklist|plan)\b",
        ]
        return any(re.search(pattern, normalized) for pattern in list_intent_patterns)

    def _force_numbered_points(self, answer_text: str) -> str:
        stripped = answer_text.strip()
        if not stripped:
            return answer_text

        # Preserve already-numbered or bullet-style answers.
        if re.search(r"^\s*\d+[.)]\s+", stripped, flags=re.MULTILINE):
            return re.sub(r"\s*(\d+[.)]\s+)", r"\n\1", stripped).strip()
        if re.search(r"^\s*[-*]\s+", stripped, flags=re.MULTILINE):
            lines = [line.strip(" -*\t") for line in stripped.splitlines() if line.strip()]
            points = [line for line in lines if line]
            if points:
                return "\n".join(f"{idx + 1}. {point}" for idx, point in enumerate(points))

        inline_numbered = re.findall(r"\b\d+[.)]\s+", stripped)
        if len(inline_numbered) >= 2:
            normalized = re.sub(r"\s*(\d+[.)]\s+)", r"\n\1", stripped)
            return normalized.strip()

        chunks = [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+|\n+", stripped) if chunk.strip()]
        if len(chunks) <= 1:
            return f"1. {stripped}"

        return "\n".join(f"{idx + 1}. {chunk}" for idx, chunk in enumerate(chunks))

    def answer(self, query: str) -> dict:
        normalized_query = self._normalize(query)
        short_query = len(normalized_query) <= 40 and len(normalized_query.split()) <= 7

        # Fast conversational path: skip retrieval for short prompts to keep greetings/general quick.
        if short_query:
            answer_text = self._general_answer(query)
            if self._should_use_numbered_points(query):
                answer_text = self._force_numbered_points(answer_text)
            return {"answer": answer_text, "sources": []}

        hits = self.retriever.retrieve(query)

        top_score = float(hits[0].get("score", 0.0)) if hits else 0.0
        if not hits or top_score < self.corpus_score_threshold:
            answer_text = self._general_answer(query)
            if self._should_use_numbered_points(query):
                answer_text = self._force_numbered_points(answer_text)
            return {"answer": answer_text, "sources": []}

        context_blocks: list[str] = []
        for idx, item in enumerate(hits, start=1):
            block = (
                f"[{idx}] Title: {item.get('title', 'Untitled')}\n"
                f"URL: {item.get('source_url', '')}\n"
                f"Content: {item.get('text', '')}"
            )
            context_blocks.append(block)

        context = "\n\n".join(context_blocks)

        completion = self.client.chat.completions.create(
            model=self.settings.llm_chat_model,
            temperature=0,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer only from the provided context. "
                        "If the context is insufficient, say you do not know. "
                        "Always include citation indexes like [1], [2]. "
                        "Default to a concise paragraph unless the user asks for a list, steps, points, or comparison. "
                        "For list-style questions, return numbered points (1., 2., 3.) with concise factual items and citations."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Question: {query}\n\nContext:\n{context}",
                },
            ],
        )

        answer_text = completion.choices[0].message.content or "No response generated."
        if self._should_use_numbered_points(query):
            answer_text = self._force_numbered_points(answer_text)

        sources = [
            {
                "source_url": item.get("source_url", ""),
                "title": item.get("title", "Untitled"),
                "score": float(item.get("score", 0.0)),
            }
            for item in hits
        ]

        return {"answer": answer_text, "sources": sources}
