import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ArrowsClockwise, CaretLeft, CheckCircle, Gear, Warning, XCircle } from "phosphor-react-native";

import { apiGet, apiPost, apiPut, GooseConfig, GooseFieldsResp, GooseStatus, GooseTablesResp } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { GooseMandanti } from "@/src/components/goose-mandanti";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const ASSIGN_LABELS: Record<string, string> = {
  field_piva: "Partita IVA",
  field_site: "Codice sede",
  field_company: "Mandante",
  field_number: "N. documento",
  field_date: "Data ordine",
  field_order_id: "ID ordine",
  field_ship: "Indirizzo spedizione",
  field_payment: "Modalità di pagamento",
};
const ASSIGN_KEYS: (keyof import("@/src/api").GooseConfig)[] = [
  "field_piva", "field_site", "field_company", "field_number", "field_date", "field_order_id", "field_ship", "field_payment",
];

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
  const [tables, setTables] = useState<{ name: string; description: string }[] | null>(null);
  const [fieldsFor, setFieldsFor] = useState<string | null>(null);
  const [fields, setFields] = useState<{ name: string; type: string }[] | null>(null);
  const [assignField, setAssignField] = useState<string | null>(null);

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
      const res = await apiGet<GooseTablesResp>("/goose/tables");
      setTables(res.tables ?? []);
      if (!res.tables?.length) {
        toast(`Nessuna tabella riconosciuta. Risposta: ${JSON.stringify(res.raw).slice(0, 150)}`, "error");
      } else {
        toast(`Trovate ${res.tables.length} tabelle`, "success");
      }
    } catch (e: any) {
      const msg = e?.detail || "Scoperta non riuscita";
      setLastError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function selectTable(name: string) {
    setCfg({ ...(config ?? {}), orders_table: name });
    setFieldsFor(name);
    setFields(null);
    setAssignField(null);
    setBusy(true);
    setLastError(null);
    try {
      const res = await apiGet<GooseFieldsResp>(`/goose/structure/${encodeURIComponent(name)}`);
      setFields(res.fields ?? []);
      if (!res.fields?.length) {
        toast(`Nessun campo riconosciuto. Risposta: ${JSON.stringify(res.raw).slice(0, 150)}`, "error");
      }
    } catch (e: any) {
      const msg = e?.detail || "Lettura campi non riuscita";
      setLastError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  function assignTo(key: keyof GooseConfig) {
    if (!assignField) return;
    setCfg({ ...(config ?? {}), [key]: assignField });
    toast(`${assignField} → ${ASSIGN_LABELS[key]}`, "success");
    setAssignField(null);
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
                  1. Premi &quot;Scopri tabelle&quot; per leggere le tabelle reali di GooseApp. 2. Tocca la tabella degli Ordini. 3. Tocca ciascun campo e assegnalo (Partita IVA, codice sede, ecc.). 4. Salva.
                </AppText>

                <Button title={busy ? "Attendi…" : "Scopri tabelle (live)"} variant="ghost" onPress={discoverTables} testID="goose-discover" />

                {/* Elenco tabelle reali */}
                {tables ? (
                  <View style={styles.explorer}>
                    <AppText weight="semibold" style={styles.explorerTitle}>Tabelle ({tables.length})</AppText>
                    {tables.length === 0 ? (
                      <AppText style={styles.hint}>Nessuna tabella. Controlla la whitelist IP e riprova.</AppText>
                    ) : (
                      <View style={styles.chipWrap}>
                        {tables.map((t) => {
                          const on = config.orders_table === t.name;
                          return (
                            <Pressable key={t.name} testID={`goose-table-${t.name}`} onPress={() => selectTable(t.name)} style={[styles.chip, on && styles.chipOn]}>
                              <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{t.name}</AppText>
                              {t.description ? <AppText style={[styles.chipDesc, on && styles.chipTextOn]}>{t.description}</AppText> : null}
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                ) : null}

                {/* Campi della tabella selezionata */}
                {fields && fieldsFor ? (
                  <View style={styles.explorer}>
                    <AppText weight="semibold" style={styles.explorerTitle}>Campi di {fieldsFor} ({fields.length})</AppText>
                    <AppText style={styles.hint}>Tocca un campo per assegnarlo a un&apos;etichetta.</AppText>
                    <View style={styles.chipWrap}>
                      {fields.map((f) => {
                        const assigned = ASSIGN_KEYS.find((k) => config[k] === f.name);
                        const sel = assignField === f.name;
                        return (
                          <Pressable key={f.name} testID={`goose-field-${f.name}`} onPress={() => setAssignField(sel ? null : f.name)} style={[styles.chip, sel && styles.chipOn, !!assigned && styles.chipAssigned]}>
                            <AppText weight="semibold" style={[styles.chipText, sel && styles.chipTextOn]}>{f.name}</AppText>
                            {assigned ? <AppText style={styles.chipDesc}>→ {ASSIGN_LABELS[assigned]}</AppText> : null}
                          </Pressable>
                        );
                      })}
                    </View>
                    {assignField ? (
                      <View style={styles.assignBox}>
                        <AppText weight="semibold" style={styles.assignTitle}>Assegna &quot;{assignField}&quot; a:</AppText>
                        <View style={styles.chipWrap}>
                          {ASSIGN_KEYS.map((k) => (
                            <Pressable key={k} testID={`goose-assign-${k}`} onPress={() => assignTo(k)} style={styles.assignBtn}>
                              <AppText weight="semibold" style={styles.assignBtnText}>{ASSIGN_LABELS[k]}</AppText>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.xs }} />
                <AppText weight="semibold" style={styles.explorerTitle}>Mappatura (modificabile a mano)</AppText>
                <CfgField label="Tabella Ordini" value={config.orders_table ?? ""} onChange={setField("orders_table")} />
                <CfgField label="Campo Partita IVA" value={config.field_piva ?? ""} onChange={setField("field_piva")} />
                <CfgField label="Campo codice sede" value={config.field_site ?? ""} onChange={setField("field_site")} />
                <CfgField label="Campo mandante/azienda" value={config.field_company ?? ""} onChange={setField("field_company")} />
                <CfgField label="Campo numero documento" value={config.field_number ?? ""} onChange={setField("field_number")} />
                <CfgField label="Campo data ordine" value={config.field_date ?? ""} onChange={setField("field_date")} />
                <CfgField label="Campo ID ordine" value={config.field_order_id ?? ""} onChange={setField("field_order_id")} />
                <CfgField label="Campo/i indirizzo spedizione / sede di scarico (separati da virgola)" value={config.field_ship ?? ""} onChange={setField("field_ship")} />
                <CfgField label="Campo modalità di pagamento (attiva i promemoria sospesi)" value={config.field_payment ?? ""} onChange={setField("field_payment")} />
                <CfgField label="Tabella modalità di pagamento (opzionale, se il campo contiene un ID)" value={config.payment_table ?? ""} onChange={setField("payment_table")} />
                <CfgField label="Tabella destinazioni (opzionale, se il campo spedizione è un ID)" value={config.dest_table ?? ""} onChange={setField("dest_table")} />
                <CfgField label="Tabella mandanti (opzionale, rilevata in automatico)" value={config.mandanti_table ?? ""} onChange={setField("mandanti_table")} />
                <Button title="Salva configurazione" onPress={saveConfig} testID="goose-config-save" />
              </View>
            ) : null}
          </View>
        ) : null}

        {isAdmin ? <GooseMandanti /> : null}
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
  explorer: { gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md },
  explorerTitle: { fontSize: 14, color: c.onSurface },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  chipOn: { borderColor: c.brand, backgroundColor: c.brandSecondary },
  chipAssigned: { borderColor: c.success },
  chipText: { fontSize: 13, color: c.onSurface },
  chipTextOn: { color: c.brand },
  chipDesc: { fontSize: 11, color: c.muted },
  assignBox: { gap: spacing.xs, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.sm },
  assignTitle: { fontSize: 13, color: c.onSurface },
  assignBtn: { borderWidth: 1, borderColor: c.brand, backgroundColor: c.brandSecondary, borderRadius: radius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  assignBtnText: { fontSize: 13, color: c.brand },
}));
