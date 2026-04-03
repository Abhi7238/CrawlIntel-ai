import re

from openai import OpenAI

from app.core.config import Settings
from app.rag.retriever import Retriever


class QAService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = OpenAI(api_key=settings.active_api_key, base_url=settings.active_base_url)
        self.retriever = Retriever(settings=settings)

    def _normalize(self, query: str) -> str:
        return " ".join(query.strip().lower().split())

    def _is_small_talk(self, query: str) -> bool:
        normalized = self._normalize(query)
        if not normalized:
            return True

        if len(normalized) > 80:
            return False

        patterns = [
            r"^(hi|hello|hey|yo|hola)$",
            r"^(good\s*(morning|afternoon|evening|night))$",
            r"^(how are you|how are u|what's up|whats up)$",
            r"^(thanks|thank you|thx|ty)$",
            r"^(bye|goodbye|see you|cya)$",
            r"^(who are you|what can you do)$",
        ]
        return any(re.match(pattern, normalized) for pattern in patterns)

    def _small_talk_response(self, query: str) -> str:
        normalized = self._normalize(query)
        if normalized in {"thanks", "thank you", "thx", "ty"}:
            return "You are welcome. Ask me a question about your scraped content whenever you are ready."
        if normalized in {"bye", "goodbye", "see you", "cya"}:
            return "Goodbye. I am here whenever you want to continue."
        if normalized in {"who are you", "what can you do"}:
            return "I am your RAG assistant. I can answer questions using the content you scraped and indexed."
        return "Hello. Ask me anything about the pages you have scraped, and I will answer using that indexed content."

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
        if self._is_small_talk(query):
            return {"answer": self._small_talk_response(query), "sources": []}

        hits = self.retriever.retrieve(query)

        if not hits:
            return {
                "answer": "I do not have enough indexed content yet. Run a scrape and index job first.",
                "sources": [],
            }

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
                        "Format every non-small-talk answer as a numbered list (1., 2., 3.). "
                        "Keep each point concise and factual. "
                        "For list-style questions, return one idea per point with relevant citations on each point."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Question: {query}\n\nContext:\n{context}",
                },
            ],
        )

        answer_text = completion.choices[0].message.content or "No response generated."
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
