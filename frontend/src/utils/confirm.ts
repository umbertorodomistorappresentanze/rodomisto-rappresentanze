import { Alert, Platform } from "react-native";

/**
 * Cross-platform confirmation dialog.
 * On native uses Alert.alert (with buttons); on web uses window.confirm,
 * because Alert.alert buttons are not actionable on react-native-web.
 */
export function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
  opts?: { destructive?: boolean }
) {
  if (Platform.OS === "web") {
    const ok = typeof window !== "undefined" ? window.confirm(`${title}\n\n${message}`) : true;
    if (ok) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: "Annulla", style: "cancel" },
    {
      text: confirmLabel,
      style: opts?.destructive === false ? "default" : "destructive",
      onPress: onConfirm,
    },
  ]);
}
