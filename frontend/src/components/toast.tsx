import { createContext, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, WarningCircle } from "phosphor-react-native";

import { AppText } from "@/src/components/ui";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

type ToastKind = "success" | "error";
type ToastState = { message: string; kind: ToastKind } | null;

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((message: string, kind: ToastKind = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, kind });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          entering={FadeInUp}
          exiting={FadeOutUp}
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + spacing.sm }]}
        >
          <View
            testID="app-toast"
            style={[
              styles.toast,
              { backgroundColor: toast.kind === "success" ? colors.brand : colors.error },
            ]}
          >
            {toast.kind === "success" ? (
              <CheckCircle size={22} color={colors.onBrand} weight="fill" />
            ) : (
              <WarningCircle size={22} color={colors.onError} weight="fill" />
            )}
            <AppText weight="semibold" style={[styles.text, { color: "#FFFFFF" }]}>
              {toast.message}
            </AppText>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 1000 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    maxWidth: 460,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { fontFamily: fonts.semibold, fontSize: 14, flexShrink: 1 },
});
