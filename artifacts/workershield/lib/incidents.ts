import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "ws_incidents";

export type IncidentType =
  | "Near Miss"
  | "Injury"
  | "Equipment Issue"
  | "Safety Violation"
  | "Harassment"
  | "Discipline"
  | "Grievance"
  | "Other";

export type LocationType =
  | "Shipping Dock"
  | "Receiving Dock"
  | "Pick Line"
  | "Cold Storage"
  | "Production Floor"
  | "Other";

export type YesNoNotYet = "Yes" | "No" | "Not Yet";

export interface Incident {
  id: string;
  createdAt: number;
  date: string;
  time: string;
  location: LocationType;
  type: IncidentType;
  people: string;
  description: string;
  witnesses: string;
  managementNotified: YesNoNotYet;
  reportFiled: "Yes" | "No";
}

export const LOCATIONS: LocationType[] = [
  "Shipping Dock",
  "Receiving Dock",
  "Pick Line",
  "Cold Storage",
  "Production Floor",
  "Other",
];

export const INCIDENT_TYPES: IncidentType[] = [
  "Near Miss",
  "Injury",
  "Equipment Issue",
  "Safety Violation",
  "Harassment",
  "Discipline",
  "Grievance",
  "Other",
];

export function incidentTypeColor(type: IncidentType): string {
  switch (type) {
    case "Near Miss":
      return "#F5A623";
    case "Injury":
      return "#E5484D";
    case "Equipment Issue":
      return "#E8830A";
    case "Safety Violation":
      return "#E5484D";
    case "Harassment":
      return "#C751C0";
    case "Discipline":
      return "#D4A017";
    case "Grievance":
      return "#D4A017";
    default:
      return "#4A90D9";
  }
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function loadIncidents(): Promise<Incident[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Incident[];
  } catch {
    return [];
  }
}

export async function saveIncident(
  incident: Omit<Incident, "id" | "createdAt">,
): Promise<Incident> {
  const all = await loadIncidents();
  const newIncident: Incident = {
    ...incident,
    id: uid(),
    createdAt: Date.now(),
  };
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([newIncident, ...all]),
  );
  return newIncident;
}

export async function deleteIncident(id: string): Promise<void> {
  const all = await loadIncidents();
  const updated = all.filter((i) => i.id !== id);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function incidentToWorkershieldProblem(i: Incident): string {
  const parts: string[] = [];
  parts.push(
    `Incident Date/Time: ${i.date} at ${i.time}`,
  );
  parts.push(`Location: ${i.location}`);
  parts.push(`Incident Type: ${i.type}`);
  if (i.description.trim()) parts.push(`Description: ${i.description.trim()}`);
  if (i.people.trim()) parts.push(`People Involved: ${i.people.trim()}`);
  if (i.witnesses.trim()) parts.push(`Witnesses: ${i.witnesses.trim()}`);
  parts.push(`Management Notified: ${i.managementNotified}`);
  parts.push(`Formal Report Filed: ${i.reportFiled}`);
  return parts.join("\n");
}

export function formatIncidentForExport(i: Incident, idx: number): string {
  return [
    `INCIDENT #${String(idx + 1).padStart(3, "0")} (ID: ${i.id})`,
    `Date/Time: ${i.date} ${i.time}`,
    `Location: ${i.location}`,
    `Type: ${i.type}`,
    `Description: ${i.description}`,
    `People Involved: ${i.people || "—"}`,
    `Witnesses: ${i.witnesses || "—"}`,
    `Management Notified: ${i.managementNotified}`,
    `Report Filed: ${i.reportFiled}`,
    "---",
  ].join("\n");
}

export function exportAllIncidentsText(incidents: Incident[]): string {
  const date = new Date().toLocaleDateString("en-CA");
  const header = [
    "WORKPLACE INCIDENT LOG",
    "Unifor Local 1285 — Saputo Dairy Products Canada G.P.",
    `Generated: ${date}`,
    "CONFIDENTIAL — UNION DOCUMENT",
    "",
  ].join("\n");
  if (incidents.length === 0) return header + "No incidents logged.";
  return (
    header +
    incidents.map((i, idx) => formatIncidentForExport(i, idx)).join("\n\n")
  );
}
