import { useMemo, useRef } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CaretLeft, CaretRight } from "phosphor-react-native";

import { apiGet, Client, Company, Giro, PaymentMode } from "@/src/api";
import { AppText, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { QuickActionsRef, QuickActionsSheet } from "@/src/components/quick-actions-sheet";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Clienti del giro senza azioni reali nel mese corrente, nell'ordine del giro.
 *  Tocca un cliente per aprire le azioni complete (ordine, incasso, ...). */
export default function DaGestireScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const sheetRef = useRef<QuickActionsRef>(null);
  const { id } = useLocalSearchParams<{ id: string }>();

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const giro = giriQuery.data?.find((g) => g.id === id) ?? null;
  const companiesQuery = useQuery({ queryKey: ["companies"], queryFn: () => apiGet<Company[]>("/companies") });
  const paymentModesQuery = useQuery({ queryKey: ["payment-modes"], queryFn: () => apiGet<PaymentMode[]>("/payment-modes") });

  const clientsQuery = useQuery({
    queryKey: ["clients", id],
    queryFn: () => apiGet<Client[]>(`/clients?giro_id=${id}`),
    enabled: !!id,
  });

  const daGestire = useMemo(
    () => (clientsQuery.data ?? []).filter((c) => c.status === "da_visitare"),
    [clientsQuery.data]
  );

  function onActionSuccess(message: string) {
    toast(message, "success");
    qc.invalidateQueries({ queryKey: ["clients", id] });
    qc.invalidateQueries({ queryKey: ["client-search"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["suspensions"] });
    qc.invalidateQueries({ queryKey: ["pending-suspensions"] });
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
            <Pressable
              testID={`da-gestire-row-${item.row_id ?? item.id}`}
              onPress={() => sheetRef.current?.present(item)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.name} numberOfLines={2}>{item.ragione_sociale}</AppText>
                {item.site_nominativo ? <AppText style={styles.sub} numberOfLines={1}>📍 {item.site_nominativo}</AppText> : null}
              </View>
              <CaretRight size={16} color={colors.muted} weight="bold" />
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Tutti i clienti di questo giro sono già stati gestiti questo mese.</AppText>
            </View>
          }
        />
      )}

      <QuickActionsSheet
        ref={sheetRef}
        companies={companiesQuery.data ?? []}
        paymentModes={paymentModesQuery.data ?? []}
        onSuccess={onActionSuccess}
        onError={(m) => toast(m, "error")}
      />
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
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 56,
  },
  name: { fontSize: 15, color: c.onSurface },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic", textAlign: "center" },
}));
