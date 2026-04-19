import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { AgentChip } from "@/components/AgentChip";
import { Markdown } from "@/components/Markdown";
import {
  runAgentPipeline,
  type AgentState,
  type PipelineController,
} from "@/lib/agentClient";
import {
  isVoiceDictationAvailable,
  startVoiceDictation,
  type VoiceSession,
} from "@/lib/voice";
import { exportFinalAsPdf } from "@/lib/pdf";
import { copyFullReport } from "@/lib/clipboard";
import { CopyButton } from "@/components/CopyButton";
import {
  Onboarding,
  OnboardingLoader,
  useOnboarding,
} from "@/components/Onboarding";
import { IncidentLogger } from "@/components/IncidentLogger";
import { InstallBanner } from "@/components/InstallBanner";

type AppTab = "main" | "incidents";

type Role = "Both Roles" | "Steward" | "JHSC";

const ROLES: Role[] = ["Both Roles", "Steward", "JHSC"];

export default function HomeScreen() {
  const onboarding = useOnboarding();
  if (onboarding.status === "loading") return <OnboardingLoader />;
  if (onboarding.status === "needed")
    return <Onboarding onDone={onboarding.markDone} />;
  return <AppShell />;
}

function AppShell() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<AppTab>("main");
  const [prefillProblem, setPrefillProblem] = useState<string | null>(null);

  const handleSendToWorkerShield = useCallback((text: string) => {
    setPrefillProblem(text);
    setTab("main");
  }, []);

  const TAB_BAR_H = 56 + insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <InstallBanner />
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1, display: tab === "main" ? "flex" : "none" }}>
          <Main
            prefillProblem={prefillProblem}
            onPrefillConsumed={() => setPrefillProblem(null)}
            extraBottomPad={TAB_BAR_H}
          />
        </View>
        <View
          style={{ flex: 1, display: tab === "incidents" ? "flex" : "none" }}
        >
          <IncidentLogger onSendToWorkerShield={handleSendToWorkerShield} />
        </View>
      </View>
      <View
        style={[
          tabBarStyles.bar,
          {
            height: TAB_BAR_H,
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {(["main", "incidents"] as AppTab[]).map((t) => {
          const active = tab === t;
          const label = t === "main" ? "AI ANALYSIS" : "INCIDENT LOG";
          const icon = t === "main" ? "⚡" : "📋";
          return (
            <Pressable
              key={t}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setTab(t);
              }}
              style={({ pressed }) => [
                tabBarStyles.tabBtn,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text
                style={[
                  tabBarStyles.tabIcon,
                  { color: active ? colors.primary : colors.mutedForeground },
                ]}
              >
                {icon}
              </Text>
              <Text
                style={[
                  tabBarStyles.tabLabel,
                  { color: active ? colors.primary : colors.mutedForeground },
                ]}
              >
                {label}
              </Text>
              {active && (
                <View
                  style={[
                    tabBarStyles.tabIndicator,
                    { backgroundColor: colors.primary },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const tabBarStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    position: "relative",
  },
  tabIcon: {
    fontSize: 20,
  },
  tabLabel: {
    fontSize: 8,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1,
  },
  tabIndicator: {
    position: "absolute",
    top: 0,
    left: 16,
    right: 16,
    height: 2,
    borderRadius: 1,
  },
});

interface MainProps {
  prefillProblem?: string | null;
  onPrefillConsumed?: () => void;
  extraBottomPad?: number;
}

function Main({ prefillProblem, onPrefillConsumed, extraBottomPad = 0 }: MainProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [local, setLocal] = useState("Unifor Local 1285");
  const [employer, setEmployer] = useState("Saputo Dairy Products Canada G.P.");
  const [role, setRole] = useState<Role>("Both Roles");
  const [caseHistory, setCaseHistory] = useState("");
  const [keyPeople, setKeyPeople] = useState("");
  const [problem, setProblem] = useState("");

  const [running, setRunning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [finalOut, setFinalOut] = useState<string | null>(null);

  const [listening, setListening] = useState(false);
  const [voiceAvailable] = useState(() => isVoiceDictationAvailable());
  const voiceSessionRef = useRef<VoiceSession | null>(null);
  const baseProblemRef = useRef("");

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [copyingFull, setCopyingFull] = useState(false);
  const copyFullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pipelineRef = useRef<PipelineController | null>(null);
  const runIdRef = useRef(0);
  const finalArrivedRef = useRef(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(
    () => () => {
      if (copyFullTimerRef.current) clearTimeout(copyFullTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (prefillProblem) {
      setProblem(prefillProblem);
      onPrefillConsumed?.();
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [prefillProblem]);

  useEffect(
    () => () => {
      pipelineRef.current?.abort();
    },
    [],
  );

  const toggleExpand = useCallback((key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(
    () => () => {
      voiceSessionRef.current?.stop();
    },
    [],
  );

  const stopVoice = useCallback(() => {
    voiceSessionRef.current?.stop();
    voiceSessionRef.current = null;
    setListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (listening) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      stopVoice();
      return;
    }
    if (!voiceAvailable) {
      setErrorMsg(
        "Voice input is not supported on this device. Try Chrome or Safari on a phone.",
      );
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    baseProblemRef.current = problem ? problem.replace(/\s+$/, "") + " " : "";
    const session = startVoiceDictation({
      onPartial: (text) => {
        setProblem(baseProblemRef.current + text);
      },
      onFinal: (text) => {
        baseProblemRef.current = baseProblemRef.current + text + " ";
        setProblem(baseProblemRef.current);
      },
      onError: (msg) => {
        setErrorMsg(msg);
        stopVoice();
      },
      onEnd: () => {
        setListening(false);
        voiceSessionRef.current = null;
      },
    });
    if (session) {
      voiceSessionRef.current = session;
      setListening(true);
    }
  }, [listening, voiceAvailable, problem, stopVoice]);

  const handleExportPdf = useCallback(async () => {
    if (!finalOut || exporting) return;
    setExportError(null);
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await exportFinalAsPdf({
        local,
        employer,
        role,
        problem,
        finalMarkdown: finalOut,
        agentOutputs: agents
          .filter((a) => a.output)
          .map((a) => ({ label: a.label, output: a.output ?? "" })),
      });
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [finalOut, exporting, local, employer, role, problem, agents]);

  const handleCopyFull = useCallback(async () => {
    if (!finalOut || copyingFull) return;
    setCopyingFull(true);
    await copyFullReport({
      local,
      employer,
      role,
      problem,
      agentOutputs: agents
        .filter((a) => a.output)
        .map((a) => ({ label: a.label, output: a.output ?? "" })),
      finalMarkdown: finalOut,
    });
    if (copyFullTimerRef.current) clearTimeout(copyFullTimerRef.current);
    copyFullTimerRef.current = setTimeout(() => setCopyingFull(false), 1800);
  }, [finalOut, copyingFull, local, employer, role, problem, agents]);

  const updateAgent = useCallback(
    (key: string, label: string, patch: Partial<AgentState>) => {
      setAgents((prev) => {
        const idx = prev.findIndex((a) => a.key === key);
        if (idx === -1) {
          return [
            ...prev,
            { key, label, status: "pending", ...patch } as AgentState,
          ];
        }
        const next = prev.slice();
        next[idx] = { ...next[idx]!, label, ...patch };
        return next;
      });
    },
    [],
  );

  const handleRun = useCallback(() => {
    if (!problem.trim() || running) return;
    if (listening) stopVoice();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    // Abort any prior in-flight pipeline before starting a new run.
    pipelineRef.current?.abort();
    pipelineRef.current = null;

    // Bump runId so any late callbacks from a prior run are ignored.
    const myRunId = ++runIdRef.current;
    finalArrivedRef.current = false;

    setRunning(true);
    setExportError(null);
    setErrorMsg(null);
    setAgents([]);
    setFinalOut(null);
    setExpanded({});

    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 9999, animated: true });
    }, 50);

    const isCurrent = () => runIdRef.current === myRunId;

    pipelineRef.current = runAgentPipeline(
      {
        local,
        employer,
        role,
        caseHistory,
        keyPeople,
        problem,
      },
      {
        onPending: (key, label) => {
          if (!isCurrent()) return;
          updateAgent(key, label, { status: "pending" });
        },
        onRunning: (key, label) => {
          if (!isCurrent()) return;
          updateAgent(key, label, { status: "running" });
          Haptics.selectionAsync().catch(() => {});
        },
        onDone: (key, label, output) => {
          if (!isCurrent()) return;
          updateAgent(key, label, { status: "done", output });
          if (key !== "final") {
            // Auto-expand each specialist as it finishes (until final arrives).
            setExpanded((prev) =>
              prev[key] === undefined ? { ...prev, [key]: true } : prev,
            );
          }
          if (key === "final") {
            finalArrivedRef.current = true;
            setFinalOut(output);
            // Collapse all specialists once the final response is ready.
            setExpanded({});
            Haptics.notificationAsync(
              Haptics.NotificationFeedbackType.Success,
            ).catch(() => {});
            setTimeout(() => {
              scrollRef.current?.scrollToEnd({ animated: true });
            }, 100);
          }
        },
        onError: (message) => {
          if (!isCurrent()) return;
          setErrorMsg(message);
          setRunning(false);
          pipelineRef.current = null;
          Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Error,
          ).catch(() => {});
        },
        onComplete: () => {
          if (!isCurrent()) return;
          setRunning(false);
          pipelineRef.current = null;
        },
      },
    );
  }, [
    problem,
    running,
    listening,
    stopVoice,
    local,
    employer,
    role,
    caseHistory,
    keyPeople,
    updateAgent,
  ]);

  const handleStop = useCallback(() => {
    if (!running) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    // Bump runId so any in-flight callbacks from this run are ignored.
    runIdRef.current += 1;
    pipelineRef.current?.abort();
    pipelineRef.current = null;
    setRunning(false);
    // Only show "stopped" if we never received a final response.
    if (!finalArrivedRef.current) {
      setErrorMsg("Pipeline stopped.");
    }
  }, [running]);

  const reset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (listening) stopVoice();
    runIdRef.current += 1;
    finalArrivedRef.current = false;
    pipelineRef.current?.abort();
    pipelineRef.current = null;
    setProblem("");
    setAgents([]);
    setFinalOut(null);
    setErrorMsg(null);
    setExportError(null);
    setExpanded({});
    setRunning(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [listening, stopVoice]);

  const specialistAgents = useMemo(
    () => agents.filter((a) => a.key !== "final" && a.output),
    [agents],
  );

  const showCanSubmit = problem.trim().length > 0 && !running;

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 32 + extraBottomPad,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.shield, { borderColor: colors.primary }]}>
            <Text style={[styles.shieldText, { color: colors.primary }]}>W</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.brand, { color: colors.foreground }]}>
              WORKERSHIELD
            </Text>
            <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
              ONTARIO LABOUR DEFENSE • MULTI-AGENT
            </Text>
          </View>
        </View>
        <View
          style={[styles.divider, { backgroundColor: colors.primary }]}
        />
      </View>

      {/* REPRISAL BANNER */}
      <View style={styles.section}>
        <View
          style={[
            styles.reprisalBanner,
            { borderColor: colors.primary, backgroundColor: colors.card },
          ]}
        >
          <View
            style={[styles.reprisalTag, { backgroundColor: colors.primary }]}
          >
            <Text
              style={[
                styles.reprisalTagText,
                { color: colors.primaryForeground },
              ]}
            >
              ⚠ REPRISAL PROTECTION
            </Text>
          </View>
          <Text style={[styles.reprisalBody, { color: colors.foreground }]}>
            Filing a complaint, asking about your rights, or participating in an
            investigation is{" "}
            <Text style={{ fontFamily: "Inter_700Bold" }}>legally protected</Text>{" "}
            under{" "}
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              OHSA s.50
            </Text>
            ,{" "}
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              ESA Part XVIII
            </Text>
            , and{" "}
            <Text style={{ fontFamily: "Inter_700Bold", color: colors.primary }}>
              OHRC s.8
            </Text>
            . Document any retaliation immediately — schedule changes,
            discipline, isolation, monitoring.
          </Text>
        </View>
      </View>

      {/* FORM */}
      <View style={styles.section}>
        <FieldLabel text="LOCAL / UNION" />
        <Input value={local} onChangeText={setLocal} />

        <View style={{ height: 14 }} />
        <FieldLabel text="EMPLOYER" />
        <Input value={employer} onChangeText={setEmployer} />

        <View style={{ height: 14 }} />
        <FieldLabel text="ROLE" />
        <View style={styles.roleRow}>
          {ROLES.map((r) => {
            const active = r === role;
            return (
              <Pressable
                key={r}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setRole(r);
                }}
                style={({ pressed }) => [
                  styles.roleBtn,
                  {
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active
                      ? colors.primary
                      : pressed
                        ? colors.card
                        : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    {
                      color: active
                        ? colors.primaryForeground
                        : colors.foreground,
                    },
                  ]}
                >
                  {r.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 14 }} />
        <FieldLabel text="CASE HISTORY" optional />
        <Input
          value={caseHistory}
          onChangeText={setCaseHistory}
          multiline
          minHeight={70}
          placeholder="Prior incidents, grievances, related events…"
        />

        <View style={{ height: 14 }} />
        <FieldLabel text="KEY PEOPLE" optional />
        <Input
          value={keyPeople}
          onChangeText={setKeyPeople}
          multiline
          minHeight={70}
          placeholder="Names, titles, roles, relationships…"
        />

        <View style={{ height: 14 }} />
        <View style={styles.problemHeader}>
          <FieldLabel text="PROBLEM" />
          <Pressable
            onPress={toggleVoice}
            disabled={running}
            style={({ pressed }) => [
              styles.micBtn,
              {
                borderColor: listening ? "#E5484D" : colors.primary,
                backgroundColor: listening
                  ? "#E5484D"
                  : pressed
                    ? colors.card
                    : "transparent",
                opacity: running ? 0.5 : 1,
              },
            ]}
          >
            {listening ? <PulsingDot /> : null}
            <Text
              style={[
                styles.micBtnText,
                { color: listening ? "#FFFFFF" : colors.primary },
              ]}
            >
              {listening ? "STOP" : voiceAvailable ? "● DICTATE" : "● VOICE"}
            </Text>
          </Pressable>
        </View>
        <Input
          value={problem}
          onChangeText={setProblem}
          multiline
          minHeight={140}
          placeholder="Describe what happened. Be specific. Include dates, names, and what management said. Tap DICTATE to use voice."
        />
        {listening && (
          <Text style={[styles.listeningHint, { color: colors.primary }]}>
            ● LISTENING — speak clearly, tap STOP when done
          </Text>
        )}
      </View>

      {/* ACTIVATE BUTTON */}
      <View style={styles.section}>
        <Pressable
          onPress={handleRun}
          disabled={!showCanSubmit}
          style={({ pressed }) => [
            styles.activateBtn,
            {
              backgroundColor: showCanSubmit
                ? pressed
                  ? "#B88A14"
                  : colors.primary
                : colors.muted,
              borderColor: showCanSubmit ? colors.primary : colors.border,
              opacity: running ? 0.85 : 1,
            },
          ]}
        >
          {running ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ActivityIndicator color={colors.primaryForeground} size="small" />
              <Text
                style={[
                  styles.activateText,
                  { color: colors.primaryForeground },
                ]}
              >
                AGENTS DEPLOYED
              </Text>
            </View>
          ) : (
            <Text
              style={[
                styles.activateText,
                {
                  color: showCanSubmit
                    ? colors.primaryForeground
                    : colors.mutedForeground,
                },
              ]}
            >
              ▲ ACTIVATE WORKERSHIELD
            </Text>
          )}
        </Pressable>

        {running && (
          <Pressable
            onPress={handleStop}
            style={({ pressed }) => [
              styles.stopBtn,
              {
                backgroundColor: pressed ? "#7A1212" : "transparent",
                borderColor: colors.danger,
              },
            ]}
          >
            <Text style={[styles.stopBtnText, { color: colors.danger }]}>
              ■ STOP PIPELINE
            </Text>
          </Pressable>
        )}
      </View>

      {/* AGENT STATUS */}
      {agents.length > 0 && (
        <View style={styles.section}>
          <SectionTitle text="AGENT PIPELINE" />
          <View style={styles.chipsWrap}>
            {agents.map((a) => (
              <AgentChip key={a.key} label={a.label} status={a.status} />
            ))}
          </View>
        </View>
      )}

      {/* ERROR */}
      {errorMsg && (
        <View style={styles.section}>
          <View
            style={[
              styles.errorCard,
              { borderColor: colors.danger, backgroundColor: colors.card },
            ]}
          >
            <Text style={[styles.errorTitle, { color: colors.danger }]}>
              PIPELINE ERROR
            </Text>
            <Text style={{ color: colors.foreground, marginTop: 6 }}>
              {errorMsg}
            </Text>
          </View>
        </View>
      )}

      {/* SPECIALIST OUTPUT CARDS */}
      {specialistAgents.map((a) => {
        const isOpen = expanded[a.key] ?? false;
        return (
          <View key={a.key} style={styles.section}>
            <View
              style={[
                styles.outputCard,
                { borderColor: colors.border, backgroundColor: colors.card },
              ]}
            >
              <Pressable
                onPress={() => toggleExpand(a.key)}
                style={({ pressed }) => [
                  styles.outputHeader,
                  {
                    borderBottomColor: colors.border,
                    borderBottomWidth: isOpen ? 1 : 0,
                    backgroundColor: pressed ? colors.muted : "transparent",
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.outputTag,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    AGENT
                  </Text>
                  <Text
                    style={[styles.outputTitle, { color: colors.foreground }]}
                  >
                    {a.label.toUpperCase()}
                  </Text>
                </View>
                <Text
                  style={[styles.chevron, { color: colors.primary }]}
                >
                  {isOpen ? "▾" : "▸"}
                </Text>
              </Pressable>
              {isOpen && (
                <View style={{ padding: 14 }}>
                  <Markdown source={a.output ?? ""} />
                  <View style={styles.cardActions}>
                    <CopyButton text={a.output ?? ""} label="COPY OUTPUT" />
                  </View>
                </View>
              )}
            </View>
          </View>
        );
      })}

      {/* FINAL CARD */}
      {finalOut && (
        <View style={styles.section}>
          <View
            style={[
              styles.finalCard,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
          >
            <View
              style={[
                styles.finalHeader,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.finalHeaderText,
                  { color: colors.primaryForeground },
                ]}
              >
                ★ WORKERSHIELD RESPONSE
              </Text>
            </View>
            <View style={{ padding: 16 }}>
              <Markdown source={finalOut} />
              <View style={[styles.cardActions, { gap: 8 }]}>
                <CopyButton text={finalOut} label="COPY RESPONSE" size="md" />
              </View>
            </View>
          </View>

          <View style={styles.finalActionsRow}>
            <Pressable
              onPress={handleExportPdf}
              disabled={exporting}
              style={({ pressed }) => [
                styles.finalActionBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: exporting
                    ? colors.muted
                    : pressed
                      ? "#B88A14"
                      : colors.primary,
                },
              ]}
            >
              {exporting ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primaryForeground}
                />
              ) : (
                <Text
                  style={[
                    styles.finalActionText,
                    { color: colors.primaryForeground },
                  ]}
                >
                  ⤓ EXPORT FULL PDF
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleCopyFull}
              disabled={copyingFull}
              style={({ pressed }) => [
                styles.finalActionBtn,
                {
                  borderColor: copyingFull ? colors.success : colors.primary,
                  backgroundColor: copyingFull
                    ? colors.success
                    : pressed
                      ? colors.card
                      : "transparent",
                },
              ]}
            >
              <Text
                style={[
                  styles.finalActionText,
                  {
                    color: copyingFull
                      ? colors.primaryForeground
                      : colors.primary,
                  },
                ]}
              >
                {copyingFull ? "✓ FULL REPORT COPIED" : "⎘ COPY FULL REPORT"}
              </Text>
            </Pressable>
            <Pressable
              onPress={reset}
              style={({ pressed }) => [
                styles.finalActionBtn,
                {
                  borderColor: colors.primary,
                  backgroundColor: pressed ? colors.card : "transparent",
                },
              ]}
            >
              <Text style={[styles.finalActionText, { color: colors.primary }]}>
                + NEW PROBLEM
              </Text>
            </Pressable>
          </View>
          {exportError && (
            <Text style={[styles.exportError, { color: colors.danger }]}>
              {exportError}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function PulsingDot() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 500,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "#FFFFFF",
        opacity: pulse,
        marginRight: 6,
      }}
    />
  );
}

function FieldLabel({ text, optional }: { text: string; optional?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {text}
      </Text>
      {optional && (
        <Text style={[styles.optional, { color: colors.mutedForeground }]}>
          OPTIONAL
        </Text>
      )}
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <View style={[styles.sectionBar, { backgroundColor: colors.primary }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {text}
      </Text>
    </View>
  );
}

function Input(props: {
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  minHeight?: number;
  placeholder?: string;
}) {
  const colors = useColors();
  return (
    <TextInput
      value={props.value}
      onChangeText={props.onChangeText}
      multiline={props.multiline}
      placeholder={props.placeholder}
      placeholderTextColor={colors.mutedForeground}
      style={[
        styles.input,
        {
          color: colors.foreground,
          borderColor: colors.border,
          backgroundColor: colors.card,
          minHeight: props.minHeight ?? 44,
          textAlignVertical: props.multiline ? "top" : "center",
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  shield: {
    width: 44,
    height: 50,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
  },
  shieldText: {
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
  },
  brand: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  tagline: {
    fontSize: 9,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    marginTop: 2,
  },
  divider: {
    height: 2,
    marginTop: 14,
  },
  section: {
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  fieldLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
  },
  optional: {
    fontSize: 8,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.2,
    opacity: 0.7,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  roleRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: "center",
  },
  roleBtnText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
  activateBtn: {
    paddingVertical: 18,
    borderWidth: 2,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  activateText: {
    fontSize: 14,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  stopBtn: {
    marginTop: 10,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtnText: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.6,
  },
  chevron: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    paddingHorizontal: 4,
  },
  cardActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sectionBar: { width: 3, height: 14 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
  },
  chipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  errorCard: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 14,
  },
  errorTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.4,
  },
  outputCard: {
    borderWidth: 1,
    borderRadius: 4,
  },
  outputHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  outputTag: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.6,
  },
  outputTitle: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.4,
  },
  finalCard: {
    borderWidth: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  finalHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  finalHeaderText: {
    fontSize: 13,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 2,
  },
  finalActionsRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  finalActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  finalActionText: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.4,
  },
  exportError: {
    marginTop: 8,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  reprisalBanner: {
    borderWidth: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  reprisalTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reprisalTagText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.6,
  },
  reprisalBody: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    padding: 12,
  },
  problemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  micBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderRadius: 4,
  },
  micBtnText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.2,
  },
  listeningHint: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.2,
  },
});
