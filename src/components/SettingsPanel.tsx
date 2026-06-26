"use client";

import React, { useState, useEffect } from "react";
import { Key, CheckCircle2, AlertTriangle, Eye, EyeOff, Info } from "lucide-react";
import styles from "./SettingsPanel.module.css";

interface SettingsPanelProps {
  onApiKeyChange: (key: string | null) => void;
  userApiKey: string | null;
}

export default function SettingsPanel({ onApiKeyChange, userApiKey }: SettingsPanelProps) {
  const [hasServerKey, setHasServerKey] = useState<boolean | null>(null);
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the server has a preconfigured API Key
    async function checkServerConfig() {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        setHasServerKey(!!data.hasServerKey);
      } catch (err) {
        console.error("Failed to fetch API key config:", err);
        setHasServerKey(false);
      } finally {
        setLoading(false);
      }
    }
    checkServerConfig();

    // Load user key if exists
    if (userApiKey) {
      setInputKey(userApiKey);
    }
  }, [userApiKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (trimmed) {
      localStorage.setItem("gemini_api_key", trimmed);
      onApiKeyChange(trimmed);
    } else {
      localStorage.removeItem("gemini_api_key");
      onApiKeyChange(null);
    }
  };

  const handleClear = () => {
    setInputKey("");
    localStorage.removeItem("gemini_api_key");
    onApiKeyChange(null);
  };

  return (
    <div className="glass-panel" style={{ padding: "1.5rem" }}>
      <div className={styles.header}>
        <Key className={styles.icon} size={20} />
        <h2>API Configuration</h2>
      </div>

      {loading ? (
        <div className={styles.statusLoader}>
          <div className="shimmer-bg" style={{ height: "30px", borderRadius: "6px", width: "100%" }}></div>
        </div>
      ) : (
        <div className={styles.content}>
          {hasServerKey ? (
            <div className={`${styles.statusBadge} ${styles.success}`}>
              <CheckCircle2 size={16} />
              <span>Developer API Key Active (Server Mode)</span>
            </div>
          ) : (
            <div className={`${styles.statusBadge} ${styles.warning}`}>
              <AlertTriangle size={16} />
              <span>Custom API Key Required</span>
            </div>
          )}

          {!hasServerKey && (
            <form onSubmit={handleSave} className={styles.form}>
              <p className={styles.helpText}>
                No server key was found. Please enter your Gemini API Key. It will be stored safely in your browser.
              </p>
              
              <div className={styles.inputWrapper}>
                <input
                  type={showKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className={styles.input}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className={styles.eyeButton}
                  title={showKey ? "Hide API Key" : "Show API Key"}
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className={styles.buttonGroup}>
                <button type="submit" className={styles.saveButton} disabled={!inputKey.trim()}>
                  Save Key
                </button>
                {userApiKey && (
                  <button type="button" onClick={handleClear} className={styles.clearButton}>
                    Clear Key
                  </button>
                )}
              </div>
            </form>
          )}

          {hasServerKey && (
            <div className={styles.serverInfo}>
              <Info size={14} />
              <p>
                The developer has set up a global API Key. You are ready to upload PDFs and chat immediately! If you want to use a personal override, you can set it locally.
              </p>
              
              {/* Optional override input */}
              <details className={styles.overrideDetails}>
                <summary className={styles.overrideSummary}>Set custom API key override</summary>
                <form onSubmit={handleSave} className={styles.overrideForm}>
                  <div className={styles.inputWrapper}>
                    <input
                      type={showKey ? "text" : "password"}
                      placeholder="AIzaSy..."
                      value={inputKey}
                      onChange={(e) => setInputKey(e.target.value)}
                      className={styles.input}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      className={styles.eyeButton}
                    >
                      {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className={styles.buttonGroup}>
                    <button type="submit" className={styles.saveButton} disabled={!inputKey.trim()}>
                      Apply Override
                    </button>
                    {userApiKey && (
                      <button type="button" onClick={handleClear} className={styles.clearButton}>
                        Remove Override
                      </button>
                    )}
                  </div>
                </form>
              </details>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
