"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, FileText, Bot, User, Sparkles, AlertCircle, Quote, ChevronDown, ChevronUp, StopCircle } from "lucide-react";
import { PDFDocument } from "./DocumentUpload";
import { retrieveContext, SearchedChunk } from "@/utils/rag";
import styles from "./ChatArea.module.css";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SearchedChunk[];
  isStreaming?: boolean;
}

interface ChatAreaProps {
  activeDoc: PDFDocument | null;
  userApiKey: string | null;
}

export default function ChatArea({ activeDoc, userApiKey }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Clear messages when active document changes
  useEffect(() => {
    setMessages([]);
    setError(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, [activeDoc]);

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setLoading(false);
      
      // Mark the last message as no longer streaming
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (last.role === "assistant" && last.isStreaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, isStreaming: false, content: last.content + " [Generation Stopped]" },
          ];
        }
        return prev;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading || !activeDoc) return;

    const userQuestion = input.trim();
    setInput("");
    setError(null);
    setLoading(true);

    // Create unique ID for messages
    const userMsgId = crypto.randomUUID();
    const assistantMsgId = crypto.randomUUID();

    // 1. Add user message to history
    const newUserMessage: Message = {
      id: userMsgId,
      role: "user",
      content: userQuestion,
    };
    
    setMessages((prev) => [...prev, newUserMessage]);

    try {
      // Create headers mapping
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (userApiKey) {
        headers["x-gemini-key"] = userApiKey;
      }

      // 2. Fetch Query Embedding from server
      const embedRes = await fetch("/api/embed", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: userQuestion }),
      });

      if (!embedRes.ok) {
        const errData = await embedRes.json();
        throw new Error(errData.error || "Failed to embed search query");
      }

      const embedData = await embedRes.json();
      const queryEmbedding = embedData.embedding;

      // 3. Compute cosine similarity locally and select top chunks
      const topContextChunks = retrieveContext(queryEmbedding, activeDoc.chunks, 5);

      if (topContextChunks.length === 0) {
        throw new Error("No context could be retrieved from the active document.");
      }

      // 4. Create placeholders for the assistant response with retrieved sources
      const newAssistantMessage: Message = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        sources: topContextChunks,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, newAssistantMessage]);

      // Initialize abort controller
      abortControllerRef.current = new AbortController();

      // 5. Send context and query to `/api/chat` to stream responses
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers,
        signal: abortControllerRef.current.signal,
        body: JSON.stringify({
          question: userQuestion,
          context: topContextChunks.map((c) => ({ text: c.text, page: c.page })),
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!chatRes.ok) {
        const errData = await chatRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to start conversation");
      }

      const reader = chatRes.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Failed to initialize text stream reader.");
      }

      // 6. Read stream buffer chunk by chunk
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const textChunk = decoder.decode(value, { stream: true });
        
        setMessages((prev) => {
          return prev.map((m) => {
            if (m.id === assistantMsgId) {
              return {
                ...m,
                content: m.content + textChunk,
              };
            }
            return m;
          });
        });
      }

      // Mark streaming completed
      setMessages((prev) => {
        return prev.map((m) => {
          if (m.id === assistantMsgId) {
            return { ...m, isStreaming: false };
          }
          return m;
        });
      });

    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("Fetch aborted");
        return;
      }
      console.error(err);
      setError(err.message || "Failed to generate chat response.");
      
      // Clean up incomplete assistant message if it failed before starting stream
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Simple Markdown Formatter
  const renderMessageContent = (content: string) => {
    if (!content) return "";

    // Escape HTML to prevent XSS
    let html = content
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Code Blocks: ```code```
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline Code: `code`
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold text: **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    // Bullet Lists
    html = html.replace(/^\s*[-*]\s+(.*)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*<\/li>)/, "<ul>$1</ul>");

    // Paragraphs
    const lines = html.split("\n\n");
    const paragraphs = lines.map((line) => {
      if (line.startsWith("<pre>") || line.startsWith("<ul>") || line.startsWith("<li>")) {
        return line;
      }
      return `<p>${line.replace(/\n/g, "<br />")}</p>`;
    });

    return (
      <div
        className="prose"
        dangerouslySetInnerHTML={{ __html: paragraphs.join("") }}
      />
    );
  };

  const suggestions = [
    { text: "Provide an executive summary of this document.", label: "Summary" },
    { text: "What are the core findings or key takeaways?", label: "Key Takeaways" },
    { text: "List any specific data points or statistics mentioned.", label: "Stats & Data" },
    { text: "Are there any challenges or risks identified?", label: "Risks & Challenges" },
  ];

  return (
    <div className={`glass-panel ${styles.chatContainer}`}>
      {/* Active Document Header */}
      <div className={styles.chatHeader}>
        <div className={styles.activeDocLabel}>
          <FileText className={styles.headerIcon} size={18} />
          {activeDoc ? (
            <div className={styles.docDetails}>
              <span className={styles.docName}>{activeDoc.name}</span>
              <span className={styles.docMeta}>{activeDoc.pageCount} pages loaded</span>
            </div>
          ) : (
            <span className={styles.noDocText}>No Document Selected</span>
          )}
        </div>
      </div>

      {/* Message Viewer */}
      <div className={styles.messageViewport}>
        {!activeDoc ? (
          <div className={styles.emptyState}>
            <Bot size={48} className={styles.emptyBotIcon} />
            <h2>Welcome to DocuChat AI</h2>
            <p>Upload a PDF document in the sidebar, then select it to start querying and retrieving answers.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className={styles.emptyState}>
            <Sparkles size={36} className={styles.emptyBotIcon} />
            <h2>Ready to explore!</h2>
            <p>Ask a question about <strong>{activeDoc.name}</strong>, or choose a suggestion below:</p>

            <div className={styles.suggestionsGrid}>
              {suggestions.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(s.text)}
                  className={styles.suggestionBtn}
                >
                  <span className={styles.suggestionLabel}>{s.label}</span>
                  <span className={styles.suggestionText}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.messageList}>
            {messages.map((msg) => {
              const isAssistant = msg.role === "assistant";
              const isExpanded = expandedSources[msg.id] || false;

              return (
                <div key={msg.id} className={`${styles.messageRow} ${isAssistant ? styles.assistantRow : styles.userRow}`}>
                  <div className={styles.avatar}>
                    {isAssistant ? <Bot size={18} /> : <User size={18} />}
                  </div>
                  <div className={styles.messageBubble}>
                    <div className={styles.messageContent}>
                      {renderMessageContent(msg.content)}
                      
                      {msg.isStreaming && (
                        <span className={styles.typingIndicator}>
                          <span></span>
                          <span></span>
                          <span></span>
                        </span>
                      )}
                    </div>

                    {/* Citations Drawer */}
                    {isAssistant && msg.sources && msg.sources.length > 0 && (
                      <div className={styles.citationsContainer}>
                        <button
                          onClick={() => toggleSources(msg.id)}
                          className={styles.citationToggle}
                        >
                          <Quote size={12} />
                          <span>Show Source References ({msg.sources.length})</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {isExpanded && (
                          <div className={styles.sourcesList}>
                            {msg.sources.map((src, srcIdx) => (
                              <div key={srcIdx} className={styles.sourceCard}>
                                <div className={styles.sourceHeader}>
                                  <span className={styles.sourceBadge}>Page {src.page}</span>
                                  <span className={styles.sourceScore}>
                                    Match: {Math.round(src.similarity * 100)}%
                                  </span>
                                </div>
                                <p className={styles.sourceSnippet}>"{src.text}"</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.errorBanner}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <div className={styles.inputContainer}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={activeDoc ? `Ask about "${activeDoc.name}"...` : "Select a PDF document first"}
            disabled={!activeDoc || (loading && !abortControllerRef.current)}
            rows={1}
            className={styles.textarea}
          />

          <div className={styles.actionButtons}>
            {loading && abortControllerRef.current ? (
              <button
                type="button"
                onClick={stopGeneration}
                className={styles.stopButton}
                title="Stop generating"
              >
                <StopCircle size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!activeDoc || !input.trim() || loading}
                className={styles.sendButton}
              >
                <Send size={18} />
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
