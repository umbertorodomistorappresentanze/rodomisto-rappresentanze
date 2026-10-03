import { FlatList, Pressable, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretRight, MapPin, Plus, Trash, ArrowsMerge, Warning } from "phosphor-react-native";
import { useCallback } from "react";

import { apiDelete, apiGet, apiPost, Client } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, EmptyState, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { confirmAction } from "@/src/utils/confirm";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function DaVerificare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const query = useQuery({ queryKey: ["da-verificare"], queryFn: () => apiGet<Client[]>("/clients/da-verificare") });

  useFocusEffect(useCallback(() => { query.refetch(); }, [])); // eslint-disable-line react-hooks/exhaustive-deps

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["da-verificare"] });
    qc.invalidateQueries({ queryKey: ["giri"] });
    query.refetch();
  }

  const mergeMut = useMutation({
    mutationFn: ({ sourceId, targetId }: { sourceId: string; targetId: string }) =>
      apiPost(`/clients/${sourceId}/merge`, { target_id: targetId }),
    onSuccess: () => { toast("Schede unite", "success"); invalidate(); },
    onError: (e: any) => toast(e?.detail || "Errore durante l'unione", "error"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiDelete(`/clients/${id}`),
    onSuccess: () => { toast("Scheda eliminata", "success"); invalidate(); },
    onError: (e: any) => toast(e?.detail || "Errore durante l'eliminazione", "error"),
  });

  function onMerge(item: Client) {
    const dup = item.duplicates?.[0];
    if (!dup) return;
    confirmAction(
      "Unisci schede",
      `Vuoi unire "${item.ragione_sociale}" dentro "${dup.ragione_sociale}"? Lo storico verrà spostato e questa scheda eliminata.`,
      "Unisci",
      () => mergeMut.mutate({ sourceId: item.id, targetId: dup.id }),
      { destructive: false }
    );
  }
  function onDelete(item: Client) {
    confirmAction(
      "Elimina cliente",
      `Vuoi eliminare "${item.ragione_sociale}"? L'operazione è reversibile dal supporto ma la scheda sparirà da giri e anagrafica.`,
      "Elimina",
      () => deleteMut.mutate(item.id),
      { destructive: true }
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <AppText weight="bold" style={styles.title}>Da Verificare</AppText>
        <AppText style={styles.sub}>Clienti senza giro o con possibili duplicati. Assegna il giro, unisci o elimina i doppioni.</AppText>
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
          renderItem={({ item }) => {
            const dup = item.duplicates?.[0];
            return (
              <View style={styles.card}>
                <Pressable
                  testID={`verify-row-${item.id}`}
                  onPress={() => router.push(`/verify-assign/${item.id}`)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <AppText weight="semibold" style={styles.name} numberOfLines={2}>{item.ragione_sociale}</AppText>
                    <View style={styles.metaRow}>
                      <MapPin size={13} color={colors.muted} weight="bold" />
                      <AppText style={styles.meta} numberOfLines={1}>
                        {item.citta}{item.zona ? ` · Zona ${item.zona}` : ""}
                      </AppText>
                    </View>
                    {item.partita_iva ? (
                      <AppText style={styles.meta2}>P.IVA: {item.partita_iva}</AppText>
                    ) : null}
                    <AppText style={styles.meta2}>Agente: {item.agent === "andrea" ? "Andrea" : "Umberto"}</AppText>
                  </View>
                  <View style={styles.assignBadge}>
                    <AppText weight="semibold" style={styles.assignBadgeText}>Assegna</AppText>
                    <CaretRight size={16} color={colors.onBrand} weight="bold" />
                  </View>
                </Pressable>

                {dup ? (
                  <View style={styles.dupBox}>
                    <View style={styles.dupHead}>
                      <Warning size={15} color={colors.warning} weight="fill" />
                      <AppText style={styles.dupText} numberOfLines={2}>
                        Stessa P.IVA di <AppText weight="bold" style={styles.dupName}>{dup.ragione_sociale}</AppText>
                        {dup.citta ? ` (${dup.citta})` : ""}
                      </AppText>
                    </View>
                    {isAdmin ? (
                      <View style={styles.dupActions}>
                        <Pressable
                          testID={`verify-merge-${item.id}`}
                          onPress={() => onMerge(item)}
                          disabled={mergeMut.isPending}
                          style={({ pressed }) => [styles.mergeBtn, pressed && { opacity: 0.85 }]}
                        >
                          <ArrowsMerge size={16} color={colors.onBrand} weight="bold" />
                          <AppText weight="semibold" style={styles.mergeText}>Unisci</AppText>
                        </Pressable>
                        <Pressable
                          testID={`verify-delete-${item.id}`}
                          onPress={() => onDelete(item)}
                          disabled={deleteMut.isPending}
                          style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }]}
                        >
                          <Trash size={16} color={colors.error} weight="bold" />
                          <AppText weight="semibold" style={styles.deleteText}>Elimina</AppText>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState title="Nessun cliente da verificare" text="Tutti i tuoi clienti sono assegnati e senza duplicati." />
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
  card: {
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, minHeight: 64,
  },
  name: { fontSize: 16, color: c.onSurface },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  meta: { fontSize: 13, color: c.muted },
  meta2: { fontSize: 12, color: c.onSurfaceTertiary },
  assignBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: c.brand, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 36,
  },
  assignBadgeText: { fontSize: 13, color: c.onBrand },
  dupBox: {
    borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surfaceSecondary,
    padding: spacing.md, gap: spacing.sm,
  },
  dupHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  dupText: { flex: 1, fontSize: 12, color: c.onSurfaceSecondary },
  dupName: { color: c.onSurface },
  dupActions: { flexDirection: "row", gap: spacing.sm },
  mergeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: c.brand, borderRadius: radius.md, height: 40,
  },
  mergeText: { fontSize: 14, color: c.onBrand },
  deleteBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.error, borderRadius: radius.md, height: 40,
  },
  deleteText: { fontSize: 14, color: c.error },
  fab: {
    position: "absolute", right: spacing.lg, width: 58, height: 58, borderRadius: radius.pill,
    backgroundColor: c.brand, alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
}));
