"use client";

import React, { useState, useEffect } from "react";
import { MessageSquare, ExternalLink, HelpCircle } from "lucide-react";
import SettingsPanel from "@/components/SettingsPanel";
import DocumentUpload, { PDFDocument } from "@/components/DocumentUpload";
import ChatArea from "@/components/ChatArea";
import styles from "./page.module.css";

export default function Home() {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [userApiKey, setUserApiKey] = useState<string | null>(null);

  // Load saved API Key on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const key = localStorage.getItem("gemini_api_key");
      if (key) {
        setUserApiKey(key);
      }
    }
  }, []);

  const handleApiKeyChange = (key: string | null) => {
    setUserApiKey(key);
  };

  const activeDoc = documents.find((doc) => doc.id === activeDocId) || null;

  return (
    <div className={styles.appContainer}>
      {/* Global Header */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandIconWrapper}>
            <MessageSquare className={styles.brandIcon} size={22} />
          </div>
          <h1>
            DocuChat <span>AI</span>
          </h1>
        </div>

        <div className={styles.headerActions}>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.headerLink}
            title="GitHub Repository"
          >
            <ExternalLink size={20} />
          </a>
          <a
            href="https://ai.google.dev"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.headerLink}
            title="Gemini Developer Portal"
          >
            <HelpCircle size={20} />
          </a>
        </div>
      </header>

      {/* Workspace Dashboard Layout */}
      <main className={styles.dashboard}>
        {/* Sidebar: Config + Upload */}
        <section className={styles.sidebar}>
          <SettingsPanel onApiKeyChange={handleApiKeyChange} userApiKey={userApiKey} />
          <DocumentUpload
            documents={documents}
            onDocumentsChange={setDocuments}
            activeDocId={activeDocId}
            onActiveDocChange={setActiveDocId}
            userApiKey={userApiKey}
          />
        </section>

        {/* Chat Area Viewport */}
        <section className={styles.mainView}>
          <ChatArea activeDoc={activeDoc} userApiKey={userApiKey} />
        </section>
      </main>
    </div>
  );
}
