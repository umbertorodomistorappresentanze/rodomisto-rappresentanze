import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretRight, ClockCounterClockwise } from "phosphor-react-native";

import { Activity, apiGet, VisitEvent } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText } from "@/src/components/ui";
import { EventActions } from "@/src/components/event-actions";
import { dateTimeShort, longDate, shortDayDate } from "@/src/format";
import { storage } from "@/src/utils/storage";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Scope = "all" | "umberto" | "andrea";

const TYPE_COLORS: Record<Activity["type"], keyof ReturnType<typeof useTheme>["colors"]> = {
  order: "brand",
  collection: "success",
  suspension: "error",
  reschedule: "warning",
};

const AGENT_SHORT: Record<string, string> = { umberto: "Umberto", andrea: "Andrea" };

export function ActivityRow({ item, showAgent }: { item: Activity; showAgent?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const dotColor = colors[TYPE_COLORS[item.type]] as string;
  const ev: VisitEvent = {
    id: item.id,
    client_id: item.client_id ?? "",
    type: item.type,
    company_id: null,
    company_name: item.company_name,
    note_text: null,
    reschedule_until: null,
    agent: item.agent,
    created_at: item.created_at,
    payment_mode: item.payment_mode ?? null,
  };
  return (
    <View style={styles.rowWrap}>
      <View style={styles.rowTop}>
        <View style={styles.dateBadge}>
          <AppText weight="semibold" style={styles.dateText}>{shortDayDate(item.created_at)}</AppText>
        </View>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={{ flex: 1 }}>
          <AppText weight="semibold" style={styles.typeLabel} numberOfLines={1}>{item.type_label}</AppText>
          <AppText style={styles.detail} numberOfLines={1}>
            {item.client_ragione_sociale}{item.context ? ` · ${item.context}` : ""}
          </AppText>
        </View>
        {showAgent && item.agent ? (
          <AppText style={styles.agent}>{AGENT_SHORT[item.agent] ?? item.agent}</AppText>
        ) : null}
      </View>
      <EventActions event={ev} />
    </View>
  );
}

export function UpdatesPanel({ isAdmin }: { isAdmin: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const [scope, setScope] = useState<Scope>("all");
  const [lastAccess, setLastAccess] = useState<string | null>(null);

  // Ultimo accesso dell'utente (salvato localmente sul dispositivo): mostra
  // l'accesso precedente, poi registra quello corrente.
  useEffect(() => {
    if (!user?.username) return;
    const key = `last_access_${user.username}`;
    (async () => {
      const prev = await storage.getItem<string | null>(key, null);
      setLastAccess(prev);
      await storage.setItem(key, new Date().toISOString());
    })();
  }, [user?.username]);

  // "Ultimo aggiornamento" always reflects the full allowed set (own + others).
  const lastQuery = useQuery({
    queryKey: ["activities", "all", "all", 1],
    queryFn: () => apiGet<Activity[]>("/activities?scope=all&type=all&limit=1"),
  });
  const listQuery = useQuery({
    queryKey: ["activities", scope, "all", 3],
    queryFn: () => apiGet<Activity[]>(`/activities?scope=${scope}&type=all&limit=3`),
  });

  const last = lastQuery.data?.[0] ?? null;
  const list = listQuery.data ?? [];

  return (
    <View style={styles.wrap}>
      {/* ULTIMO AGGIORNAMENTO */}
      <View style={styles.lastCard}>
        <AppText weight="bold" style={styles.lastHeading}>ULTIMO AGGIORNAMENTO</AppText>
        {last ? (
          <>
            <AppText weight="semibold" style={styles.lastDate}>{longDate(last.created_at)}</AppText>
            <AppText style={styles.lastActivityLabel}>Ultima attività:</AppText>
            <AppText weight="semibold" style={styles.lastActivity} numberOfLines={2}>
              {last.type_label} – {last.client_ragione_sociale}{last.context ? ` – ${last.context}` : ""}
            </AppText>
          </>
        ) : (
          <AppText style={styles.emptyText}>Nessuna attività registrata.</AppText>
        )}
        <AppText style={styles.lastAccess}>
          {lastAccess ? `Ultimo accesso: ${dateTimeShort(lastAccess)}` : "Primo accesso"}
        </AppText>
      </View>

      {/* ULTIMI AGGIORNAMENTI */}
      <View style={styles.updatesCard}>
        <View style={styles.updatesHead}>
          <Pressable
            testID="updates-expand"
            onPress={() => router.push("/storico")}
            hitSlop={8}
            style={styles.updatesTitleRow}
          >
            <ClockCounterClockwise size={18} color={colors.brand} weight="bold" />
            <AppText weight="bold" style={styles.updatesTitle}>ULTIMI AGGIORNAMENTI</AppText>
          </Pressable>
          <Pressable testID="see-all-activities" onPress={() => router.push("/storico")} hitSlop={8} style={styles.seeAll}>
            <AppText weight="semibold" style={styles.seeAllText}>Vedi tutti</AppText>
            <CaretRight size={14} color={colors.brand} weight="bold" />
          </Pressable>
        </View>

        {isAdmin ? (
          <View style={styles.filterRow}>
            {(["all", "umberto", "andrea"] as Scope[]).map((s) => {
              const on = scope === s;
              const label = s === "all" ? "Tutti" : s === "umberto" ? "Umberto" : "Andrea";
              return (
                <Pressable
                  key={s}
                  testID={`upd-filter-${s}`}
                  onPress={() => setScope(s)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {list.length === 0 ? (
          <AppText style={styles.emptyText}>Nessun aggiornamento recente.</AppText>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {list.map((a) => (
              <ActivityRow key={a.id} item={a} showAgent={isAdmin && scope === "all"} />
            ))}
          </View>
        )}

        <Pressable testID="updates-open-history" onPress={() => router.push("/storico")} style={styles.expandBtn}>
          <AppText weight="semibold" style={styles.expandText}>Apri storico completo</AppText>
          <CaretRight size={14} color={colors.brand} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: { gap: spacing.md, marginBottom: spacing.sm },
  lastCard: {
    backgroundColor: c.brandSecondary,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 2,
  },
  lastHeading: { fontSize: 12, color: c.onBrandSecondary, letterSpacing: 0.5 },
  lastDate: { fontSize: 16, color: c.onBrandSecondary, marginTop: 2 },
  lastActivityLabel: { fontSize: 12, color: c.onBrandSecondary, marginTop: spacing.xs, opacity: 0.8 },
  lastActivity: { fontSize: 14, color: c.onBrandSecondary },
  lastAccess: { fontSize: 11, color: c.onBrandSecondary, opacity: 0.75, marginTop: spacing.sm },
  updatesCard: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  updatesHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  updatesTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  updatesTitle: { fontSize: 13, color: c.onSurface, letterSpacing: 0.5 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 13, color: c.brand },
  expandBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2,
    marginTop: spacing.xs, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: c.divider,
  },
  expandText: { fontSize: 13, color: c.brand },
  filterRow: { flexDirection: "row", gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  emptyText: { fontSize: 13, color: c.muted, fontStyle: "italic", paddingVertical: spacing.xs },
  rowWrap: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  dateBadge: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    minWidth: 66,
    alignItems: "center",
  },
  dateText: { fontSize: 12, color: c.onSurfaceSecondary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  typeLabel: { fontSize: 14, color: c.onSurface },
  detail: { fontSize: 12, color: c.muted, marginTop: 1 },
  agent: { fontSize: 11, color: c.brand },
}));
