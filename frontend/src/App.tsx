import { FormEvent, KeyboardEvent, useMemo, useState } from "react";

type Source = {
  source_url: string;
  title: string;
  score: number;
};

type ChatResponse = {
  answer: string;
  sources: Source[];
};

type AnswerBlock =
  | { kind: "list"; items: string[] }
  | { kind: "text"; text: string };

const THINKING_QUOTES = [
  "\"Brewing an answer from your sources...\"",
  "\"Connecting the dots across your corpus...\"",
  "\"Finding the sharpest citation trail...\"",
];

const API_BASE = import.meta.env.VITE_API_BASE ?? (window.location.hostname === "localhost" ? "http://localhost:8000" : "");

function parseAnswer(answer: string): AnswerBlock {
  const normalized = answer.replace(/\r\n/g, "\n").trim();
  const listMatches = normalized.match(/(^|\n)\s*\d+[.)]\s+.+?(?=(?:\n\s*\d+[.)]\s+)|$)/gms);

  if (listMatches && listMatches.length >= 2) {
    const items = listMatches
      .map((item) => item.replace(/^\s*\d+[.)]\s+/, "").trim())
      .filter(Boolean);

    if (items.length >= 2) {
      return { kind: "list", items };
    }
  }

  const inlineMatches = normalized.match(/\b\d+[.)]\s+[^\d]+?(?=(?:\s+\d+[.)]\s+)|$)/gms);
  if (inlineMatches && inlineMatches.length >= 2) {
    const items = inlineMatches.map((item) => item.replace(/^\d+[.)]\s+/, "").trim()).filter(Boolean);
    if (items.length >= 2) {
      return { kind: "list", items };
    }
  }

  return { kind: "text", text: normalized };
}

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const answerBlock = useMemo(() => (response ? parseAnswer(response.answer) : null), [response]);

  const canAsk = useMemo(() => query.trim().length > 1 && !loading, [query, loading]);

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk) {
      return;
    }

    setLoading(true);
    setQuoteIndex((current) => (current + 1) % THINKING_QUOTES.length);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const payload = await res.json();

      if (!res.ok) {
        setError(payload.detail ?? "Request failed");
        setResponse(null);
      } else {
        setResponse(payload as ChatResponse);
      }
    } catch {
      setError("Could not connect to backend API");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  function onQueryKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (canAsk) {
      void onAskFromKeyboard();
    }
  }

  async function onAskFromKeyboard() {
    if (!canAsk) {
      return;
    }

    setLoading(true);
    setQuoteIndex((current) => (current + 1) % THINKING_QUOTES.length);
    setError("");

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const payload = await res.json();

      if (!res.ok) {
        setError(payload.detail ?? "Request failed");
        setResponse(null);
      } else {
        setResponse(payload as ChatResponse);
      }
    } catch {
      setError("Could not connect to backend API");
      setResponse(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <main className="shell">
        <section className="panel hero">
          <p className="eyebrow">Source-Grounded AI Assistant</p>
          <h1>Web Intelligence Assistant</h1>
          <p>
            Query your indexed web knowledge base with confidence. Responses are generated from retrieved source chunks and include clear citations for traceability.
          </p>
        </section>

        <section className="panel chat">
          <form onSubmit={onAsk} className="ask-form">
            <label htmlFor="question-main">Question</label>
            <textarea
              id="question-main"
              rows={4}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onQueryKeyDown}
              placeholder="What does the documentation say about ..."
            />
            <button type="submit" disabled={!canAsk}>
              {loading ? "Thinking..." : "Ask"}
            </button>
          </form>

          {loading ? (
            <div className="thinking-panel" role="status" aria-live="polite">
              <p className="thinking-title">Thinking<span className="dot-stream" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
              <p className="thinking-quote">🤖 {THINKING_QUOTES[quoteIndex]}</p>
            </div>
          ) : null}

          {error ? <p className="error">{error}</p> : null}

          {response ? (
            <div className="result">
              <h2>Answer</h2>
              {answerBlock?.kind === "list" ? (
                <ol className="answer-list">
                  {answerBlock.items.map((item, index) => (
                    <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="answer-text">{answerBlock?.kind === "text" ? answerBlock.text : response.answer}</p>
              )}

              <h3>Sources</h3>
              <ul>
                {response.sources.map((source, index) => (
                  <li key={`${source.source_url}-${index}`}>
                    <a href={source.source_url} target="_blank" rel="noreferrer">
                      {source.title || source.source_url}
                    </a>
                    <span>score: {source.score.toFixed(4)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </main>

      <div className="chat-widget">
        {isLauncherOpen ? (
          <section className="panel chat-drawer">
            <form onSubmit={onAsk} className="ask-form">
              <label htmlFor="question-widget">Question</label>
              <textarea
                id="question-widget"
                rows={4}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onQueryKeyDown}
                placeholder="What does the documentation say about ..."
              />
              <button type="submit" disabled={!canAsk}>
                {loading ? "Thinking..." : "Ask"}
              </button>
            </form>

            {loading ? (
              <div className="thinking-panel" role="status" aria-live="polite">
                <p className="thinking-title">Thinking<span className="dot-stream" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></p>
                <p className="thinking-quote">🤖 {THINKING_QUOTES[quoteIndex]}</p>
              </div>
            ) : null}

            {error ? <p className="error">{error}</p> : null}

            {response ? (
              <div className="result">
                <h2>Answer</h2>
                {answerBlock?.kind === "list" ? (
                  <ol className="answer-list">
                    {answerBlock.items.map((item, index) => (
                      <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="answer-text">{answerBlock?.kind === "text" ? answerBlock.text : response.answer}</p>
                )}

                <h3>Sources</h3>
                <ul>
                  {response.sources.map((source, index) => (
                    <li key={`${source.source_url}-${index}`}>
                      <a href={source.source_url} target="_blank" rel="noreferrer">
                        {source.title || source.source_url}
                      </a>
                      <span>score: {source.score.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        <button
          type="button"
          className="chat-launcher"
          onClick={() => setIsLauncherOpen((current) => !current)}
          aria-label={isLauncherOpen ? "Close bot" : "Open bot"}
          title={isLauncherOpen ? "Close bot" : "Open bot"}
        >
          <span className="chat-launcher-icon" aria-hidden="true">🤖</span>
        </button>
      </div>
    </>
  );
}
