import { useMemo, useState } from "react";
import { Pressable, ScrollView, SectionList, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretLeft, MagnifyingGlass, X } from "phosphor-react-native";

import { Activity, apiGet, Company } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Loading } from "@/src/components/ui";
import { ActivityRow } from "@/src/components/updates-panel";
import { dayGroupLabel, dayKey } from "@/src/format";
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
  const [producer, setProducer] = useState<string>("all");
  const [search, setSearch] = useState("");
  // Periodo: "all" | "custom" | "YYYY-MM". range in formato 'YYYY-MM-DD' (o null = aperto).
  const [periodSel, setPeriodSel] = useState<string>("all");
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [customErr, setCustomErr] = useState<string | null>(null);

  // Ultimi 12 mesi come opzioni selezionabili.
  const months = useMemo(() => {
    const names = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
    const out: { key: string; label: string; from: string; to: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const mm = String(m + 1).padStart(2, "0");
      const last = new Date(y, m + 1, 0).getDate();
      out.push({
        key: `${y}-${mm}`,
        label: `${names[m]} ${String(y).slice(2)}`,
        from: `${y}-${mm}-01`,
        to: `${y}-${mm}-${String(last).padStart(2, "0")}`,
      });
    }
    return out;
  }, []);

  function selectMonth(m: { key: string; from: string; to: string }) {
    setPeriodSel(m.key);
    setShowCustom(false);
    setRange({ from: m.from, to: m.to });
  }
  function selectAll() {
    setPeriodSel("all");
    setShowCustom(false);
    setRange({ from: null, to: null });
  }
  function applyCustom() {
    const toIso = (s: string): string | null => {
      const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!m) return null;
      const [, dd, mm, yyyy] = m;
      const d = Number(dd), mo = Number(mm);
      if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
      return `${yyyy}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    };
    const f = customFrom.trim() ? toIso(customFrom) : null;
    const t = customTo.trim() ? toIso(customTo) : null;
    if ((customFrom.trim() && !f) || (customTo.trim() && !t)) {
      setCustomErr("Usa il formato GG/MM/AAAA");
      return;
    }
    if (!f && !t) {
      setCustomErr("Inserisci almeno una data");
      return;
    }
    if (f && t && f > t) {
      setCustomErr("La data iniziale è successiva a quella finale");
      return;
    }
    setCustomErr(null);
    setPeriodSel("custom");
    setRange({ from: f, to: t });
  }

  const dateQS = `${range.from ? `&from_date=${range.from}` : ""}${range.to ? `&to_date=${range.to}` : ""}`;

  const query = useQuery({
    queryKey: ["activities", scope, type, 1000, range.from, range.to],
    queryFn: () => apiGet<Activity[]>(`/activities?scope=${scope}&type=${type}&limit=1000${dateQS}`),
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiGet<Company[]>(`/companies`),
  });

  // Produttori presenti nelle attività caricate (per non mostrare chip inutili).
  const producerOptions = useMemo(() => {
    const present = new Set<string>();
    for (const a of query.data ?? []) if (a.company_name) present.add(a.company_name);
    const ordered = (companiesQuery.data ?? [])
      .map((c) => c.name)
      .filter((n) => present.has(n));
    // Includi eventuali produttori presenti nelle attività ma non in anagrafica aziende.
    for (const n of present) if (!ordered.includes(n)) ordered.push(n);
    return ordered;
  }, [query.data, companiesQuery.data]);

  // Raggruppa per giorno preservando l'ordine cronologico (già desc dal backend).
  const sections = useMemo(() => {
    const norm = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const q = norm(search.trim());
    const acts = (query.data ?? []).filter((a) => {
      if (producer !== "all" && a.company_name !== producer) return false;
      if (q && !(norm(a.client_ragione_sociale).includes(q) || norm(a.citta).includes(q))) return false;
      return true;
    });
    const secs: { title: string; key: string; data: Activity[] }[] = [];
    const idx: Record<string, number> = {};
    for (const a of acts) {
      const k = dayKey(a.created_at);
      if (idx[k] === undefined) {
        idx[k] = secs.length;
        secs.push({ title: dayGroupLabel(a.created_at), key: k, data: [] });
      }
      secs[idx[k]].data.push(a);
    }
    return secs;
  }, [query.data, producer, search]);

  const searching = search.trim().length > 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="storico-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.title}>Storico attività</AppText>
      </View>

      <View style={styles.controls}>
        <View style={styles.searchField}>
          <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
          <TextInput
            testID="sto-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Cerca cliente per nome o comune…"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {searching ? (
            <Pressable testID="sto-search-clear" onPress={() => setSearch("")} hitSlop={8}>
              <X size={18} color={colors.muted} weight="bold" />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.producerRow}
        >
          <Pressable testID="sto-period-all" onPress={selectAll} style={[styles.chip, periodSel === "all" && styles.chipOn]}>
            <AppText weight="semibold" style={[styles.chipText, periodSel === "all" && styles.chipTextOn]}>Tutto il periodo</AppText>
          </Pressable>
          <Pressable
            testID="sto-period-custom"
            onPress={() => { setShowCustom((v) => !v); }}
            style={[styles.chip, periodSel === "custom" && styles.chipOn]}
          >
            <AppText weight="semibold" style={[styles.chipText, periodSel === "custom" && styles.chipTextOn]}>Personalizzato</AppText>
          </Pressable>
          {months.map((m) => {
            const on = periodSel === m.key;
            return (
              <Pressable key={m.key} testID={`sto-month-${m.key}`} onPress={() => selectMonth(m)} style={[styles.chip, on && styles.chipOn]}>
                <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{m.label}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>

        {showCustom ? (
          <View style={styles.customBox}>
            <View style={styles.customRow}>
              <View style={styles.customField}>
                <AppText style={styles.customLabel}>Da</AppText>
                <TextInput
                  testID="sto-custom-from"
                  value={customFrom}
                  onChangeText={setCustomFrom}
                  placeholder="GG/MM/AAAA"
                  placeholderTextColor={colors.muted}
                  style={styles.customInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.customField}>
                <AppText style={styles.customLabel}>A</AppText>
                <TextInput
                  testID="sto-custom-to"
                  value={customTo}
                  onChangeText={setCustomTo}
                  placeholder="GG/MM/AAAA"
                  placeholderTextColor={colors.muted}
                  style={styles.customInput}
                  keyboardType="numbers-and-punctuation"
                  autoCorrect={false}
                />
              </View>
              <Pressable testID="sto-custom-apply" onPress={applyCustom} style={styles.applyBtn}>
                <AppText weight="bold" style={styles.applyText}>Applica</AppText>
              </Pressable>
            </View>
            {customErr ? <AppText style={styles.customErr}>{customErr}</AppText> : null}
          </View>
        ) : null}

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

        {producerOptions.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.producerRow}
          >
            <Pressable testID="sto-prod-all" onPress={() => setProducer("all")} style={[styles.chip, producer === "all" && styles.chipOn]}>
              <AppText weight="semibold" style={[styles.chipText, producer === "all" && styles.chipTextOn]}>Tutti i produttori</AppText>
            </Pressable>
            {producerOptions.map((name) => {
              const on = producer === name;
              return (
                <Pressable key={name} testID={`sto-prod-${name}`} onPress={() => setProducer(name)} style={[styles.chip, on && styles.chipOn]}>
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{name}</AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

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
        <SectionList
          sections={sections}
          keyExtractor={(a) => a.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeader}>
              <AppText weight="bold" style={styles.dayHeaderText}>{section.title}</AppText>
            </View>
          )}
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
  searchField: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surfaceTertiary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface, paddingVertical: 0 },
  producerRow: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.lg },
  customBox: { gap: spacing.xs },
  customRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  customField: { flex: 1, gap: 2 },
  customLabel: { fontSize: 11, color: c.onSurfaceTertiary, letterSpacing: 0.3 },
  customInput: {
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44,
    fontFamily: "PlusJakarta-Medium", fontSize: 14, color: c.onSurface,
  },
  applyBtn: { backgroundColor: c.brand, borderRadius: radius.md, paddingHorizontal: spacing.lg, height: 44, alignItems: "center", justifyContent: "center" },
  applyText: { fontSize: 14, color: c.onBrand },
  customErr: { fontSize: 12, color: c.error },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
  dayHeader: { backgroundColor: c.surfaceSecondary, paddingTop: spacing.md, paddingBottom: spacing.xs },
  dayHeaderText: { fontSize: 13, color: c.onSurfaceTertiary, letterSpacing: 0.3 },
}));
