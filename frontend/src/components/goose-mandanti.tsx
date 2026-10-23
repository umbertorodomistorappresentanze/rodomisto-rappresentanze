import { useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, MagicWand, Storefront, Warning } from "phosphor-react-native";

import { apiGet, apiPost, apiPut, Company, GooseAutoResult, GooseMandante } from "@/src/api";
import { AppText, Button } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** Tabella di conversione Codici Mandante GooseApp (IDMAN) -> Azienda. */
export function GooseMandanti() {
  const styles = useStyles();
  const { colors } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const listQuery = useQuery({ queryKey: ["goose-mandanti"], queryFn: () => apiGet<GooseMandante[]>("/goose/mandanti") });
  const compQuery = useQuery({ queryKey: ["companies"], queryFn: () => apiGet<Company[]>("/companies") });
  const rows = listQuery.data ?? [];
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const companies = (compQuery.data ?? []).filter((c) => !q.trim() || norm(c.name).includes(norm(q.trim())));

  function refresh() {
    listQuery.refetch();
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["history"] });
  }

  async function assign(code: string, company_id: string | null) {
    setBusy(true);
    try {
      const r = await apiPut<{ updated_orders: number }>("/goose/mandanti", { code, company_id });
      toast(`Mandante salvato · ${r.updated_orders} ordini aggiornati`, "success");
      setOpenCode(null);
      setQ("");
      refresh();
    } catch (e: any) {
      toast(e?.detail || "Salvataggio non riuscito", "error");
    } finally {
      setBusy(false);
    }
  }

  async function autoDetect() {
    setBusy(true);
    try {
      const r = await apiPost<GooseAutoResult>("/goose/mandanti/auto", {});
      if (!r.table) {
        toast(`Nessuna tabella mandanti trovata${r.candidates.length ? ` (provate: ${r.candidates.join(", ")})` : ""}. Associa i codici a mano.`, "error");
      } else {
        toast(`Tabella ${r.table}: ${r.mapped.length} associati, ${r.named_only.length} con nome GooseApp, ${r.unresolved.length} da associare`, "success");
      }
      refresh();
    } catch (e: any) {
      toast(e?.detail || "Rilevamento non riuscito", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card} testID="goose-mandanti">
      <AppText weight="bold" style={styles.title}>Codici Mandante GooseApp</AppText>
      <AppText style={styles.hint}>
        Ogni codice mandante (IDMAN) degli ordini viene convertito nel nome dell&apos;azienda. Usa il rilevamento automatico oppure tocca un codice per associarlo a mano: gli ordini già importati vengono aggiornati subito.
      </AppText>
      <Button title={busy ? "Attendi…" : "Rileva automaticamente da GooseApp"} variant="ghost" onPress={autoDetect} testID="goose-mandanti-auto"
        icon={<MagicWand size={18} color={colors.brand} weight="bold" />} />

      {rows.length === 0 ? (
        <AppText style={styles.hint}>Nessun codice mandante negli ordini importati.</AppText>
      ) : rows.map((r) => {
        const open = openCode === r.code;
        return (
          <View key={r.code} style={styles.row}>
            <Pressable testID={`mandante-${r.code}`} onPress={() => { setOpenCode(open ? null : r.code); setQ(""); }} style={styles.rowHead}>
              {r.company_id
                ? <CheckCircle size={18} color={colors.success} weight="fill" />
                : <Warning size={18} color={colors.warning} weight="fill" />}
              <View style={{ flex: 1 }}>
                <AppText weight="semibold" style={styles.code} selectable>{r.code}</AppText>
                <AppText style={styles.sub}>
                  {r.company_name ? `→ ${r.company_name}` : r.goose_name ? `GooseApp: ${r.goose_name} · da associare` : "Da associare"} · {r.orders} ordini
                </AppText>
              </View>
            </Pressable>
            {open ? (
              <View style={styles.picker}>
                <TextInput
                  testID="mandante-search"
                  value={q}
                  onChangeText={setQ}
                  placeholder="Cerca azienda..."
                  placeholderTextColor={colors.muted}
                  autoCorrect={false}
                  style={styles.input}
                />
                <View style={styles.chips}>
                  {companies.map((c) => {
                    const on = c.id === r.company_id;
                    return (
                      <Pressable key={c.id} disabled={busy} testID={`mandante-pick-${c.id}`} onPress={() => assign(r.code, c.id)} style={[styles.chip, on && styles.chipOn]}>
                        <Storefront size={14} color={on ? colors.onBrand : colors.brand} weight="bold" />
                        <AppText weight="semibold" style={[styles.chipText, on && { color: colors.onBrand }]}>{c.name}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
                {r.company_id ? (
                  <Pressable onPress={() => assign(r.code, null)} testID="mandante-clear">
                    <AppText weight="semibold" style={styles.clear}>Rimuovi associazione</AppText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  title: { fontSize: 15, color: c.onSurface },
  hint: { fontSize: 12, color: c.muted, lineHeight: 18 },
  row: { borderTopWidth: 1, borderTopColor: c.divider, paddingTop: spacing.sm, gap: spacing.sm },
  rowHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
  code: { fontSize: 14, color: c.onSurface },
  sub: { fontSize: 12, color: c.muted },
  picker: { gap: spacing.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.sm },
  input: { borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44, fontFamily: "PlusJakarta-Medium", fontSize: 15, color: c.onSurface },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md, minHeight: 36 },
  chipOn: { backgroundColor: c.brand, borderColor: c.brand },
  chipText: { fontSize: 13, color: c.onSurface },
  clear: { fontSize: 13, color: c.error, paddingVertical: spacing.xs },
}));
