"use client";

import { FileEdit, MessageSquare } from "lucide-react";
import type { ConfluenceDoc, ConfluenceActivity } from "../../../lib/types";

interface ConfluenceSectionProps {
  docs: ConfluenceDoc[];
  activity: ConfluenceActivity[];
}

export function ConfluenceSection({ docs, activity }: ConfluenceSectionProps) {
  const totalEdits = docs.reduce((sum, d) => sum + d.edits, 0);
  const maxEdits = Math.max(...docs.map((d) => d.edits), 1);

  return (
    <div>
      <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-3">
        Knowledge Influence
      </div>
      <div className="text-xs font-label text-[var(--primary)] mb-4">
        {docs.length} page{docs.length !== 1 ? "s" : ""} &middot; {totalEdits} total edits
      </div>

      {docs.length === 0 ? (
        <p className="text-xs text-[var(--on-surface-variant)] mb-5">No Confluence activity found.</p>
      ) : (
      <div className="flex flex-col gap-3 mb-5">
        {docs.map((doc) => (
          <div key={doc.title}>
            <div className="flex items-center justify-between mb-1">
              <span
                className={`text-sm text-[var(--on-surface)] leading-snug ${doc.url ? "cursor-pointer hover:text-[var(--primary)] hover:underline transition-colors" : ""}`}
                onClick={() => doc.url && window.open(doc.url)}
              >{doc.title}</span>
              <span className="text-xs font-label text-[var(--on-surface-variant)] shrink-0 ml-2">
                {doc.reads > 0
                  ? `${doc.reads >= 1000 ? `${(doc.reads / 1000).toFixed(1)}k` : doc.reads} Reads • `
                  : ""}{doc.edits} Edit{doc.edits !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="h-1 bg-[var(--surface-container-highest)] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-container)] rounded-full"
                style={{ width: `${(doc.edits / maxEdits) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      )}

      <div className="border-t border-[var(--outline-variant)]/20 pt-4">
        <div className="text-xs font-label text-[var(--on-surface-variant)] uppercase tracking-wider mb-3">
          Recent Updates
        </div>
        <div className="flex flex-col gap-2">
          {activity.map((item, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 ${item.url ? "cursor-pointer hover:opacity-70 transition-opacity" : ""}`}
              onClick={() => item.url && window.open(item.url)}
            >
              <div className="w-6 h-6 rounded-md bg-[var(--surface-container-highest)] flex items-center justify-center shrink-0">
                {item.type === "edit" ? (
                  <FileEdit size={12} className="text-[var(--primary)]" />
                ) : (
                  <MessageSquare size={12} className="text-[var(--secondary)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-[var(--on-surface)]">{item.description}</span>
              </div>
              <span className="text-xs font-label text-[var(--on-surface-variant)] shrink-0">
                {item.timeAgo}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
