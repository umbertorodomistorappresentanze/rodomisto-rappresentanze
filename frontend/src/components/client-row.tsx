import { Pressable, View } from "react-native";
import { ClockCounterClockwise, DotsThreeVertical, MapPin, Phone, Warning } from "phosphor-react-native";

import { Client } from "@/src/api";
import { AppText } from "@/src/components/ui";
import { lastActionLabel } from "@/src/utils/last-action";
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
  suspBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: "#FEE2E2", borderRadius: radius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 3, alignSelf: "flex-start",
  },
  suspText: { fontSize: 12, color: "#B91C1C" },
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

  // "Ultima azione" persistente (indipendente dal ciclo 21 giorni): mostra
  // l'azione più recente tra ordine, incasso e visita, oppure "Mai visitato".
  const pillText = lastActionLabel(client);
  const hasAction = pillText !== "Mai visitato";
  const pillBg = hasAction ? colors.brandSecondary : colors.surfaceTertiary;
  const pillColor = hasAction ? colors.onBrandSecondary : colors.onSurfaceTertiary;

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
        {client.suspensions && client.suspensions.length > 0 ? (
          <View style={styles.suspBox}>
            <Warning size={13} color="#B91C1C" weight="fill" />
            <AppText weight="semibold" style={styles.suspText} numberOfLines={2}>
              {client.suspensions.join(" · ")}
            </AppText>
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
