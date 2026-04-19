import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { copyText } from "@/lib/clipboard";
import {
  deleteIncident,
  exportAllIncidentsText,
  INCIDENT_TYPES,
  incidentToWorkershieldProblem,
  incidentTypeColor,
  loadIncidents,
  LOCATIONS,
  saveIncident,
  type Incident,
  type IncidentType,
  type LocationType,
  type YesNoNotYet,
} from "@/lib/incidents";
import { useColors } from "@/hooks/useColors";

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}
function nowTime(): string {
  return new Date().toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Pill<T extends string>({
  value,
  options,
  onChange,
  colorFn,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
  colorFn?: (v: T) => string;
}) {
  const colors = useColors();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 6, paddingVertical: 2 }}
    >
      {options.map((o) => {
        const active = o === value;
        const accent = colorFn ? colorFn(o) : colors.primary;
        return (
          <Pressable
            key={o}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o);
            }}
            style={[
              styles.pill,
              {
                backgroundColor: active ? accent : "transparent",
                borderColor: active ? accent : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.pillText,
                {
                  color: active ? colors.primaryForeground : colors.mutedForeground,
                },
              ]}
            >
              {o}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function FieldLabel({ text }: { text: string }) {
  const colors = useColors();
  return (
    <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
      {text}
    </Text>
  );
}

function Section({ title }: { title: string }) {
  const colors = useColors();
  return (
    <View style={[styles.sectionRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

interface IncidentCardProps {
  incident: Incident;
  onDelete: (id: string) => void;
  onSend: (text: string) => void;
}

function IncidentCard({ incident, onDelete, onSend }: IncidentCardProps) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeColor = incidentTypeColor(incident.type);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const handleDelete = () => {
    Alert.alert(
      "Delete Incident",
      "This incident will be permanently deleted. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "DELETE",
          style: "destructive",
          onPress: () => {
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Warning,
            ).catch(() => {});
            onDelete(incident.id);
          },
        },
      ],
    );
  };

  const handleCopy = async () => {
    await copyText(incidentToWorkershieldProblem(incident));
    setCopying(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopying(false), 1600);
  };

  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.border, backgroundColor: colors.card },
      ]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((x) => !x);
        }}
        style={({ pressed }) => [
          styles.cardHeader,
          {
            backgroundColor: pressed ? colors.muted : "transparent",
            borderBottomColor: colors.border,
            borderBottomWidth: open ? 1 : 0,
          },
        ]}
      >
        <View
          style={[styles.typeDot, { backgroundColor: typeColor }]}
        />
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardType, { color: typeColor }]}>
            {incident.type.toUpperCase()}
          </Text>
          <Text style={[styles.cardMeta, { color: colors.mutedForeground }]}>
            {incident.date} · {incident.time} · {incident.location}
          </Text>
          {!open && incident.description.trim().length > 0 && (
            <Text
              style={[styles.cardPreview, { color: colors.mutedForeground }]}
              numberOfLines={1}
            >
              {incident.description.trim()}
            </Text>
          )}
        </View>
        <Text style={[styles.chevron, { color: colors.primary }]}>
          {open ? "▾" : "▸"}
        </Text>
      </Pressable>

      {open && (
        <View style={{ padding: 14 }}>
          {incident.description.trim().length > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                DESCRIPTION
              </Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {incident.description}
              </Text>
            </View>
          )}
          {incident.people.trim().length > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                PEOPLE INVOLVED
              </Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {incident.people}
              </Text>
            </View>
          )}
          {incident.witnesses.trim().length > 0 && (
            <View style={styles.detailRow}>
              <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
                WITNESSES
              </Text>
              <Text style={[styles.detailValue, { color: colors.foreground }]}>
                {incident.witnesses}
              </Text>
            </View>
          )}
          <View style={styles.statusRow}>
            <View style={styles.statusChip}>
              <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>
                MGMT NOTIFIED
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  {
                    color:
                      incident.managementNotified === "Yes"
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                {incident.managementNotified}
              </Text>
            </View>
            <View style={styles.statusChip}>
              <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>
                REPORT FILED
              </Text>
              <Text
                style={[
                  styles.statusValue,
                  {
                    color:
                      incident.reportFiled === "Yes"
                        ? colors.success
                        : colors.warning,
                  },
                ]}
              >
                {incident.reportFiled}
              </Text>
            </View>
          </View>

          <View style={[styles.cardActions, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={() => onSend(incidentToWorkershieldProblem(incident))}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  backgroundColor: pressed ? "#B88A14" : colors.primary,
                  borderColor: colors.primary,
                },
              ]}
            >
              <Text
                style={[
                  styles.actionBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                ▲ SEND TO WORKERSHIELD
              </Text>
            </Pressable>
            <View style={styles.actionRow}>
              <Pressable
                onPress={handleCopy}
                style={({ pressed }) => [
                  styles.smallBtn,
                  {
                    borderColor: copying ? colors.success : colors.border,
                    backgroundColor: copying
                      ? colors.success
                      : pressed
                        ? colors.muted
                        : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.smallBtnText,
                    {
                      color: copying
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {copying ? "✓ COPIED" : "COPY"}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.smallBtn,
                  {
                    borderColor: colors.danger,
                    backgroundColor: pressed ? colors.danger : "transparent",
                  },
                ]}
              >
                <Text
                  style={[styles.smallBtnText, { color: colors.danger }]}
                >
                  DELETE
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

interface Props {
  onSendToWorkerShield: (text: string) => void;
}

type FormView = "form" | "list";

const MGMT_OPTIONS: YesNoNotYet[] = ["Yes", "No", "Not Yet"];
const REPORT_OPTIONS: Array<"Yes" | "No"> = ["Yes", "No"];

export function IncidentLogger({ onSendToWorkerShield }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [view, setView] = useState<FormView>("list");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const exportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [date, setDate] = useState(today);
  const [time, setTime] = useState(nowTime);
  const [location, setLocation] = useState<LocationType>("Production Floor");
  const [type, setType] = useState<IncidentType>("Near Miss");
  const [people, setPeople] = useState("");
  const [description, setDescription] = useState("");
  const [witnesses, setWitnesses] = useState("");
  const [mgmtNotified, setMgmtNotified] = useState<YesNoNotYet>("Not Yet");
  const [reportFiled, setReportFiled] = useState<"Yes" | "No">("No");

  useEffect(() => {
    loadIncidents().then((data) => {
      setIncidents(data);
      setLoading(false);
    });
  }, []);

  useEffect(
    () => () => {
      if (exportTimer.current) clearTimeout(exportTimer.current);
    },
    [],
  );

  const refresh = async () => {
    const data = await loadIncidents();
    setIncidents(data);
  };

  const resetForm = () => {
    setDate(today());
    setTime(nowTime());
    setLocation("Production Floor");
    setType("Near Miss");
    setPeople("");
    setDescription("");
    setWitnesses("");
    setMgmtNotified("Not Yet");
    setReportFiled("No");
  };

  const handleSave = async () => {
    if (!description.trim()) {
      Alert.alert("Required", "Please enter a brief description.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSaving(true);
    try {
      await saveIncident({
        date,
        time,
        location,
        type,
        people,
        description,
        witnesses,
        managementNotified: mgmtNotified,
        reportFiled,
      });
      await refresh();
      resetForm();
      setView("list");
      Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteIncident(id);
    await refresh();
  };

  const handleExport = useCallback(async () => {
    Haptics.selectionAsync().catch(() => {});
    const text = exportAllIncidentsText(incidents);
    const ok = await copyText(text);
    setExportMsg(ok ? "✓ COPIED TO CLIPBOARD" : "Copy failed");
    if (exportTimer.current) clearTimeout(exportTimer.current);
    exportTimer.current = setTimeout(() => setExportMsg(null), 2000);
  }, [incidents]);

  const handleSend = useCallback(
    (text: string) => {
      onSendToWorkerShield(text);
    },
    [onSendToWorkerShield],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: insets.top + 4,
          },
        ]}
      >
        <Text style={[styles.topTitle, { color: colors.foreground }]}>
          INCIDENT LOG
        </Text>
        <View style={styles.topToggle}>
          {(["list", "form"] as FormView[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setView(v);
              }}
              style={[
                styles.topToggleBtn,
                {
                  backgroundColor:
                    view === v ? colors.primary : "transparent",
                  borderColor: view === v ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.topToggleText,
                  {
                    color:
                      view === v ? colors.primaryForeground : colors.mutedForeground,
                  },
                ]}
              >
                {v === "form" ? "+ LOG" : "LIST"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {view === "form" ? (
        <ScrollView
          contentContainerStyle={{
            padding: 18,
            paddingBottom: insets.bottom + 100,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Section title="QUICK CAPTURE — LOG INCIDENT" />

          <View style={styles.field}>
            <FieldLabel text="DATE" />
            <TextInput
              value={date}
              onChangeText={setDate}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholderTextColor={colors.mutedForeground}
              placeholder="YYYY-MM-DD"
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="TIME" />
            <TextInput
              value={time}
              onChangeText={setTime}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholderTextColor={colors.mutedForeground}
              placeholder="HH:MM"
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="LOCATION" />
            <Pill
              value={location}
              options={LOCATIONS}
              onChange={setLocation}
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="INCIDENT TYPE" />
            <Pill
              value={type}
              options={INCIDENT_TYPES}
              onChange={setType}
              colorFn={incidentTypeColor}
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="PEOPLE INVOLVED (names optional)" />
            <TextInput
              value={people}
              onChangeText={setPeople}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholderTextColor={colors.mutedForeground}
              placeholder='Names or "anonymous"'
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="BRIEF DESCRIPTION *" />
            <TextInput
              value={description}
              onChangeText={setDescription}
              style={[
                styles.textarea,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholderTextColor={colors.mutedForeground}
              placeholder="What happened? Be specific — date, time, what was said or done."
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="WITNESSES (optional)" />
            <TextInput
              value={witnesses}
              onChangeText={setWitnesses}
              style={[
                styles.input,
                {
                  color: colors.foreground,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
              placeholderTextColor={colors.mutedForeground}
              placeholder='Names or "anonymous"'
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="MANAGEMENT NOTIFIED?" />
            <Pill
              value={mgmtNotified}
              options={MGMT_OPTIONS}
              onChange={setMgmtNotified}
            />
          </View>

          <View style={styles.field}>
            <FieldLabel text="FORMAL REPORT FILED?" />
            <Pill
              value={reportFiled}
              options={REPORT_OPTIONS}
              onChange={setReportFiled}
            />
          </View>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              {
                backgroundColor: saving
                  ? colors.muted
                  : pressed
                    ? "#B88A14"
                    : colors.primary,
                borderColor: saving ? colors.border : colors.primary,
              },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text
                style={[styles.saveBtnText, { color: colors.primaryForeground }]}
              >
                ▲ SAVE INCIDENT
              </Text>
            )}
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {loading ? (
            <ActivityIndicator
              color={colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : incidents.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                NO INCIDENTS LOGGED
              </Text>
              <Text
                style={[styles.emptyText, { color: colors.mutedForeground }]}
              >
                Tap + LOG to record your first incident.
              </Text>
              <Pressable
                onPress={() => setView("form")}
                style={({ pressed }) => [
                  styles.emptyBtn,
                  {
                    backgroundColor: pressed ? "#B88A14" : colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.emptyBtnText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  + LOG FIRST INCIDENT
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.listHeader}>
                <Text
                  style={[styles.listCount, { color: colors.mutedForeground }]}
                >
                  {incidents.length} INCIDENT{incidents.length !== 1 ? "S" : ""}
                </Text>
                <Pressable
                  onPress={handleExport}
                  style={({ pressed }) => [
                    styles.exportBtn,
                    {
                      borderColor: colors.primary,
                      backgroundColor: pressed ? colors.card : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={[styles.exportBtnText, { color: colors.primary }]}
                  >
                    {exportMsg ?? "EXPORT ALL"}
                  </Text>
                </Pressable>
              </View>
              {incidents.map((i) => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  onDelete={handleDelete}
                  onSend={handleSend}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  topTitle: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  topToggle: { flexDirection: "row", gap: 8 },
  topToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderRadius: 3,
  },
  topToggleText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.4,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  sectionBar: { width: 3, height: 14 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
  },
  field: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    minHeight: 90,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.4,
  },
  saveBtn: {
    paddingVertical: 18,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: "center",
    marginTop: 6,
  },
  saveBtnText: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 4,
    marginBottom: 12,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    gap: 10,
  },
  typeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  cardType: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.4,
  },
  cardMeta: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  cardPreview: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 3,
  },
  chevron: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
  },
  detailRow: { marginBottom: 10 },
  detailLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
    marginBottom: 3,
  },
  detailValue: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  statusRow: { flexDirection: "row", gap: 16, marginBottom: 14 },
  statusChip: {},
  statusLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  statusValue: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 0.6,
  },
  cardActions: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 12,
    borderRadius: 4,
    alignItems: "center",
    borderWidth: 1.5,
  },
  actionBtnText: {
    fontSize: 11,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.6,
  },
  actionRow: { flexDirection: "row", gap: 8 },
  smallBtn: {
    flex: 1,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 3,
    alignItems: "center",
  },
  smallBtnText: {
    fontSize: 9,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.2,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  listCount: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
  },
  exportBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderRadius: 3,
  },
  exportBtnText: {
    fontSize: 9,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.2,
  },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTitle: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyBtn: {
    marginTop: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 4,
  },
  emptyBtnText: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.6,
  },
});
