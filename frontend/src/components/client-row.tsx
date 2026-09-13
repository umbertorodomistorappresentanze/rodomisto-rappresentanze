import { Pressable, View } from "react-native";
import { ClockCounterClockwise, DotsThreeVertical, MapPin, Phone } from "phosphor-react-native";

import { Client } from "@/src/api";
import { AppText } from "@/src/components/ui";
import { shortDate } from "@/src/format";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: 72,
  },
  info: { flex: 1, gap: 3 },
  name: { fontSize: 16, color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  meta: { fontSize: 13, color: c.muted },
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    marginTop: 2,
  },
  pillText: { fontSize: 11 },
  actionsBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
}));

export function ClientRow({
  client,
  onActions,
  onHistory,
}: {
  client: Client;
  onActions: (c: Client) => void;
  onHistory: (c: Client) => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();

  const zonaDiff = client.zona && client.zona !== client.citta;

  let pillBg = colors.surfaceTertiary;
  let pillColor = colors.onSurfaceTertiary;
  let pillText = "";
  if (client.handled_today) {
    pillBg = colors.brandSecondary;
    pillColor = colors.onBrandSecondary;
    pillText = "Gestito oggi";
  } else if (!client.last_visit_at) {
    pillBg = colors.surfaceTertiary;
    pillColor = colors.onSurfaceTertiary;
    pillText = "Mai visitato";
  } else {
    pillText = `Ultima visita: ${shortDate(client.last_visit_at)}`;
  }

  return (
    <Pressable
      testID={`client-row-${client.id}`}
      onPress={() => onActions(client)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.info}>
        <AppText weight="semibold" style={styles.name} numberOfLines={1}>
          {client.ragione_sociale}
        </AppText>
        <View style={styles.metaRow}>
          <MapPin size={13} color={colors.muted} weight="bold" />
          <AppText style={styles.meta} numberOfLines={1}>
            {client.citta}
            {zonaDiff ? ` · Zona ${client.zona}` : ""}
          </AppText>
        </View>
        {client.telefono ? (
          <View style={styles.metaRow}>
            <Phone size={13} color={colors.muted} weight="bold" />
            <AppText style={styles.meta}>{client.telefono}</AppText>
          </View>
        ) : null}
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <AppText weight="medium" style={[styles.pillText, { color: pillColor }]}>{pillText}</AppText>
        </View>
      </View>

      <Pressable
        testID={`client-history-${client.id}`}
        onPress={() => onHistory(client)}
        hitSlop={6}
        style={styles.historyBtn}
      >
        <ClockCounterClockwise size={20} color={colors.onSurfaceSecondary} weight="bold" />
      </Pressable>
      <Pressable
        testID={`client-actions-${client.id}`}
        onPress={() => onActions(client)}
        hitSlop={6}
        style={styles.actionsBtn}
      >
        <DotsThreeVertical size={24} color={colors.onBrand} weight="bold" />
      </Pressable>
    </Pressable>
  );
}
