import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, CheckCircle } from "phosphor-react-native";

import { apiGet, apiPost, Client, Giro } from "@/src/api";
import { AppText, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Clienti del giro senza attività nel mese corrente, nell'ordine del giro. */
export default function DaGestireScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [busyId, setBusyId] = useState<string | null>(null);

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const giro = giriQuery.data?.find((g) => g.id === id) ?? null;

  const clientsQuery = useQuery({
    queryKey: ["clients", id],
    queryFn: () => apiGet<Client[]>(`/clients?giro_id=${id}`),
    enabled: !!id,
  });

  const daGestire = useMemo(
    () => (clientsQuery.data ?? []).filter((c) => c.status === "da_visitare"),
    [clientsQuery.data]
  );

  async function markHandled(c: Client) {
    setBusyId(c.id);
    try {
      await apiPost("/events", {
        client_id: c.id,
        type: "visit",
        note_text: "Visita/Chiamata senza ordine",
        ...(c.site_id ? { site_id: c.site_id, site_nominativo: c.site_nominativo || null } : {}),
      });
      toast(`${c.ragione_sociale} segnato come gestito`, "success");
      await clientsQuery.refetch();
      qc.invalidateQueries({ queryKey: ["clients", id] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="da-gestire-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" style={styles.title}>{daGestire.length} Da gestire</AppText>
          {giro ? <AppText style={styles.sub} numberOfLines={1}>{giro.name}</AppText> : null}
        </View>
      </View>

      {clientsQuery.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          data={daGestire}
          keyExtractor={(c) => c.row_id ?? c.id}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }}
          renderItem={({ item }) => (
            <View style={styles.row} testID={`da-gestire-row-${item.id}`}>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={2}>{item.ragione_sociale}</AppText>
                {item.site_nominativo ? <AppText style={styles.sub} numberOfLines={1}>📍 {item.site_nominativo}</AppText> : null}
              </View>
              <Pressable
                testID={`mark-gestito-${item.id}`}
                accessibilityLabel="Segna come gestito: visita o chiamata senza ordine"
                disabled={busyId !== null}
                onPress={() => markHandled(item)}
                style={({ pressed }) => [styles.markBtn, pressed && { opacity: 0.7 }]}
              >
                {busyId === item.id ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <CheckCircle size={18} color={colors.brand} weight="bold" />
                )}
                <AppText weight="semibold" style={styles.markText}>Gestito</AppText>
              </Pressable>
            </View>
          )}
          ListHeaderComponent={
            daGestire.length > 0 ? (
              <AppText style={styles.hint}>Tocca “Gestito” per registrare una visita/chiamata senza ordine nel mese corrente.</AppText>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Tutti i clienti di questo giro sono già stati gestiti questo mese.</AppText>
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
  backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, color: c.onSurface },
  sub: { fontSize: 13, color: c.muted, marginTop: 1 },
  hint: { fontSize: 12, color: c.muted, marginBottom: spacing.xs },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.sm, minHeight: 56,
  },
  name: { flex: 1, fontSize: 15, color: c.onSurface },
  markBtn: {
    flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: spacing.md,
    borderRadius: radius.pill, backgroundColor: c.brandSecondary, borderWidth: 1, borderColor: c.brand,
  },
  markText: { fontSize: 13, color: c.brand },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic", textAlign: "center" },
}));
