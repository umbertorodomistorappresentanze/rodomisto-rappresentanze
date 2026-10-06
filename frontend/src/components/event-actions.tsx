import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilSimple, Trash, X } from "phosphor-react-native";

import { apiDelete, apiGet, apiPut, PaymentMode, VisitEvent } from "@/src/api";
import { AppText, Button } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { radius, spacing, useTheme } from "@/src/theme";

const DELETABLE = ["order", "collection", "suspension", "note", "reschedule", "visit"];

export function EventActions({ event }: { event: VisitEvent }) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const toast = useToast();
  const qc = useQueryClient();

  const canEdit = event.type === "order";
  const canDelete = DELETABLE.includes(event.type);

  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [mode, setMode] = useState<string | null>(event.payment_mode ?? null);
  const [busy, setBusy] = useState(false);

  const pmQuery = useQuery({
    queryKey: ["payment-modes"],
    queryFn: () => apiGet<PaymentMode[]>("/payment-modes"),
    enabled: editOpen,
  });

  if (!canEdit && !canDelete) return null;

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["history"] });
    qc.invalidateQueries({ queryKey: ["activities"] });
    qc.invalidateQueries({ queryKey: ["suspensions"] });
    qc.invalidateQueries({ queryKey: ["pending-suspensions"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
  }

  async function saveEdit() {
    if (!mode || busy) return;
    setBusy(true);
    try {
      await apiPut(`/events/${event.id}`, { payment_mode: mode });
      setEditOpen(false);
      toast("Termini aggiornati", "success");
      invalidate();
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await apiDelete(`/events/${event.id}`);
      setDelOpen(false);
      toast("Evento eliminato", "success");
      invalidate();
    } catch (e: any) {
      toast(e?.detail || "Operazione non riuscita", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.row}>
      {canEdit ? (
        <Pressable
          testID={`event-edit-${event.id}`}
          onPress={() => { setMode(event.payment_mode ?? null); setEditOpen(true); }}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
          hitSlop={6}
        >
          <PencilSimple size={16} color={colors.brand} weight="bold" />
          <AppText weight="semibold" style={styles.btnText}>Modifica</AppText>
        </Pressable>
      ) : null}
      {canDelete ? (
        <Pressable
          testID={`event-delete-${event.id}`}
          onPress={() => setDelOpen(true)}
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.8 }]}
          hitSlop={6}
        >
          <Trash size={16} color={colors.error} weight="bold" />
          <AppText weight="semibold" style={[styles.btnText, { color: colors.error }]}>Elimina</AppText>
        </Pressable>
      ) : null}

      <Modal visible={editOpen} transparent animationType="slide" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <AppText weight="bold" style={styles.sheetTitle}>Modifica termini di pagamento</AppText>
              <Pressable testID="ev-edit-close" onPress={() => setEditOpen(false)} hitSlop={8} style={styles.closeBtn}>
                <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
              </Pressable>
            </View>
            {event.company_name ? (
              <AppText style={styles.sheetSub}>{event.company_name}</AppText>
            ) : null}
            <ScrollView contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.sm }} showsVerticalScrollIndicator={false}>
              <View style={styles.chips}>
                {(pmQuery.data ?? []).map((pm) => {
                  const on = mode === pm.key;
                  return (
                    <Pressable
                      key={pm.key}
                      testID={`ev-mode-${pm.key}`}
                      onPress={() => setMode(pm.key)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <AppText weight="semibold" style={[styles.chipText, on && { color: colors.onBrand }]}>{pm.label}</AppText>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
            <Button testID="ev-edit-save" title="Salva termini" onPress={saveEdit} loading={busy} />
          </View>
        </View>
      </Modal>

      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => setDelOpen(false)}>
        <View style={styles.backdropCenter}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIcon}>
              <Trash size={26} color={colors.error} weight="fill" />
            </View>
            <AppText weight="bold" style={styles.sheetTitle}>Eliminare questo evento?</AppText>
            <AppText style={styles.confirmText}>L&apos;evento verrà rimosso da storico, promemoria sospesi e banner cliente.</AppText>
            <View style={styles.confirmBtns}>
              <Button title="Annulla" variant="ghost" testID="ev-del-cancel" onPress={() => setDelOpen(false)} style={{ flex: 1 }} />
              <Pressable testID="ev-del-confirm" onPress={doDelete} style={styles.delBtn}>
                <AppText weight="semibold" style={styles.delText}>{busy ? "..." : "Elimina"}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
    btn: {
      flexDirection: "row", alignItems: "center", gap: 4,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
      borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 6, minHeight: 36,
    },
    btnText: { fontSize: 12, color: c.brand },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, maxHeight: "80%" },
    sheetHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    sheetTitle: { fontSize: 17, color: c.onSurface, flex: 1 },
    sheetSub: { fontSize: 13, color: c.muted },
    closeBtn: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border },
    chipOn: { backgroundColor: c.brand, borderColor: c.brand },
    chipText: { fontSize: 14, color: c.onSurface },
    backdropCenter: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
    confirmCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, width: "100%", maxWidth: 400, alignItems: "center" },
    confirmIcon: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
    confirmText: { fontSize: 14, color: c.muted, textAlign: "center" },
    confirmBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, width: "100%" },
    delBtn: { flex: 1, backgroundColor: c.error, borderRadius: radius.md, minHeight: 56, alignItems: "center", justifyContent: "center" },
    delText: { fontSize: 16, color: c.onError },
  });
}
