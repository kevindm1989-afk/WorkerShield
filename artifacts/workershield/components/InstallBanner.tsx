import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

const DISMISSED_KEY = "ws_pwa_banner_dismissed";

export function InstallBanner() {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<Event | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (Platform.OS !== "web") return;

    AsyncStorage.getItem(DISMISSED_KEY).then((val) => {
      if (val === "1") return;

      if (typeof window === "undefined") return;
      const isStandalone =
        (window.navigator as Navigator & { standalone?: boolean }).standalone ===
          true ||
        window.matchMedia("(display-mode: standalone)").matches;
      if (isStandalone) return;

      const handler = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        show();
      };
      window.addEventListener("beforeinstallprompt", handler as EventListener);

      if (!deferredPrompt) {
        const timeout = setTimeout(() => {
          AsyncStorage.getItem(DISMISSED_KEY).then((v) => {
            if (v !== "1") show();
          });
        }, 2500);
        return () => {
          clearTimeout(timeout);
          window.removeEventListener(
            "beforeinstallprompt",
            handler as EventListener,
          );
        };
      }

      return () => {
        window.removeEventListener(
          "beforeinstallprompt",
          handler as EventListener,
        );
      };
    });
  }, []);

  const show = () => {
    setVisible(true);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const dismiss = () => {
    Animated.timing(opacity, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setVisible(false));
    AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => {});
  };

  const handleAdd = async () => {
    if (deferredPrompt && "prompt" in deferredPrompt) {
      (deferredPrompt as any).prompt();
    }
    dismiss();
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: colors.primary, opacity },
      ]}
    >
      <Text style={[styles.bannerText, { color: colors.primaryForeground }]}>
        📱 Add WorkerShield to your home screen for instant access
      </Text>
      <View style={styles.bannerActions}>
        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => [
            styles.addBtn,
            {
              backgroundColor: pressed ? "#0B0F14" : colors.primaryForeground,
            },
          ]}
        >
          <Text style={[styles.addBtnText, { color: colors.primary }]}>
            ADD TO HOME SCREEN
          </Text>
        </Pressable>
        <Pressable onPress={dismiss} style={styles.dismissBtn}>
          <Text
            style={[styles.dismissText, { color: colors.primaryForeground }]}
          >
            DISMISS
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bannerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 18,
    marginBottom: 10,
  },
  bannerActions: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  addBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 3,
  },
  addBtnText: {
    fontSize: 10,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: 1.2,
  },
  dismissBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dismissText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    opacity: 0.8,
  },
});
