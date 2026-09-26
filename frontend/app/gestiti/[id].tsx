import { useMemo } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft } from "phosphor-react-native";

import { apiGet, Client, Giro } from "@/src/api";
import { AppText, Loading } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function GestitiScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const giro = giriQuery.data?.find((g) => g.id === id) ?? null;

  const clientsQuery = useQuery({
    queryKey: ["clients", id],
    queryFn: () => apiGet<Client[]>(`/clients?giro_id=${id}`),
    enabled: !!id,
  });

  const gestiti = useMemo(
    () => (clientsQuery.data ?? []).filter((c) => c.status !== "da_visitare"),
    [clientsQuery.data]
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="gestiti-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" style={styles.title}>{gestiti.length} Gestiti</AppText>
          {giro ? <AppText style={styles.sub} numberOfLines={1}>{giro.name}</AppText> : null}
        </View>
      </View>

      {clientsQuery.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={gestiti}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <AppText weight="semibold" style={styles.name} numberOfLines={2}>{item.ragione_sociale}</AppText>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Nessun cliente ancora gestito in questo giro.</AppText>
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
  sub: { fontSize: 13, color: c.muted, marginTop: 1 },
  row: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  name: { fontSize: 15, color: c.onSurface },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
}));
