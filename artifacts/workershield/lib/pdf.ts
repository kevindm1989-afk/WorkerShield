import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;

  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  const inline = (text: string) =>
    escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h1 = /^#\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    const bullet = /^[-*+]\s+(.*)$/.exec(line);
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (h1) {
      closeList();
      out.push(`<h1>${inline(h1[1] ?? "")}</h1>`);
    } else if (h2) {
      closeList();
      out.push(`<h2>${inline(h2[1] ?? "")}</h2>`);
    } else if (h3) {
      closeList();
      out.push(`<h3>${inline(h3[1] ?? "")}</h3>`);
    } else if (bullet) {
      if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; }
      out.push(`<li>${inline(bullet[1] ?? "")}</li>`);
    } else if (ordered) {
      if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; }
      out.push(`<li>${inline(ordered[2] ?? "")}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("\n");
}

export interface AgentOutput {
  label: string;
  output: string;
}

export interface PdfArgs {
  local: string;
  employer: string;
  role: string;
  problem: string;
  finalMarkdown: string;
  agentOutputs?: AgentOutput[];
}

function buildHtml(args: PdfArgs): string {
  const date = new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = new Date().toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const agentSections = (args.agentOutputs ?? [])
    .filter((a) => a.output?.trim())
    .map(
      (a) => `
      <div class="agent-section">
        <div class="agent-label">AGENT: ${escapeHtml(a.label.toUpperCase())}</div>
        ${markdownToHtml(a.output)}
      </div>`,
    )
    .join("\n");

  return `<!doctype html><html><head><meta charset="utf-8"><title>WorkerShield Report</title>
<style>
  @page { margin: 0.6in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #0B0F14; font-size: 11pt; line-height: 1.45; margin: 0; }
  .header { border-bottom: 3px solid #D4A017; padding-bottom: 14px; margin-bottom: 18px; }
  .brand { font-size: 22pt; font-weight: 800; letter-spacing: 2pt; margin: 0; }
  .confidential { font-size: 9pt; letter-spacing: 1.4pt; color: #8A6B0E; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
  .tagline { font-size: 8pt; letter-spacing: 1.4pt; color: #57606D; text-transform: uppercase; }
  .meta { margin: 14px 0 22px; padding: 12px 14px; background: #F4F6F9; border-left: 3px solid #D4A017; font-size: 9.5pt; }
  .meta div { margin: 2px 0; }
  .meta strong { display: inline-block; min-width: 90px; color: #57606D; font-weight: 600; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.8pt; }
  .problem-block { margin-bottom: 22px; }
  .problem-label { font-size: 9pt; font-weight: 700; letter-spacing: 1.4pt; color: #57606D; text-transform: uppercase; margin-bottom: 6px; }
  .problem-text { white-space: pre-wrap; padding: 10px 12px; border: 1px solid #D6DBE2; border-radius: 3px; background: #FAFBFC; }
  .agent-section { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #E8ECF1; page-break-inside: avoid; }
  .agent-label { font-size: 8pt; font-weight: 700; letter-spacing: 1.8pt; color: #57606D; text-transform: uppercase; margin-bottom: 8px; background: #F4F6F9; padding: 4px 8px; display: inline-block; }
  .final-section { margin-top: 28px; padding: 16px; border: 2px solid #D4A017; border-radius: 3px; background: #FFFBF0; }
  .final-label { font-size: 11pt; font-weight: 800; letter-spacing: 2pt; color: #8A6B0E; text-transform: uppercase; margin-bottom: 12px; border-bottom: 1px solid #D4A017; padding-bottom: 8px; }
  h1 { font-size: 14pt; margin: 18px 0 8px; letter-spacing: 0.5pt; text-transform: uppercase; border-bottom: 1px solid #D6DBE2; padding-bottom: 4px; }
  h2 { font-size: 12pt; margin: 16px 0 6px; letter-spacing: 1pt; text-transform: uppercase; color: #0B0F14; border-left: 3px solid #D4A017; padding-left: 8px; }
  h3 { font-size: 10pt; margin: 12px 0 4px; letter-spacing: 1.2pt; text-transform: uppercase; color: #8A6B0E; }
  p { margin: 4px 0; }
  ul, ol { margin: 4px 0 8px 22px; padding: 0; }
  li { margin: 2px 0; }
  strong { font-weight: 700; }
  code { font-family: "SFMono-Regular", Consolas, monospace; font-size: 9.5pt; background: #F4F6F9; padding: 1px 4px; border-radius: 2px; }
  .reprisal { margin-top: 18px; padding: 10px 12px; border: 1px solid #D4A017; background: #FFF8E5; font-size: 9.5pt; }
  .reprisal strong { color: #8A6B0E; }
  .footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #D6DBE2; font-size: 8pt; color: #8A95A5; text-align: center; letter-spacing: 0.6pt; }
</style></head><body>
  <div class="header">
    <div class="brand">WORKERSHIELD</div>
    <div class="confidential">CONFIDENTIAL — UNION DOCUMENT</div>
    <div class="tagline">Ontario Labour Defense · Generated ${date} at ${time}</div>
  </div>
  <div class="meta">
    <div><strong>Local:</strong> ${escapeHtml(args.local || "—")}</div>
    <div><strong>Employer:</strong> ${escapeHtml(args.employer || "—")}</div>
    <div><strong>Role:</strong> ${escapeHtml(args.role || "—")}</div>
  </div>
  <div class="problem-block">
    <div class="problem-label">Problem Reported</div>
    <div class="problem-text">${escapeHtml(args.problem || "—")}</div>
  </div>
  ${agentSections ? `<h1>Agent Analysis</h1>\n${agentSections}` : ""}
  <div class="final-section">
    <div class="final-label">★ WorkerShield Final Response</div>
    ${markdownToHtml(args.finalMarkdown)}
  </div>
  <div class="reprisal">
    <strong>REPRISAL PROTECTION:</strong> Filing a complaint, asking about a right under the OHSA, ESA, OHRC, or CBA, or participating in an investigation is legally protected. Reprisal is prohibited under OHSA s.50, ESA Part XVIII, and OHRC s.8. Document any retaliatory conduct immediately.
  </div>
  <div class="footer">Generated by WorkerShield · This is an AI-generated analysis · Verify with your union representative before taking action · For union use only</div>
</body></html>`;
}

export async function exportFinalAsPdf(args: PdfArgs): Promise<void> {
  const html = buildHtml(args);

  if (Platform.OS === "web") {
    const win = window.open("", "_blank");
    if (!win) {
      throw new Error("Pop-up blocked. Allow pop-ups to download the PDF.");
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        /* user can manually print */
      }
    }, 350);
    return;
  }

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: "WorkerShield Report",
      UTI: "com.adobe.pdf",
    });
  }
}
