import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretRight, MapPin, Plus } from "phosphor-react-native";
import { useCallback } from "react";

import { apiGet, Client } from "@/src/api";
import { AppText, EmptyState, Loading } from "@/src/components/ui";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function DaVerificare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const query = useQuery({ queryKey: ["da-verificare"], queryFn: () => apiGet<Client[]>("/clients/da-verificare") });

  useFocusEffect(useCallback(() => { query.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <AppText weight="bold" style={styles.title}>Da Verificare</AppText>
        <AppText style={styles.sub}>Clienti senza un giro assegnato. Aprili per assegnarli al giro corretto.</AppText>
      </View>

      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + 96 }}
          refreshControl={
            <RefreshControl refreshing={query.isFetching} onRefresh={() => query.refetch()} tintColor={colors.brand} />
          }
          renderItem={({ item }) => (
            <Pressable
              testID={`verify-row-${item.id}`}
              onPress={() => router.push(`/client/${item.id}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={{ flex: 1, gap: 3 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.ragione_sociale}</AppText>
                <View style={styles.metaRow}>
                  <MapPin size={13} color={colors.muted} weight="bold" />
                  <AppText style={styles.meta} numberOfLines={1}>
                    {item.citta}{item.zona ? ` · Zona ${item.zona}` : ""}
                  </AppText>
                </View>
              </View>
              <CaretRight size={20} color={colors.muted} weight="bold" />
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState title="Nessun cliente da verificare" text="Tutti i tuoi clienti sono assegnati a un giro." />
          }
        />
      )}

      <Pressable
        testID="verify-add-client"
        onPress={() => router.push("/client/new")}
        style={[styles.fab, { bottom: insets.bottom + spacing.lg }]}
      >
        <Plus size={26} color={colors.onBrand} weight="bold" />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
    borderBottomWidth: 1, borderBottomColor: c.border, gap: spacing.xs,
  },
  title: { fontSize: 24, color: c.onSurface },
  sub: { fontSize: 13, color: c.muted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 64,
  },
  name: { fontSize: 16, color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { fontSize: 13, color: c.muted },
  fab: {
    position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: radius.pill,
    backgroundColor: c.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
}));
