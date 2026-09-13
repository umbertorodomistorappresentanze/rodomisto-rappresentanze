import { useState } from "react";
import { FlatList, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { CaretLeft, CheckCircle, DownloadSimple, MapTrifold, Storefront } from "phosphor-react-native";

import { apiGet, exportUrl, Giro, TOKEN_KEY } from "@/src/api";
import { AppText, Button, EmptyState, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { storage } from "@/src/utils/storage";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type MonthCell = { visit: boolean; orders: string[]; collection: boolean };
type StatsRow = { id: string; ragione_sociale: string; citta: string; months: MonthCell[] };
type StatsResp = { giro: { id: string; name: string }; year: number; months: string[]; clients: StatsRow[] };

export default function Statistiche() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const [giroId, setGiroId] = useState<string | null>(null);
  const [year, setYear] = useState(currentYear);
  const [busy, setBusy] = useState(false);

  const statsQuery = useQuery({
    queryKey: ["stats", giroId, year],
    queryFn: () => apiGet<StatsResp>(`/stats/monthly?giro_id=${giroId}&year=${year}`),
    enabled: !!giroId,
  });

  async function download() {
    if (!giroId) { toast("Seleziona un giro", "error"); return; }
    setBusy(true);
    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const url = exportUrl(`/export/monthly?giro_id=${giroId}&year=${year}`);
      const giroName = giriQuery.data?.find((g) => g.id === giroId)?.name ?? "giro";
      const safe = giroName.replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `Riepilogo_${safe}_${year}.xlsx`;
      if (Platform.OS === "web") {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl; a.download = filename; a.click();
        URL.revokeObjectURL(objectUrl);
        toast("Riepilogo scaricato", "success");
      } else {
        const target = `${FileSystem.cacheDirectory}${filename}`;
        const result = await FileSystem.downloadAsync(url, target, { headers: { Authorization: `Bearer ${token}` } });
        if (result.status !== 200) throw new Error();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(result.uri, {
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            dialogTitle: filename,
          });
        }
        toast("Riepilogo pronto", "success");
      }
    } catch {
      toast("Esportazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  if (giriQuery.isLoading) return <Loading />;
  const months = statsQuery.data?.months ?? [];

  const controls = (
    <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
      <AppText style={styles.desc}>Riepilogo mensile: per ogni cliente, mese per mese, visita e ordine (con azienda). Nessun prezzo o quantità.</AppText>
      <View>
        <AppText weight="semibold" style={styles.section}>Giro</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {(giriQuery.data ?? []).map((g) => {
            const active = g.id === giroId;
            return (
              <Pressable key={g.id} testID={`stats-giro-${g.id}`} onPress={() => setGiroId(g.id)} style={[styles.giroChip, active && styles.giroChipActive]}>
                <MapTrifold size={16} color={active ? colors.onBrand : colors.brand} weight="fill" />
                <AppText weight="semibold" style={[styles.giroChipText, active && { color: colors.onBrand }]} numberOfLines={1}>{g.name}</AppText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <View>
        <AppText weight="semibold" style={styles.section}>Anno</AppText>
        <View style={styles.yearRow}>
          {years.map((y) => {
            const active = y === year;
            return (
              <Pressable key={y} testID={`stats-year-${y}`} onPress={() => setYear(y)} style={[styles.yearChip, active && styles.yearChipActive]}>
                <AppText weight="semibold" style={[styles.yearText, active && { color: colors.onBrand }]}>{y}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Button
        title="Scarica Excel"
        testID="download-excel-btn"
        icon={<DownloadSimple size={20} color={colors.onBrand} weight="bold" />}
        loading={busy}
        disabled={!giroId}
        onPress={download}
      />
      {giroId ? <AppText weight="bold" style={styles.section}>Anteprima {year}</AppText> : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="stats-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle}>Statistiche / Esportazione</AppText>
      </View>

      <FlatList
        data={giroId ? (statsQuery.data?.clients ?? []) : []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={controls}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
        renderItem={({ item }) => {
          const active = item.months
            .map((m, i) => ({ m, i }))
            .filter(({ m }) => m.visit || m.orders.length || m.collection);
          return (
            <View style={styles.clientCard} testID={`stats-row-${item.id}`}>
              <AppText weight="semibold" style={styles.clientName} numberOfLines={1}>{item.ragione_sociale}</AppText>
              {active.length === 0 ? (
                <AppText style={styles.noActivity}>Nessuna attività nel {year}</AppText>
              ) : (
                <View style={styles.monthsWrap}>
                  {active.map(({ m, i }) => (
                    <View key={i} style={styles.monthBadge}>
                      <AppText weight="bold" style={styles.monthName}>{months[i]}</AppText>
                      {m.visit ? (
                        <View style={styles.markRow}>
                          <CheckCircle size={13} color={colors.brand} weight="fill" />
                          <AppText style={styles.markText}>Visita</AppText>
                        </View>
                      ) : null}
                      {m.orders.map((o, k) => (
                        <View key={k} style={styles.markRow}>
                          <Storefront size={13} color={colors.brand} weight="fill" />
                          <AppText style={styles.markText} numberOfLines={1}>Ordine: {o}</AppText>
                        </View>
                      ))}
                      {m.collection ? (
                        <View style={styles.markRow}>
                          <AppText style={styles.markText}>€ Incasso</AppText>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          giroId ? (
            statsQuery.isLoading ? <Loading /> : <EmptyState title="Nessun dato" text="Nessun cliente per questo giro." />
          ) : (
            <EmptyState title="Seleziona un giro" text="Scegli un giro e un anno per vedere il riepilogo." />
          )
        }
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
  backBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: c.onSurface },
  desc: { fontSize: 14, color: c.muted },
  section: { fontSize: 15, color: c.onSurface, marginBottom: spacing.sm },
  chipsRow: { gap: spacing.sm, paddingRight: spacing.lg },
  giroChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, flexShrink: 0,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 40, maxWidth: 260,
  },
  giroChipActive: { backgroundColor: c.brand, borderColor: c.brand },
  giroChipText: { fontSize: 13, color: c.onSurface },
  yearRow: { flexDirection: "row", gap: spacing.sm },
  yearChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, minHeight: 44, justifyContent: "center" },
  yearChipActive: { backgroundColor: c.brand },
  yearText: { fontSize: 15, color: c.onSurface },
  clientCard: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.md, gap: spacing.sm },
  clientName: { fontSize: 15, color: c.onSurface },
  noActivity: { fontSize: 13, color: c.muted, fontStyle: "italic" },
  monthsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  monthBadge: { backgroundColor: c.surfaceSecondary, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: 2, minWidth: 120 },
  monthName: { fontSize: 12, color: c.onBrandSecondary },
  markRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  markText: { fontSize: 12, color: c.onSurfaceSecondary, flexShrink: 1 },
}));
