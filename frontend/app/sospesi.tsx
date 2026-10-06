import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, SectionList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { CaretLeft, WarningCircle, Clock, CurrencyEur, PencilSimple, Trash, X } from "phosphor-react-native";

import { apiDelete, apiGet, apiPost, apiPut, Company, PaymentMode, Suspension } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Button, Loading } from "@/src/components/ui";
import { ActivityDateField, toISODate } from "@/src/components/activity-date-field";
import { useToast } from "@/src/components/toast";
import { dmyDate } from "@/src/format";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Scope = "all" | "umberto" | "andrea";
type Method = "contanti" | "bonifico" | "assegno";

const SCOPE_OPTIONS: { key: Scope; label: string }[] = [
  { key: "all", label: "Tutti" },
  { key: "umberto", label: "Umberto" },
  { key: "andrea", label: "Andrea" },
];

const METHOD_OPTIONS: { key: Method; label: string }[] = [
  { key: "contanti", label: "Contanti" },
  { key: "bonifico", label: "Bonifico" },
  { key: "assegno", label: "Assegno / Titolo" },
];

const AGENT_SHORT: Record<string, string> = { umberto: "Umberto", andrea: "Andrea" };

export default function SospesiScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const [scope, setScope] = useState<Scope>("all");

  // Incasso modal state
  const [target, setTarget] = useState<Suspension | null>(null);
  const [collectDate, setCollectDate] = useState<Date>(new Date());
  const [method, setMethod] = useState<Method | null>(null);
  const [bonificoDate, setBonificoDate] = useState<Date>(new Date());
  const [busy, setBusy] = useState(false);

  // Modifica termini / Elimina
  const [editItem, setEditItem] = useState<Suspension | null>(null);
  const [editMode, setEditMode] = useState<string | null>(null);
  const [deleteItem, setDeleteItem] = useState<Suspension | null>(null);

  const query = useQuery({
    queryKey: ["suspensions", scope],
    queryFn: () => apiGet<Suspension[]>(`/suspensions?scope=${scope}`),
  });

  const companiesQuery = useQuery({
    queryKey: ["companies"],
    queryFn: () => apiGet<Company[]>("/companies"),
  });

  const paymentModesQuery = useQuery({
    queryKey: ["payment-modes"],
    queryFn: () => apiGet<PaymentMode[]>("/payment-modes"),
  });

  const sections = useMemo(() => {
    const data = query.data ?? [];
    const overdue = data.filter((s) => s.kind === "overdue");
    const soon = data.filter((s) => s.kind === "due_soon");
    const secs: { title: string; kind: string; data: Suspension[] }[] = [];
    if (overdue.length) secs.push({ title: "SOSPESI DA INCASSARE", kind: "overdue", data: overdue });
    if (soon.length) secs.push({ title: "INCASSI IN SCADENZA", kind: "due_soon", data: soon });
    return secs;
  }, [query.data]);

  function openCollect(item: Suspension) {
    setTarget(item);
    setCollectDate(new Date());
    setMethod(null);
    setBonificoDate(new Date());
  }

  async function confirmCollect() {
    if (!target || busy) return;
    const companyId =
      target.company_id ||
      (companiesQuery.data ?? []).find((c) => c.name === target.company_name)?.id;
    if (!companyId) {
      toast("Azienda non trovata per questo sospeso", "error");
      return;
    }
    setBusy(true);
    try {
      await apiPost("/events", {
        client_id: target.client_id,
        type: "collection",
        company_id: companyId,
        activity_date: toISODate(collectDate),
        collection_method: method ?? undefined,
        collection_ref_date: method === "bonifico" ? toISODate(bonificoDate) : undefined,
      });
      setTarget(null);
      toast("Incasso registrato, sospeso chiuso", "success");
      qc.invalidateQueries({ queryKey: ["suspensions"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["pending-suspensions"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["suspensions"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["pending-suspensions"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["history"] });
  }

  function openEdit(item: Suspension) {
    setEditItem(item);
    setEditMode(item.payment_mode ?? null);
  }

  async function confirmEdit() {
    if (!editItem || !editMode || busy) return;
    setBusy(true);
    try {
      await apiPut(`/events/${editItem.event_id}`, { payment_mode: editMode });
      setEditItem(null);
      toast("Termini aggiornati", "success");
      invalidateAll();
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteItem || busy) return;
    setBusy(true);
    try {
      await apiDelete(`/events/${deleteItem.event_id}`);
      setDeleteItem(null);
      toast("Sospeso eliminato", "success");
      invalidateAll();
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="sospesi-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.title}>Promemoria sospesi</AppText>
      </View>

      {isAdmin ? (
        <View style={styles.controls}>
          <View style={styles.chipRow}>
            {SCOPE_OPTIONS.map((o) => {
              const on = scope === o.key;
              return (
                <Pressable key={o.key} testID={`sos-scope-${o.key}`} onPress={() => setScope(o.key)} style={[styles.chip, on && styles.chipOn]}>
                  <AppText weight="semibold" style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {query.isLoading ? (
        <Loading />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(s, i) => `${s.client_id}-${s.company_name}-${i}`}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl, gap: spacing.sm }}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              {section.kind === "overdue" ? (
                <WarningCircle size={16} color={colors.error} weight="fill" />
              ) : (
                <Clock size={16} color={colors.warning} weight="fill" />
              )}
              <AppText weight="bold" style={styles.sectionTitle}>{section.title}</AppText>
              <View style={styles.countBadge}>
                <AppText weight="bold" style={styles.countText}>{section.data.length}</AppText>
              </View>
            </View>
          )}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Pressable
                testID={`sos-row-${item.client_id}`}
                onPress={() => router.push(`/client/${item.client_id}`)}
                style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.85 }]}
              >
                <View style={[styles.dot, { backgroundColor: item.kind === "overdue" ? colors.error : colors.warning }]} />
                <View style={{ flex: 1 }}>
                  <AppText weight="semibold" style={styles.name} numberOfLines={1}>{item.ragione_sociale}</AppText>
                  <AppText style={styles.meta} numberOfLines={1}>
                    {item.company_name}{item.citta ? ` · ${item.citta}` : ""}
                  </AppText>
                  <AppText style={styles.due}>
                    {item.kind === "overdue"
                      ? (item.due_at ? `Scaduto il ${dmyDate(item.due_at)}` : "Sospeso attivo")
                      : (item.due_at ? `In scadenza il ${dmyDate(item.due_at)}` : "In scadenza")}
                  </AppText>
                  {isAdmin && scope === "all" && item.agent ? (
                    <AppText style={styles.agent}>{AGENT_SHORT[item.agent] ?? item.agent}</AppText>
                  ) : null}
                </View>
              </Pressable>
              <View style={styles.actions}>
                {item.event_type === "order" ? (
                  <Pressable
                    testID={`sos-edit-${item.client_id}`}
                    onPress={() => openEdit(item)}
                    style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
                  >
                    <PencilSimple size={18} color={colors.brand} weight="bold" />
                    <AppText weight="semibold" style={styles.iconBtnText}>Modifica</AppText>
                  </Pressable>
                ) : null}
                <Pressable
                  testID={`sos-delete-${item.client_id}`}
                  onPress={() => setDeleteItem(item)}
                  style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.8 }]}
                >
                  <Trash size={18} color={colors.error} weight="bold" />
                  <AppText weight="semibold" style={[styles.iconBtnText, { color: colors.error }]}>Elimina</AppText>
                </Pressable>
                <Pressable
                  testID={`sos-collect-${item.client_id}`}
                  onPress={() => openCollect(item)}
                  style={({ pressed }) => [styles.collectBtn, pressed && { opacity: 0.85 }]}
                >
                  <CurrencyEur size={18} color={colors.onBrand} weight="bold" />
                  <AppText weight="bold" style={styles.collectText}>Incassa</AppText>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <AppText style={styles.emptyText}>Nessun sospeso attivo o in scadenza. 🎉</AppText>
            </View>
          }
        />
      )}

      <Modal visible={!!target} transparent animationType="slide" onRequestClose={() => setTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" style={styles.modalTitle}>Registra incasso</AppText>
                {target ? (
                  <AppText style={styles.modalSub} numberOfLines={1}>
                    {target.ragione_sociale} · {target.company_name}
                  </AppText>
                ) : null}
              </View>
              <Pressable testID="collect-close" onPress={() => setTarget(null)} hitSlop={8} style={styles.closeBtn}>
                <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
              <ActivityDateField value={collectDate} onChange={setCollectDate} label="Data dell'incasso" />

              <AppText weight="medium" style={styles.fieldLabel}>Modalità di incasso</AppText>
              <View style={styles.methodRow}>
                {METHOD_OPTIONS.map((m) => {
                  const on = method === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      testID={`collect-method-${m.key}`}
                      onPress={() => setMethod(m.key)}
                      style={[styles.methodChip, on && styles.methodChipOn]}
                    >
                      <AppText weight="semibold" style={[styles.methodText, on && { color: colors.onBrand }]}>
                        {m.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {method === "bonifico" ? (
                <ActivityDateField value={bonificoDate} onChange={setBonificoDate} label="Data del bonifico" />
              ) : null}
            </ScrollView>

            <Button
              testID="collect-confirm"
              title="Conferma incasso"
              onPress={confirmCollect}
              loading={busy}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!editItem} transparent animationType="slide" onRequestClose={() => setEditItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <AppText weight="bold" style={styles.modalTitle}>Modifica termini</AppText>
                {editItem ? (
                  <AppText style={styles.modalSub} numberOfLines={1}>
                    {editItem.ragione_sociale} · {editItem.company_name}
                  </AppText>
                ) : null}
              </View>
              <Pressable testID="edit-close" onPress={() => setEditItem(null)} hitSlop={8} style={styles.closeBtn}>
                <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: spacing.sm }} showsVerticalScrollIndicator={false}>
              <AppText weight="medium" style={styles.fieldLabel}>Termini di pagamento</AppText>
              <View style={styles.methodRow}>
                {(paymentModesQuery.data ?? []).map((pm) => {
                  const on = editMode === pm.key;
                  return (
                    <Pressable
                      key={pm.key}
                      testID={`edit-mode-${pm.key}`}
                      onPress={() => setEditMode(pm.key)}
                      style={[styles.methodChip, on && styles.methodChipOn]}
                    >
                      <AppText weight="semibold" style={[styles.methodText, on && { color: colors.onBrand }]}>
                        {pm.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Button
              testID="edit-confirm"
              title="Salva termini"
              onPress={confirmEdit}
              loading={busy}
              style={{ marginTop: spacing.md }}
            />
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteItem} transparent animationType="fade" onRequestClose={() => setDeleteItem(null)}>
        <View style={styles.modalBackdropCenter}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Trash size={26} color={colors.error} weight="fill" />
            </View>
            <AppText weight="bold" style={styles.modalTitle}>Eliminare il sospeso?</AppText>
            {deleteItem ? (
              <AppText style={styles.confirmText}>
                {deleteItem.company_name} · {deleteItem.ragione_sociale}. La segnalazione verrà rimossa dalla lista e dal banner cliente.
              </AppText>
            ) : null}
            <View style={styles.confirmBtns}>
              <Button title="Annulla" variant="ghost" testID="delete-cancel" onPress={() => setDeleteItem(null)} style={{ flex: 1 }} />
              <Pressable testID="delete-confirm" onPress={confirmDelete} style={styles.confirmDeleteBtn}>
                <AppText weight="semibold" style={styles.confirmDeleteText}>{busy ? "..." : "Elimina"}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  controls: { backgroundColor: c.surface, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: c.border },
  chipRow: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary },
  chipOn: { backgroundColor: c.brand },
  chipText: { fontSize: 12, color: c.onSurfaceSecondary },
  chipTextOn: { color: c.onBrand },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  sectionTitle: { fontSize: 13, color: c.onSurfaceTertiary, letterSpacing: 0.5, flex: 1 },
  countBadge: { minWidth: 24, paddingHorizontal: 6, height: 20, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  countText: { fontSize: 11, color: c.onSurfaceSecondary },
  row: {
    flexDirection: "column", gap: spacing.sm,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, padding: spacing.md,
  },
  rowMain: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "flex-end" },
  iconBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44,
  },
  iconBtnText: { fontSize: 13, color: c.brand },
  dot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontSize: 15, color: c.onSurface },
  meta: { fontSize: 12, color: c.muted, marginTop: 1 },
  due: { fontSize: 12, color: c.onSurfaceSecondary, marginTop: 2 },
  agent: { fontSize: 11, color: c.brand, marginTop: 2 },
  collectBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: c.success, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44,
  },
  collectText: { fontSize: 13, color: c.onBrand },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontSize: 14, color: c.muted, fontStyle: "italic" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    padding: spacing.lg, gap: spacing.sm, maxHeight: "88%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  modalTitle: { fontSize: 18, color: c.onSurface },
  modalSub: { fontSize: 13, color: c.muted, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  fieldLabel: { fontSize: 13, color: c.onSurfaceTertiary, marginTop: spacing.xs },
  methodRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  methodChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
  },
  methodChipOn: { backgroundColor: c.brand, borderColor: c.brand },
  methodText: { fontSize: 14, color: c.onSurface },
}));
