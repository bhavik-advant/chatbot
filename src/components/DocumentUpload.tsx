"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, FileText, Trash2, CheckCircle2, AlertCircle, FileDigit } from "lucide-react";
import styles from "./DocumentUpload.module.css";

export interface PDFDocument {
  id: string;
  name: string;
  pageCount: number;
  size: string;
  uploadedAt: string;
  chunks: { text: string; page: number; embedding: number[] }[];
}

interface DocumentUploadProps {
  documents: PDFDocument[];
  onDocumentsChange: (docs: PDFDocument[]) => void;
  activeDocId: string | null;
  onActiveDocChange: (id: string | null) => void;
  userApiKey: string | null;
}

export default function DocumentUpload({
  documents,
  onDocumentsChange,
  activeDocId,
  onActiveDocChange,
  userApiKey,
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      setError("Please upload a valid PDF document.");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep("Reading file...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      setLoadingStep("Parsing pages and extracting text...");
      
      const headers: Record<string, string> = {};
      if (userApiKey) {
        headers["x-gemini-key"] = userApiKey;
      }

      const res = await fetch("/api/parse", {
        method: "POST",
        body: formData,
        headers,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to parse PDF");
      }

      const data = await res.json();
      const parsedChunks: { text: string; page: number }[] = data.chunks || [];

      setLoadingStep(`Generating vector embeddings (0/${parsedChunks.length})...`);

      const chunksWithEmbeddings = [];
      const batchSize = 25;

      for (let i = 0; i < parsedChunks.length; i += batchSize) {
        const batch = parsedChunks.slice(i, i + batchSize);
        const batchTexts = batch.map(c => c.text);
        
        let success = false;
        let retries = 5;
        let delayMs = 3000;
        let batchEmbeddings: number[][] = [];

        while (!success) {
          try {
            const embedRes = await fetch("/api/embed", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...headers
              },
              body: JSON.stringify({ texts: batchTexts })
            });

            if (!embedRes.ok) {
              const err = await embedRes.json();
              const isRateLimit = embedRes.status === 429 || 
                                  err.error?.toLowerCase().includes("quota") || 
                                  err.error?.toLowerCase().includes("rate limit") ||
                                  err.error?.toLowerCase().includes("too many requests");
              
              if (isRateLimit && retries > 0) {
                setLoadingStep(`Rate limit hit. Retrying in ${Math.round(delayMs / 1000)}s...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                retries--;
                delayMs *= 2;
                continue;
              }
              throw new Error(err.error || "Failed to generate embeddings");
            }

            const embedData = await embedRes.json();
            batchEmbeddings = embedData.embeddings;
            success = true;
          } catch (err: any) {
            if (retries > 0) {
              console.warn("Embedding batch failed, retrying...", err);
              setLoadingStep(`Temporary issue. Retrying in ${Math.round(delayMs / 1000)}s...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));
              retries--;
              delayMs *= 2;
            } else {
              throw err;
            }
          }
        }

        for (let j = 0; j < batch.length; j++) {
          chunksWithEmbeddings.push({
            ...batch[j],
            embedding: batchEmbeddings[j]
          });
        }

        if (i + batchSize < parsedChunks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        setLoadingStep(`Generating vector embeddings (${Math.min(i + batchSize, parsedChunks.length)}/${parsedChunks.length})...`);
      }

      const newDoc: PDFDocument = {
        id: crypto.randomUUID(),
        name: data.filename || file.name,
        pageCount: data.pageCount,
        size: formatBytes(file.size),
        uploadedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        chunks: chunksWithEmbeddings,
      };

      const updatedDocs = [...documents, newDoc];
      onDocumentsChange(updatedDocs);
      onActiveDocChange(newDoc.id);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong during parsing.");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = documents.filter((doc) => doc.id !== id);
    onDocumentsChange(updated);
    if (activeDocId === id) {
      onActiveDocChange(updated.length > 0 ? updated[0].id : null);
    }
  };

  const formatBytes = (bytes: number, decimals = 1) => {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  return (
    <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className={styles.header}>
        <UploadCloud className={styles.headerIcon} size={20} />
        <h2>PDF Documents</h2>
      </div>

      {/* Drag and Drop Zone */}
      <div
        className={`${styles.dropZone} ${dragActive ? styles.dragActive : ""} ${loading ? styles.disabled : ""}`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={loading ? undefined : onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className={styles.fileInput}
          accept=".pdf"
          onChange={handleChange}
          disabled={loading}
        />

        {loading ? (
          <div className={styles.loaderContainer}>
            <div className={styles.spinner}></div>
            <p className={styles.loadingStep}>{loadingStep}</p>
          </div>
        ) : (
          <div className={styles.promptContainer}>
            <UploadCloud size={32} className={styles.uploadIcon} />
            <p className={styles.mainPrompt}>Drag & drop PDF here or click to browse</p>
            <p className={styles.subPrompt}>Supports files up to 20MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Uploaded Documents List */}
      {documents.length > 0 && (
        <div className={styles.docListContainer}>
          <h3 className={styles.listTitle}>Uploaded Files</h3>
          <div className={styles.list}>
            {documents.map((doc) => {
              const isActive = doc.id === activeDocId;
              return (
                <div
                  key={doc.id}
                  className={`${styles.docCard} ${isActive ? styles.activeCard : ""}`}
                  onClick={() => onActiveDocChange(doc.id)}
                >
                  <FileText className={styles.docIcon} size={20} />
                  <div className={styles.docInfo}>
                    <span className={styles.docName} title={doc.name}>
                      {doc.name}
                    </span>
                    <span className={styles.docMeta}>
                      {doc.pageCount} pages • {doc.size}
                    </span>
                  </div>
                  <button
                    className={styles.deleteButton}
                    onClick={(e) => handleDelete(doc.id, e)}
                    title="Delete document"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
