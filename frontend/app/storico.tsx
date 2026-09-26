import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";

import { Activity, apiGet } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Loading } from "@/src/components/ui";
import { ActivityRow } from "@/src/components/updates-panel";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type TypeFilter = "all" | "order" | "collection" | "suspension" | "reschedule";
type Scope = "all" | "umberto" | "andrea";

const TYPE_OPTIONS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "Tutte" },
  { key: "order", label: "Ordini" },
  { key: "collection", label: "Incassi" },
  { key: "suspension", label: "Sospesi" },
  { key: "reschedule", label: "Visite rimandate" },
];

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "all", label: "Tutti" },
  { key: "umberto", label: "Umberto" },
  { key: "andrea", label: "Andrea" },
];

export default function StoricoScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [type, setType] = useState<TypeFilter>("all");
  const [scope, setScope] = useState<Scope>("all");

  const query = useQuery({
    queryKey: ["activities", scope, type, 500],
    queryFn: () => apiGet<Activity[]>(`/activities?scope=${scope}&type=${type}&limit=500`),
  });

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="storico-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.title}>Storico attività</AppText>
      </View>

      <View style={styles.controls}>
        <View style={styles.chipRow}>
          {TYPE_OPTIONS.map((o) => {
            const on = type === o.key;
            return (
              <Pressable key={o.key} testID={`sto-type-${o.key}`} onPress={() => setType(o.key)} style={[styles.chip, on && styles.chipOn]}>
                <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</AppText>
              </Pressable>
            );
          })}
        </View>
        {isAdmin ? (
          <View style={styles.chipRow}>
            {SCOPE_OPTIONS.map((o) => {
              const on = scope === o.key;
              return (
                <Pressable key={o.key} testID={`sto-scope-${o.key}`} onPress={() => setScope(o.key)} style={[styles.chip, on && styles.chipOn]}>
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => <ActivityRow item={item} showAgent={isAdmin && scope === "all"} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Nessuna attività trovata.</AppText>
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
  controls: { backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
}));
