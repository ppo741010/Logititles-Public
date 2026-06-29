import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import { analyzeViaAPI, bulkAnalyzeViaAPI, cleanPreviewViaAPI, chatViaAPI } from "../api.js";
import { supabase } from "../supabase.js";
import { trackEvent } from "../utils/analytics.js";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LabelList } from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { CROSS_FUNCTIONAL_PAIRS, EXPORT_FIELDS } from "../constants/classify.js";
import { SKILL_SYNONYMS, SKILL_DESCRIPTIONS } from "../constants/skills.js";
import { cleanTitle, classify, getSeniority, getWorkNature, getSkills, analyze } from "../utils/classify.js";
import { parseCSVLine, parseCSVText, parseXLSX, detectHeaderRow, getRawRowsCSV, detectColumns } from "../utils/parse.js";
import { isOutOfScope, getStatusLabel, buildExportRow, doDownloadCSV, doDownloadJSON, doDownloadXLSX } from "../utils/export.js";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { C, inputStyle, Spinner, Badge, Card, FieldLabel, SectionTitle, ConfidenceBar, domainTone, seniorityTone } from "../design/tokens.jsx";
import { FeedbackForm } from "../components/FeedbackForm.jsx";
import { AuthModal } from "../components/AuthModal.jsx";
import { AILoginWall } from "../components/AILoginWall.jsx";
import { AIProWall } from "../components/AIProWall.jsx";
import { ResetPasswordModal } from "../components/ResetPasswordModal.jsx";

export function PrivacyPolicy() {
  return (
    <div>
      <SectionTitle children="Privacy Policy" sub="Last updated: April 2025" />
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>

        <Card>
          <div style={{ fontSize: 14, color: C.textSub, lineHeight: 1.9 }}>
            This Privacy Policy describes how Logistics Title Mapper ("we", "the tool") handles information submitted through this website. By using this tool, you agree to the practices described below.
          </div>
        </Card>

        {[
          {
            title: "What we collect",
            items: [
              "Job titles and descriptions you submit for classification — used to improve classification accuracy. No names, emails, or personally identifying information are extracted from submitted content.",
              "Feedback you voluntarily submit (thumbs up/down, comments) — stored to help identify misclassifications.",
              "Email address, if you join the waitlist — used only to notify you when paid plans become available.",
            ],
          },
          {
            title: "What we do NOT collect",
            items: [
              "We do not collect names, contact details, or any personally identifying information from submitted job titles.",
              "We do not use cookies for tracking or advertising.",
              "We do not sell or share your data with third parties for commercial purposes.",
            ],
          },
          {
            title: "How we use submitted data",
            items: [
              "Submitted job titles and classification results (domain, confidence, status) are logged to improve classification accuracy over time. Job descriptions are not stored.",
              "We may review patterns in submitted titles to improve rules or correct misclassifications. Individual submissions are not manually reviewed in isolation.",
              "Feedback and waitlist data are stored securely in Supabase (supabase.com), hosted in the US. See Supabase's privacy policy for infrastructure details.",
              "Please avoid uploading confidential, internally sensitive, or personally identifiable data. This tool is designed for job title text only.",
            ],
          },
          {
            title: "Data retention",
            items: [
              "Job title logs are retained for classifier improvement. Descriptions are never stored. We plan to introduce automatic deletion of title logs older than 12 months.",
              "Feedback data is retained to identify classification patterns and improve accuracy.",
              "Waitlist data is retained until you request removal or until the waitlist is closed.",
              "You may request deletion of any data associated with your email address by contacting logititles@gmail.com.",
            ],
          },
          {
            title: "Your rights (NZ Privacy Act 2020)",
            items: [
              "You have the right to request access to personal information we hold about you.",
              "You have the right to request correction or deletion of your personal information.",
              "To exercise these rights, contact us at the email address below.",
            ],
          },
        ].map(({ title, items }) => (
          <Card key={title}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>{title}</div>
            {items.map(item => (
              <div key={item} style={{ display: "flex", gap: 9, marginBottom: 9, fontSize: 13, color: C.textSub, alignItems: "flex-start", lineHeight: 1.6 }}>
                <span style={{ color: C.accent, flexShrink: 0, marginTop: 2 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </Card>
        ))}

        <Card style={{ padding: "14px 20px" }}>
          <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.7 }}>
            <strong>Contact:</strong> logititles@gmail.com<br />
            <strong>Governing law:</strong> New Zealand — Privacy Act 2020<br />
            <strong>Questions?</strong> Email us and we will respond within 5 business days.
          </div>
        </Card>

      </div>
    </div>
  );
}


// ── Page 8: Terms of Service ─────────────────────────────────────────────────

