import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type Source = {
  source_url: string;
  title: string;
  score: number;
};

type ChatResponse = {
  answer: string;
  sources: Source[];
  ui_title?: string | null;
};

type AnswerBlock =
  | { kind: "list"; items: string[] }
  | { kind: "text"; text: string };

const THINKING_QUOTES = [
  "\"Brewing an answer from your sources...\"",
  "\"Connecting the dots across your corpus...\"",
  "\"Finding the sharpest citation trail...\"",
];

function BotIcon() {
  return (
    <svg viewBox="0 0 24 24" className="chat-launcher-icon" aria-hidden="true">
      <path d="M12 2a1 1 0 0 1 1 1v1.08A6 6 0 0 1 18 10v1h1a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-1v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-1H5a3 3 0 0 1-3-3v-3a3 3 0 0 1 3-3h1v-1a6 6 0 0 1 5-5.92V3a1 1 0 0 1 1-1Zm0 5a4 4 0 0 0-4 4v7a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-7a4 4 0 0 0-4-4Zm-2 4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm4 0a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z" />
    </svg>
  );
}

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

function displaySourceTitle(source: Source): string {
  const candidate = (source.title || "").trim();
  if (candidate && candidate.toLowerCase() != "untitled") {
    return candidate;
  }

  try {
    const parsed = new URL(source.source_url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.split("/").filter(Boolean).slice(-1)[0] || "home";
    return `${host} - ${decodeURIComponent(path).replace(/[-_]+/g, " ")}`;
  } catch {
    return source.source_url || "Source";
  }
}

function isGreetingQuery(query: string): boolean {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(hi+|hello+|hey+|heyy+|yo+|hola+|welcome+|good\s*(morning|afternoon|evening|night)|how are you|how are u|what'?s up|whats up)$/.test(normalized);
}

function getResponseHeading(response: ChatResponse | null, submittedQuery: string): string {
  if (!response) {
    return "";
  }

  if (response.ui_title && response.ui_title.trim().length > 0) {
    return response.ui_title.trim();
  }

  if (isGreetingQuery(submittedQuery)) {
    return "Welcome";
  }

  if (response.sources.length === 0) {
    return "CrawlIntel says";
  }

  return "Here's what I found";
}

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [animatedAnswer, setAnimatedAnswer] = useState("");
  const [isLauncherOpen, setIsLauncherOpen] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const mainTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const widgetTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const answerBlock = useMemo(() => parseAnswer(animatedAnswer), [animatedAnswer]);

  function autoResizeTextarea(element: HTMLTextAreaElement | null) {
    if (!element) {
      return;
    }

    const maxHeight = 220;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  function onQueryChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setQuery(event.target.value);
    autoResizeTextarea(event.target);
  }

  useEffect(() => {
    if (!response?.answer) {
      setAnimatedAnswer("");
      return;
    }

    const tokens = response.answer.split(/(\s+)/).filter((token) => token.length > 0);
    let index = 0;
    setAnimatedAnswer("");

    const timer = window.setInterval(() => {
      index += 1;
      setAnimatedAnswer(tokens.slice(0, index).join(""));

      if (index >= tokens.length) {
        window.clearInterval(timer);
      }
    }, 18);

    return () => window.clearInterval(timer);
  }, [response]);

  useEffect(() => {
    autoResizeTextarea(mainTextareaRef.current);
    autoResizeTextarea(widgetTextareaRef.current);
  }, [query, isLauncherOpen]);

  const canAsk = useMemo(() => query.trim().length > 1 && !loading, [query, loading]);

  async function onAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAsk) {
      return;
    }

    setLoading(true);
    setSubmittedQuery(query.trim());
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
    setSubmittedQuery(query.trim());
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
          <p className="eyebrow">CrawlIntel AI</p>
          <h1>CrawlIntel AI Assistant</h1>
          <p>
            Query your indexed web knowledge base with confidence. CrawlIntel AI generates responses from retrieved source chunks and includes clear citations for traceability.
          </p>
        </section>

        <section className="panel chat">
          <form onSubmit={onAsk} className="ask-form">
            <label htmlFor="question-main">Ask something</label>
            <textarea
              id="question-main"
              rows={2}
              className="query-input"
              ref={mainTextareaRef}
              value={query}
              onChange={onQueryChange}
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
              <h2>{getResponseHeading(response, submittedQuery)}</h2>
              {answerBlock?.kind === "list" ? (
                <ol className="answer-list">
                  {answerBlock.items.map((item, index) => (
                    <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
                  ))}
                </ol>
              ) : (
                <p className="answer-text">{answerBlock?.kind === "text" ? answerBlock.text : animatedAnswer}</p>
              )}

              <h3>Sources</h3>
              <ul>
                {response.sources.map((source, index) => (
                  <li key={`${source.source_url}-${index}`}>
                    <a href={source.source_url} target="_blank" rel="noreferrer">
                      {displaySourceTitle(source)}
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
            <div className="drawer-brand" aria-label="CrawlIntel branding">
              <p className="drawer-eyebrow">CrawlIntel AI</p>
            </div>

            <form onSubmit={onAsk} className="ask-form">
              <label htmlFor="question-widget">Ask something</label>
              <textarea
                id="question-widget"
                rows={2}
                className="query-input"
                ref={widgetTextareaRef}
                value={query}
                onChange={onQueryChange}
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
                <h2>{getResponseHeading(response, submittedQuery)}</h2>
                {answerBlock?.kind === "list" ? (
                  <ol className="answer-list">
                    {answerBlock.items.map((item, index) => (
                      <li key={`${index}-${item.slice(0, 16)}`}>{item}</li>
                    ))}
                  </ol>
                ) : (
                  <p className="answer-text">{answerBlock?.kind === "text" ? answerBlock.text : animatedAnswer}</p>
                )}

                <h3>Sources</h3>
                <ul>
                  {response.sources.map((source, index) => (
                    <li key={`${source.source_url}-${index}`}>
                      <a href={source.source_url} target="_blank" rel="noreferrer">
                        {displaySourceTitle(source)}
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
              aria-label={isLauncherOpen ? "Close CrawlIntel AI" : "Open CrawlIntel AI"}
              title={isLauncherOpen ? "Close CrawlIntel AI" : "Open CrawlIntel AI"}
        >
          <BotIcon />
        </button>
      </div>
    </>
  );
}
