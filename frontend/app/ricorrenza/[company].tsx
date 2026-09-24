import { useMemo, useState } from "react";
import { Alert, Pressable, SectionList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowCounterClockwise, CaretLeft, CheckCircle, MagnifyingGlass, Plus, Trash, X } from "phosphor-react-native";

import { apiDelete, apiGet, apiPost, RecurrenceClient, RecurrenceDef, RecurrenceMembers } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function RicorrenzaDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { company } = useLocalSearchParams<{ company: string }>();

  const defsQuery = useQuery({ queryKey: ["recurrences"], queryFn: () => apiGet<RecurrenceDef[]>("/recurrences") });
  const rdef = defsQuery.data?.find((d) => d.company === company) ?? null;
  const periods = rdef?.periods ?? [];

  const [periodKey, setPeriodKey] = useState<string | null>(null);
  const activePeriod = periodKey ?? periods[0]?.key ?? null;
  const [filter, setFilter] = useState<"da_gestire" | "ordine_effettuato">("da_gestire");
  const [search, setSearch] = useState("");

  const membersQuery = useQuery({
    queryKey: ["recurrence-members", company, activePeriod],
    queryFn: () => apiGet<RecurrenceMembers>(`/recurrences/${company}/members?period=${activePeriod}`),
    enabled: !!company && !!activePeriod,
  });

  const order = useMutation({
    mutationFn: (client_id: string) => apiPost(`/recurrences/${company}/order`, { client_id, period: activePeriod }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence-members", company, activePeriod] });
      toast("Ordine registrato", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const undo = useMutation({
    mutationFn: (client_id: string) => apiPost(`/recurrences/${company}/order/undo`, { client_id, period: activePeriod }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence-members", company, activePeriod] });
      toast("Riportato a: da gestire", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const removeMember = useMutation({
    mutationFn: (member_id: string) => apiDelete(`/recurrences/${company}/members/${member_id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recurrence-members", company, activePeriod] });
      toast("Cliente rimosso dalla ricorrenza", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const confirmRemove = (item: RecurrenceClient) => {
    Alert.alert(
      "Rimuovi dalla ricorrenza",
      `Vuoi rimuovere ${item.ragione_sociale} dalla ricorrenza? Il cliente resta in anagrafica, nei giri territoriali e nelle altre ricorrenze.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Rimuovi", style: "destructive", onPress: () => removeMember.mutate(item.member_id) },
      ]
    );
  };

  const { sections, daGestireCount, effettuatiCount } = useMemo(() => {
    const groups = membersQuery.data?.groups ?? [];
    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(search.trim());
    let da = 0;
    let done = 0;
    const secs: { title: string; data: RecurrenceClient[] }[] = [];
    for (const g of groups) {
      let filtered = g.clients.filter((c) => c.recurrence_status === filter);
      if (q) filtered = filtered.filter((c) => norm(c.ragione_sociale).includes(q) || norm(c.citta).includes(q));
      da += g.clients.filter((c) => c.recurrence_status === "da_gestire").length;
      done += g.clients.filter((c) => c.recurrence_status === "ordine_effettuato").length;
      if (filtered.length > 0) secs.push({ title: g.group, data: filtered });
    }
    return { sections: secs, daGestireCount: da, effettuatiCount: done };
  }, [membersQuery.data, filter, search]);

  const searching = search.trim().length > 0;

  if (defsQuery.isLoading || !rdef) return <Loading />;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="ric-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>{rdef.label}</AppText>
        <Pressable
          testID="ric-add"
          onPress={() => router.push(`/ricorrenza/add/${company}`)}
          hitSlop={8}
          style={styles.addBtn}
        >
          <Plus size={20} color={colors.onBrand} weight="bold" />
        </Pressable>
      </View>

      <View style={styles.controls}>
        {periods.length > 1 ? (
          <View style={styles.chipRow}>
            {periods.map((p) => {
              const on = p.key === activePeriod;
              return (
                <Pressable
                  key={p.key}
                  testID={`period-${p.key}`}
                  onPress={() => setPeriodKey(p.key)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={styles.chipRow}>
          <Pressable
            testID="filter-da-gestire"
            onPress={() => setFilter("da_gestire")}
            style={[styles.chip, filter === "da_gestire" && styles.chipOn]}
          >
            <AppText weight="semibold" style={[styles.chipText, filter === "da_gestire" && styles.chipTextOn]}>
              Da gestire ({daGestireCount})
            </AppText>
          </Pressable>
          <Pressable
            testID="filter-effettuati"
            onPress={() => setFilter("ordine_effettuato")}
            style={[styles.chip, filter === "ordine_effettuato" && styles.chipOn]}
          >
            <AppText weight="semibold" style={[styles.chipText, filter === "ordine_effettuato" && styles.chipTextOn]}>
              Effettuati ({effettuatiCount})
            </AppText>
          </Pressable>
        </View>

        <View style={styles.searchField}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="ric-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca cliente per nome o comune…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searching ? (
            <Pressable testID="ric-search-clear" onPress={() => setSearch("")} hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {membersQuery.isLoading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <AppText weight="bold" style={styles.sectionTitle}>{section.title.toUpperCase()}</AppText>
              <View style={styles.countBadge}>
                <AppText weight="bold" style={styles.countText}>{section.data.length}</AppText>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable
                testID={`ric-remove-${item.id}`}
                onPress={() => confirmRemove(item)}
                hitSlop={6}
                style={styles.removeBtn}
              >
                <Trash size={18} color={colors.error} weight="bold" />
              </Pressable>
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.cName} numberOfLines={2}>{item.ragione_sociale}</AppText>
                <AppText style={styles.cMeta} numberOfLines={1}>
                  {item.citta}{item.provincia ? ` (${item.provincia})` : ""}
                </AppText>
                {item.extra?.needs_review ? (
                  <AppText style={styles.review}>⚠︎ Da verificare</AppText>
                ) : null}
                {item.recurrence_status === "ordine_effettuato" ? (
                  <AppText style={styles.doneDate}>Ordine del {fmtDate(item.order_date)}</AppText>
                ) : null}
              </View>
              {item.recurrence_status === "da_gestire" ? (
                <Pressable
                  testID={`order-${item.id}`}
                  disabled={order.isPending}
                  onPress={() => order.mutate(item.id)}
                  style={({ pressed }) => [styles.orderBtn, pressed && { opacity: 0.85 }]}
                >
                  <CheckCircle size={18} color={colors.onBrand} weight="fill" />
                  <AppText weight="semibold" style={styles.orderBtnText}>Ordine effettuato</AppText>
                </Pressable>
              ) : (
                <Pressable
                  testID={`undo-${item.id}`}
                  disabled={undo.isPending}
                  onPress={() => undo.mutate(item.id)}
                  hitSlop={8}
                  style={styles.undoBtn}
                >
                  <ArrowCounterClockwise size={18} color={colors.onSurfaceSecondary} weight="bold" />
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>
                {searching
                  ? "Nessun cliente trovato"
                  : filter === "da_gestire" ? "Nessun cliente da gestire." : "Nessun ordine effettuato."}
              </AppText>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          title="Aggiungi cliente alla ricorrenza"
          testID="ric-add-footer"
          variant="secondary"
          icon={<Plus size={18} color={colors.onBrandSecondary} weight="bold" />}
          onPress={() => router.push(`/ricorrenza/add/${company}`)}
        />
      </View>
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
  headerTitle: { fontSize: 18, color: c.onSurface, flex: 1 },
  addBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  controls: { backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 13, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  searchField: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface, paddingVertical: 0 },
  removeBtn: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceSecondary, paddingVertical: spacing.sm },
  sectionTitle: { fontSize: 12, color: c.onSurfaceTertiary, letterSpacing: 0.5 },
  countBadge: { minWidth: 24, paddingHorizontal: 6, height: 20, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 11, color: c.onBrandSecondary },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md, minHeight: 64,
  },
  cName: { fontSize: 15, color: c.onSurface },
  cMeta: { fontSize: 12, color: c.muted, marginTop: 2 },
  review: { fontSize: 11, color: c.warning, marginTop: 2 },
  doneDate: { fontSize: 12, color: c.success, marginTop: 2 },
  orderBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: c.brand, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44,
  },
  orderBtnText: { fontSize: 13, color: c.onBrand },
  undoBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
  footer: { padding: spacing.lg, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
