import { useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { CaretLeft, CheckCircle, DownloadSimple, MapTrifold } from "phosphor-react-native";

import { apiGet, exportUrl, Giro, TOKEN_KEY } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { storage } from "@/src/utils/storage";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ExportScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();

  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  const [giroId, setGiroId] = useState<string | null>(null);
  const [year, setYear] = useState<number>(currentYear);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!giroId) {
      toast("Seleziona un giro", "error");
      return;
    }
    setBusy(true);
    try {
      const token = await storage.secureGet(TOKEN_KEY, "");
      const url = exportUrl(`/export/monthly?giro_id=${giroId}&year=${year}`);
      const giroName = giriQuery.data?.find((g) => g.id === giroId)?.name ?? "giro";
      const safe = giroName.replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `Riepilogo_${safe}_${year}.xlsx`;

      if (Platform.OS === "web") {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error("download");
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objectUrl);
        toast("Riepilogo scaricato", "success");
      } else {
        const target = `${FileSystem.cacheDirectory}${filename}`;
        const result = await FileSystem.downloadAsync(url, target, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (result.status !== 200) throw new Error("download");
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
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

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="export-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle}>Esporta riepilogo</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <AppText style={styles.desc}>
          Un riepilogo mensile semplice (✓ visita / ✓ ordine / ✓ incasso) dei clienti del giro. Nessun prodotto o importo.
        </AppText>

        <View>
          <AppText weight="semibold" style={styles.section}>Giro</AppText>
          <View style={{ gap: spacing.sm }}>
            {(giriQuery.data ?? []).map((g) => {
              const active = g.id === giroId;
              return (
                <Pressable
                  key={g.id}
                  testID={`export-giro-${g.id}`}
                  onPress={() => setGiroId(g.id)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <MapTrifold size={20} color={active ? colors.brand : colors.muted} weight="fill" />
                  <AppText weight="medium" style={styles.optionText}>{g.name}</AppText>
                  {active ? <CheckCircle size={20} color={colors.brand} weight="fill" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <AppText weight="semibold" style={styles.section}>Anno</AppText>
          <View style={styles.yearRow}>
            {years.map((y) => {
              const active = y === year;
              return (
                <Pressable
                  key={y}
                  testID={`export-year-${y}`}
                  onPress={() => setYear(y)}
                  style={[styles.yearChip, active && styles.yearChipActive]}
                >
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
      </ScrollView>
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
  option: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border,
    padding: spacing.md, minHeight: 56,
  },
  optionActive: { borderColor: c.brand, backgroundColor: c.brandSecondary },
  optionText: { fontSize: 15, color: c.onSurface, flex: 1 },
  yearRow: { flexDirection: "row", gap: spacing.sm },
  yearChip: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, minHeight: 44, justifyContent: "center" },
  yearChipActive: { backgroundColor: c.brand },
  yearText: { fontSize: 15, color: c.onSurface },
}));
