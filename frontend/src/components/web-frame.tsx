import { ReactNode } from "react";
import { Platform, useWindowDimensions, View } from "react-native";

import { useTheme } from "@/src/theme";

const MAX_WIDTH = 820;
const BREAKPOINT = 768;

/**
 * On web wide screens (iPad landscape / desktop) center the app in a
 * comfortable max-width column so the UI is not stretched edge-to-edge.
 * On mobile and narrow screens it is a transparent passthrough (flex:1).
 */
export function WebFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  if (Platform.OS !== "web" || width <= BREAKPOINT) {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceSecondary, alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: MAX_WIDTH,
          backgroundColor: colors.surface,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
        }}
      >
        {children}
      </View>
    </View>
  );
}
