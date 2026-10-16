import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowsClockwise, CaretLeft, CheckCircle, Gear, Warning, XCircle } from "phosphor-react-native";

import { apiGet, apiPost, apiPut, GooseConfig, GooseStatus } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function GooseSyncScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const statusQuery = useQuery({ queryKey: ["goose-status"], queryFn: () => apiGet<GooseStatus>("/goose/status") });
  const configQuery = useQuery({
    queryKey: ["goose-config"],
    queryFn: () => apiGet<GooseConfig>("/goose/config"),
    enabled: isAdmin,
  });

  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [cfg, setCfg] = useState<Partial<GooseConfig> | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const config = cfg ?? configQuery.data ?? null;
  const setField = (k: keyof GooseConfig) => (v: string) => setCfg({ ...(config ?? {}), [k]: v });

  async function sync() {
    setBusy(true);
    setLastError(null);
    try {
      const res = await apiPost<GooseStatus["last_result"]>("/goose/sync", {});
      toast(`Importati ${res?.imported ?? 0} ordini`, "success");
      statusQuery.refetch();
    } catch (e: any) {
      const msg = e?.detail || "Sincronizzazione non riuscita";
      setLastError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig() {
    setBusy(true);
    try {
      await apiPut("/goose/config", config ?? {});
      toast("Configurazione salvata", "success");
      configQuery.refetch();
      statusQuery.refetch();
    } catch (e: any) {
      toast(e?.detail || "Salvataggio non riuscito", "error");
    } finally {
      setBusy(false);
    }
  }

  async function discoverTables() {
    setBusy(true);
    setLastError(null);
    try {
      const res = await apiGet<any>("/goose/tables");
      const names = Array.isArray(res?.data) ? res.data : res;
      toast(`Tabelle: ${JSON.stringify(names).slice(0, 120)}`, "success");
    } catch (e: any) {
      const msg = e?.detail || "Scoperta non riuscita";
      setLastError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (statusQuery.isLoading) return <Loading />;
  const st = statusQuery.data;
  const last = st?.last_result;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="goose-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle}>Ordini GooseApp</AppText>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}>
        <AppText style={styles.desc}>
          Importa automaticamente gli ordini registrati su GooseApp associandoli ai clienti (per Partita IVA) e alla sede di scarico corretta.
        </AppText>

        {/* Stato */}
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <AppText weight="medium" style={styles.statusLabel}>Connessione</AppText>
            <View style={styles.badgeWrap}>
              {st?.configured ? (
                <><CheckCircle size={16} color={colors.success} weight="fill" /><AppText style={[styles.badge, { color: colors.success }]}>Configurata</AppText></>
              ) : (
                <><XCircle size={16} color={colors.error} weight="fill" /><AppText style={[styles.badge, { color: colors.error }]}>Mancante</AppText></>
              )}
            </View>
          </View>
          <View style={styles.statusRow}>
            <AppText weight="medium" style={styles.statusLabel}>Mappatura ordini</AppText>
            <View style={styles.badgeWrap}>
              {st?.ready ? (
                <><CheckCircle size={16} color={colors.success} weight="fill" /><AppText style={[styles.badge, { color: colors.success }]}>Pronta</AppText></>
              ) : (
                <><Warning size={16} color={colors.warning} weight="fill" /><AppText style={[styles.badge, { color: colors.warning }]}>Da configurare</AppText></>
              )}
            </View>
          </View>
          {st?.last_sync_at ? (
            <AppText style={styles.lastSync}>Ultima sincronizzazione: {new Date(st.last_sync_at).toLocaleString("it-IT")}</AppText>
          ) : (
            <AppText style={styles.lastSync}>Nessuna sincronizzazione effettuata.</AppText>
          )}
        </View>

        <Pressable testID="goose-sync-btn" disabled={busy} onPress={sync} style={({ pressed }) => [styles.syncBtn, (pressed || busy) && { opacity: 0.85 }]}>
          <ArrowsClockwise size={20} color={colors.onBrand} weight="bold" />
          <AppText weight="bold" style={styles.syncText}>{busy ? "Sincronizzazione…" : "Sincronizza ora"}</AppText>
        </Pressable>

        {lastError ? (
          <View testID="goose-error" style={styles.errorCard}>
            <View style={styles.errorHead}>
              <Warning size={18} color={colors.error} weight="fill" />
              <AppText weight="bold" style={styles.errorTitle}>Errore di sincronizzazione</AppText>
            </View>
            <AppText selectable style={styles.errorMsg}>{lastError}</AppText>
          </View>
        ) : null}

        {/* Esito ultima sincronizzazione */}
        {last ? (
          <View style={styles.card}>
            <AppText weight="bold" style={styles.cardTitle}>Esito ultima sincronizzazione</AppText>
            <View style={styles.resRow}><AppText style={styles.resLabel}>Importati</AppText><AppText weight="bold" style={[styles.resVal, { color: colors.success }]}>{last.imported}</AppText></View>
            <View style={styles.resRow}><AppText style={styles.resLabel}>Duplicati saltati</AppText><AppText weight="bold" style={styles.resVal}>{last.skipped_duplicates}</AppText></View>
            <View style={styles.resRow}><AppText style={styles.resLabel}>Non associati (P.IVA)</AppText><AppText weight="bold" style={[styles.resVal, { color: last.unmatched.length ? colors.warning : colors.onSurface }]}>{last.unmatched.length}</AppText></View>
            <View style={styles.resRow}><AppText style={styles.resLabel}>Errori</AppText><AppText weight="bold" style={[styles.resVal, { color: last.errors.length ? colors.error : colors.onSurface }]}>{last.errors.length}</AppText></View>
            {last.unmatched.length > 0 ? (
              <View style={styles.subList}>
                <AppText weight="semibold" style={styles.subTitle}>P.IVA non in anagrafica:</AppText>
                {last.unmatched.slice(0, 20).map((u, i) => (
                  <AppText key={i} style={styles.subItem}>• {u.partita_iva || "(vuota)"} — ordine {u.order_id}</AppText>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Configurazione (solo admin) */}
        {isAdmin ? (
          <View style={styles.card}>
            <Pressable testID="goose-config-toggle" onPress={() => setShowConfig((v) => !v)} style={styles.configHead}>
              <Gear size={18} color={colors.brand} weight="bold" />
              <AppText weight="bold" style={styles.cardTitle}>Configurazione campi (admin)</AppText>
            </Pressable>
            {showConfig && config ? (
              <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
                <AppText style={styles.hint}>
                  Imposta il nome della tabella Ordini di GooseApp e i nomi dei campi. Usa &quot;Scopri tabelle&quot; dopo aver abilitato gli IP di Render nella whitelist GooseApp.
                </AppText>
                <CfgField label="Tabella Ordini" value={config.orders_table ?? ""} onChange={setField("orders_table")} />
                <CfgField label="Campo Partita IVA" value={config.field_piva ?? ""} onChange={setField("field_piva")} />
                <CfgField label="Campo codice sede" value={config.field_site ?? ""} onChange={setField("field_site")} />
                <CfgField label="Campo mandante/azienda" value={config.field_company ?? ""} onChange={setField("field_company")} />
                <CfgField label="Campo numero documento" value={config.field_number ?? ""} onChange={setField("field_number")} />
                <CfgField label="Campo data ordine" value={config.field_date ?? ""} onChange={setField("field_date")} />
                <CfgField label="Campo ID ordine" value={config.field_order_id ?? ""} onChange={setField("field_order_id")} />
                <Button title="Salva configurazione" onPress={saveConfig} testID="goose-config-save" />
                <Button title="Scopri tabelle (live)" variant="ghost" onPress={discoverTables} testID="goose-discover" />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function CfgField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <AppText weight="medium" style={styles.cfgLabel}>{label}</AppText>
      <TextInput value={value} onChangeText={onChange} autoCapitalize="characters" autoCorrect={false} placeholderTextColor={colors.muted} style={styles.cfgInput} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  backBtn: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, color: c.onSurface },
  desc: { fontSize: 14, color: c.muted, lineHeight: 20 },
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  cardTitle: { fontSize: 15, color: c.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statusLabel: { fontSize: 14, color: c.onSurfaceTertiary },
  badgeWrap: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  badge: { fontSize: 13, fontFamily: "PlusJakarta-SemiBold" },
  lastSync: { fontSize: 12, color: c.muted, marginTop: spacing.xs },
  syncBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: c.brand, borderRadius: radius.md, minHeight: 52 },
  syncText: { fontSize: 16, color: c.onBrand },
  errorCard: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.error, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  errorHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  errorTitle: { fontSize: 14, color: c.error },
  errorMsg: { fontSize: 13, color: c.onSurface, lineHeight: 19 },
  resRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resLabel: { fontSize: 14, color: c.onSurfaceTertiary },
  resVal: { fontSize: 16, color: c.onSurface },
  subList: { marginTop: spacing.xs, gap: 2 },
  subTitle: { fontSize: 13, color: c.onSurface },
  subItem: { fontSize: 12, color: c.muted },
  configHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  hint: { fontSize: 12, color: c.muted, lineHeight: 18 },
  cfgLabel: { fontSize: 13, color: c.onSurfaceTertiary, marginBottom: spacing.xs },
  cfgInput: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface },
}));
