import { useMemo, useRef } from "react";
import { Pressable, RefreshControl, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretRight, ChartBar, MapTrifold, Plus, SunHorizon, Users } from "phosphor-react-native";
import { useCallback } from "react";

import { apiGet, Client, Company, Giro } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, EmptyState, Loading } from "@/src/components/ui";
import { ClientRow } from "@/src/components/client-row";
import { QuickActionsRef, QuickActionsSheet } from "@/src/components/quick-actions-sheet";
import { useToast } from "@/src/components/toast";
import { todayLong } from "@/src/format";
import { useSelectedGiro } from "@/src/selected-giro";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function Dashboard() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { giroId, ready } = useSelectedGiro();
  const sheetRef = useRef<QuickActionsRef>(null);

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const companiesQuery = useQuery({ queryKey: ["companies"], queryFn: () => apiGet<Company[]>("/companies") });
  const selectedGiro = giriQuery.data?.find((g) => g.id === giroId) ?? null;
  const activeGiroId = selectedGiro ? giroId : null;

  const clientsQuery = useQuery({
    queryKey: ["clients", activeGiroId],
    queryFn: () => apiGet<Client[]>(`/clients?giro_id=${activeGiroId}`),
    enabled: !!activeGiroId,
  });

  useFocusEffect(
    useCallback(() => {
      if (activeGiroId) clientsQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeGiroId])
  );

  const sections = useMemo(() => {
    const list = clientsQuery.data ?? [];
    const daVisitare = list.filter((c) => c.status === "da_visitare");
    const gestiti = list.filter((c) => c.status !== "da_visitare");
    const out: { title: string; count: number; data: Client[] }[] = [];
    out.push({ title: "DA VISITARE", count: daVisitare.length, data: daVisitare });
    out.push({ title: "GIÀ VISITATI / GESTITI", count: gestiti.length, data: gestiti });
    return out;
  }, [clientsQuery.data]);

  function onActionSuccess(message: string) {
    toast(message, "success");
    qc.invalidateQueries({ queryKey: ["clients", activeGiroId] });
  }

  const openActions = (c: Client) => sheetRef.current?.present(c);
  const openHistory = (c: Client) => router.push(`/client/${c.id}`);

  if (!ready) return <Loading />;

  return (
    <View style={styles.root}>
      {/* Sticky top header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <View style={styles.dateRow}>
              <SunHorizon size={16} color={colors.brand} weight="fill" />
              <AppText weight="medium" style={styles.date}>{todayLong()}</AppText>
            </View>
            <AppText weight="bold" style={styles.hello}>Ciao, {user?.display_name?.split(" ")[0]}</AppText>
          </View>
          <Pressable testID="new-client-btn" onPress={() => router.push("/client/new")} style={styles.plusBtn}>
            <Plus size={22} color={colors.onBrand} weight="bold" />
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          <Pressable testID="anagrafica-card" onPress={() => router.push("/anagrafica")} style={styles.quickCard}>
            <View style={styles.quickIcon}>
              <Users size={22} color={colors.brand} weight="fill" />
            </View>
            <AppText weight="semibold" style={styles.quickTitle}>Anagrafica</AppText>
            <AppText style={styles.quickSub}>Clienti</AppText>
          </Pressable>
          <Pressable testID="statistiche-card" onPress={() => router.push("/statistiche")} style={styles.quickCard}>
            <View style={styles.quickIcon}>
              <ChartBar size={22} color={colors.brand} weight="fill" />
            </View>
            <AppText weight="semibold" style={styles.quickTitle}>Statistiche</AppText>
            <AppText style={styles.quickSub}>Esportazione</AppText>
          </Pressable>
        </View>

        <AppText weight="bold" style={styles.blockLabel}>GIRO VISITE CLIENTI</AppText>
        <Pressable testID="select-giro-card" onPress={() => router.push("/select-giro")} style={styles.giroCard}>
          <View style={styles.giroIcon}>
            <MapTrifold size={26} color={colors.onBrand} weight="fill" />
          </View>
          <View style={{ flex: 1 }}>
            {selectedGiro ? (
              <>
                <AppText weight="medium" style={styles.giroLabel}>GIRO DI OGGI</AppText>
                <AppText weight="bold" style={styles.giroName} numberOfLines={1}>{selectedGiro.name}</AppText>
              </>
            ) : (
              <AppText weight="bold" style={styles.giroNameEmpty}>SELEZIONA IL GIRO DI OGGI</AppText>
            )}
          </View>
          <CaretRight size={22} color={colors.onBrand} weight="bold" />
        </Pressable>
      </View>

      {!activeGiroId ? (
        <EmptyState
          title="Nessun giro selezionato"
          text="Inizia scegliendo il giro di oggi con il pulsante verde qui sopra."
        />
      ) : clientsQuery.isLoading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
          refreshControl={
            <RefreshControl refreshing={clientsQuery.isFetching} onRefresh={() => clientsQuery.refetch()} tintColor={colors.brand} />
          }
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <AppText weight="bold" style={styles.sectionTitle}>{section.title}</AppText>
              <View style={styles.countBadge}>
                <AppText weight="bold" style={styles.countText}>{section.count}</AppText>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <ClientRow client={item} onActions={openActions} onHistory={openHistory} />
          )}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <AppText style={styles.emptySection}>
                {section.title === "DA VISITARE" ? "Nessun cliente da visitare in questo giro." : "Nessun cliente ancora gestito."}
              </AppText>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState title="Nessun cliente" text="Questo giro non ha ancora clienti assegnati." />
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <QuickActionsSheet
        ref={sheetRef}
        companies={companiesQuery.data ?? []}
        onSuccess={onActionSuccess}
        onError={(m) => toast(m, "error")}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    backgroundColor: c.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    gap: spacing.md,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  quickRow: { flexDirection: "row", gap: spacing.md },
  quickCard: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  quickIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brandSecondary,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.xs,
  },
  quickTitle: { fontSize: 15, color: c.onSurface },
  quickSub: { fontSize: 12, color: c.muted },
  blockLabel: { fontSize: 12, color: c.onSurfaceTertiary, letterSpacing: 0.5, marginTop: spacing.xs },
  dateRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  date: { fontSize: 13, color: c.muted },
  hello: { fontSize: 22, color: c.onSurface, marginTop: 2 },
  plusBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: c.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  giroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: c.brand,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 76,
  },
  giroIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  giroLabel: { fontSize: 11, color: "rgba(255,255,255,0.75)", letterSpacing: 0.5 },
  giroName: { fontSize: 18, color: c.onBrand, marginTop: 2 },
  giroNameEmpty: { fontSize: 17, color: c.onBrand, letterSpacing: 0.3 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    paddingVertical: spacing.sm,
  },
  sectionTitle: { fontSize: 13, color: c.onSurfaceTertiary, letterSpacing: 0.5 },
  countBadge: {
    minWidth: 24,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: c.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 11, color: c.onBrandSecondary },
  emptySection: { fontSize: 13, color: c.muted, paddingVertical: spacing.sm, fontStyle: "italic" },
}));
