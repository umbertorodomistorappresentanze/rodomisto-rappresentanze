import { View } from "react-native";
import { Warning } from "phosphor-react-native";

import { AppText } from "@/src/components/ui";
import { makeStyles, radius, spacing } from "@/src/theme";

/** Badge rosso ben visibile accanto al nome: il cliente ha sospesi attivi. */
export function SuspensionBadge({ count, testID }: { count: number; testID?: string }) {
  const styles = useStyles();
  if (!count) return null;
  return (
    <View style={styles.badge} testID={testID} accessibilityLabel={`${count} sospesi attivi`}>
      <Warning size={12} color="#FFFFFF" weight="fill" />
      <AppText weight="bold" style={styles.text}>{count > 1 ? `${count} SOSPESI` : "SOSPESO"}</AppText>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  badge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: "#DC2626", borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2, flexShrink: 0,
  },
  text: { fontSize: 10, color: "#FFFFFF", letterSpacing: 0.4 },
}));
