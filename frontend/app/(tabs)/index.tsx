import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, SectionList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { CaretRight, ChartBar, MagnifyingGlass, MapTrifold, Plus, SunHorizon, Users, WarningCircle, X } from "phosphor-react-native";

import { apiGet, Client, Company, Giro, PaymentMode, Suspension } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, EmptyState, Loading } from "@/src/components/ui";
import { ClientRow } from "@/src/components/client-row";
import { QuickActionsRef, QuickActionsSheet } from "@/src/components/quick-actions-sheet";
import { UpdatesPanel } from "@/src/components/updates-panel";
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
  const isAdmin = user?.role === "admin";
  const { giroId, ready } = useSelectedGiro();
  const sheetRef = useRef<QuickActionsRef>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const companiesQuery = useQuery({ queryKey: ["companies"], queryFn: () => apiGet<Company[]>("/companies") });
  const paymentModesQuery = useQuery({ queryKey: ["payment-modes"], queryFn: () => apiGet<PaymentMode[]>("/payment-modes") });
  const suspensionsQuery = useQuery({ queryKey: ["suspensions", "all"], queryFn: () => apiGet<Suspension[]>("/suspensions?scope=all") });
  const susOverdue = (suspensionsQuery.data ?? []).filter((s) => s.kind === "overdue").length;
  const susSoon = (suspensionsQuery.data ?? []).filter((s) => s.kind === "due_soon").length;
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

  const searching = search.trim().length > 0;

  const searchQuery = useQuery({
    queryKey: ["client-search", debounced],
    queryFn: () => apiGet<Client[]>(`/clients/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });

  const sections = useMemo(() => {
    if (searching) {
      const found = searchQuery.data ?? [];
      return [{ title: "RISULTATI", count: found.length, data: found }];
    }
    const list = clientsQuery.data ?? [];
    const daVisitare = list.filter((c) => c.status === "da_visitare");
    const gestiti = list.filter((c) => c.status !== "da_visitare");
    const out: { title: string; count: number; data: Client[] }[] = [];
    out.push({ title: "DA VISITARE", count: daVisitare.length, data: daVisitare });
    out.push({ title: "GIÀ VISITATI / GESTITI", count: gestiti.length, data: gestiti });
    return out;
  }, [clientsQuery.data, searching, searchQuery.data]);

  function onActionSuccess(message: string) {
    toast(message, "success");
    qc.invalidateQueries({ queryKey: ["clients", activeGiroId] });
    qc.invalidateQueries({ queryKey: ["client-search"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["suspensions"] });
    qc.invalidateQueries({ queryKey: ["pending-suspensions"] });
  }

  const openActions = (c: Client) => sheetRef.current?.present(c);
  const openHistory = (c: Client) => router.push(`/client/${c.id}`);

  const displaySections = searching
    ? (searchQuery.isLoading ? [] : sections)
    : (!activeGiroId || clientsQuery.isLoading ? [] : sections);

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

        {activeGiroId && !searching ? (
          <AppText weight="bold" style={styles.blockLabel}>GIRO VISITE CLIENTI</AppText>
        ) : null}
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

        <View style={styles.searchField}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="giro-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca qualsiasi cliente (anche fuori giro)…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? (
            <Pressable testID="giro-search-clear" onPress={() => setSearch("")} hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={displaySections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.sm }}
        refreshControl={
          <RefreshControl
            refreshing={clientsQuery.isFetching}
            onRefresh={() => {
              if (activeGiroId) clientsQuery.refetch();
              qc.invalidateQueries({ queryKey: ["activities"] });
            }}
            tintColor={colors.brand}
          />
        }
        ListHeaderComponent={
          <>
            {!searching && (susOverdue + susSoon) > 0 ? (
              <Pressable testID="sospesi-alert" onPress={() => router.push("/sospesi")} style={styles.sosCard}>
                <View style={styles.sosIcon}>
                  <WarningCircle size={22} color={colors.error} weight="fill" />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText weight="bold" style={styles.sosTitle}>Promemoria sospesi</AppText>
                  <AppText style={styles.sosSub}>
                    {susOverdue > 0 ? `${susOverdue} da incassare` : ""}
                    {susOverdue > 0 && susSoon > 0 ? " · " : ""}
                    {susSoon > 0 ? `${susSoon} in scadenza` : ""}
                  </AppText>
                </View>
                <CaretRight size={20} color={colors.error} weight="bold" />
              </Pressable>
            ) : null}
            {!searching ? <UpdatesPanel isAdmin={isAdmin} /> : null}
            {activeGiroId && !searching && (clientsQuery.data?.length ?? 0) > 0 ? (
              <View style={styles.summaryCard}>
                <View style={styles.summaryItem}>
                  <AppText weight="bold" style={styles.summaryNumber}>{sections[0].count}</AppText>
                  <AppText weight="medium" style={styles.summaryLabel}>Da visitare</AppText>
                </View>
                <View style={styles.summaryDivider} />
                <Pressable
                  testID="giro-gestiti-btn"
                  onPress={() => router.push(`/gestiti/${activeGiroId}`)}
                  style={styles.summaryItem}
                >
                  <AppText weight="bold" style={[styles.summaryNumber, { color: colors.muted }]}>{sections[1].count}</AppText>
                  <View style={styles.gestitiLabelRow}>
                    <AppText weight="medium" style={styles.summaryLabel}>Gestiti</AppText>
                    <CaretRight size={13} color={colors.brand} weight="bold" />
                  </View>
                </Pressable>
              </View>
            ) : null}
          </>
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
              {searching
                ? "Nessun cliente trovato"
                : section.title === "DA VISITARE"
                ? "Nessun cliente da visitare in questo giro."
                : "Nessun cliente ancora gestito."}
            </AppText>
          ) : null
        }
        ListEmptyComponent={
          searching ? (
            searchQuery.isLoading ? <Loading /> : (
              <EmptyState title="Nessun cliente trovato" text="Prova con un altro nome o comune." />
            )
          ) : !activeGiroId ? (
            <EmptyState
              title="Nessun giro selezionato"
              text="Scegli il giro di oggi con il pulsante verde qui sopra, oppure cerca un cliente qualsiasi con la barra di ricerca."
            />
          ) : clientsQuery.isLoading ? (
            <Loading />
          ) : (
            <EmptyState title="Nessun cliente" text="Questo giro non ha ancora clienti assegnati." />
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      />

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
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface, paddingVertical: 0 },
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
  summaryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  gestitiLabelRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  summaryNumber: { fontSize: 26, color: c.brand },
  summaryLabel: { fontSize: 12, color: c.muted },
  summaryDivider: { width: 1, alignSelf: "stretch", backgroundColor: c.border, marginVertical: spacing.xs },
  sosCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.error,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, minHeight: 60,
  },
  sosIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  sosTitle: { fontSize: 15, color: c.onSurface },
  sosSub: { fontSize: 12, color: c.error, marginTop: 1 },
}));
