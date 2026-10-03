import { useMemo, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretLeft, WarningCircle, Clock } from "phosphor-react-native";

import { apiGet, Suspension } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Loading } from "@/src/components/ui";
import { dmyDate } from "@/src/format";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Scope = "all" | "umberto" | "andrea";

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "all", label: "Tutti" },
  { key: "umberto", label: "Umberto" },
  { key: "andrea", label: "Andrea" },
];

const AGENT_SHORT: Record<string, string> = { umberto: "Umberto", andrea: "Andrea" };

export default function SospesiScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [scope, setScope] = useState<Scope>("all");

  const query = useQuery({
    queryKey: ["suspensions", scope],
    queryFn: () => apiGet<Suspension[]>(`/suspensions?scope=${scope}`),
  });

  const sections = useMemo(() => {
    const data = query.data ?? [];
    const overdue = data.filter((s) => s.kind === "overdue");
    const soon = data.filter((s) => s.kind === "due_soon");
    const secs: { title: string; kind: string; data: Suspension[] }[] = [];
    if (overdue.length) secs.push({ title: "SOSPESI DA INCASSARE", kind: "overdue", data: overdue });
    if (soon.length) secs.push({ title: "INCASSI IN SCADENZA", kind: "due_soon", data: soon });
    return secs;
  }, [query.data]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="sospesi-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.title}>Promemoria sospesi</AppText>
      </View>

      {isAdmin ? (
        <View style={styles.controls}>
          <View style={styles.chipRow}>
            {SCOPE_OPTIONS.map((o) => {
              const on = scope === o.key;
              return (
                <Pressable key={o.key} testID={`sos-scope-${o.key}`} onPress={() => setScope(o.key)} style={[styles.chip, on && styles.chipOn]}>
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(s, i) => `${s.client_id}-${s.company_name}-${i}`}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              {section.kind === "overdue" ? (
                <WarningCircle size={16} color={colors.error} weight="fill" />
              ) : (
                <Clock size={16} color={colors.warning} weight="fill" />
              )}
              <AppText weight="bold" style={styles.sectionTitle}>{section.title}</AppText>
              <View style={styles.countBadge}>
                <AppText weight="bold" style={styles.countText}>{section.data.length}</AppText>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <Pressable
              testID={`sos-row-${item.client_id}`}
              onPress={() => router.push(`/client/${item.client_id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.dot, { backgroundColor: item.kind === "overdue" ? colors.error : colors.warning }]} />
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.ragione_sociale}</AppText>
                <AppText style={styles.meta} numberOfLines={1}>
                  {item.company_name}{item.citta ? ` · ${item.citta}` : ""}
                </AppText>
                <AppText style={styles.due}>
                  {item.kind === "overdue"
                    ? (item.due_at ? `Scaduto il ${dmyDate(item.due_at)}` : "Sospeso attivo")
                    : (item.due_at ? `In scadenza il ${dmyDate(item.due_at)}` : "In scadenza")}
                </AppText>
              </View>
              {isAdmin && scope === "all" && item.agent ? (
                <AppText style={styles.agent}>{AGENT_SHORT[item.agent] ?? item.agent}</AppText>
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Nessun sospeso attivo o in scadenza. 🎉</AppText>
            </View>
          }
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: c.onSurface },
  controls: { backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  sectionTitle: { fontSize: 13, color: c.onSurfaceTertiary, letterSpacing: 0.5, flex: 1 },
  countBadge: { minWidth: 24, paddingHorizontal: 6, height: 20, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 11, color: c.onSurfaceSecondary },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 64,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 15, color: c.onSurface },
  meta: { fontSize: 12, color: c.muted, marginTop: 1 },
  due: { fontSize: 12, color: c.onSurfaceSecondary, marginTop: 2 },
  agent: { fontSize: 11, color: c.brand },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
}));
