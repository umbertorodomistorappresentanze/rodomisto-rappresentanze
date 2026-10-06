import { useEffect, useState } from "react";
import { Linking, Modal, Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowBendUpLeft,
  CaretLeft,
  CheckCircle,
  CurrencyEur,
  DeviceMobile,
  Envelope,
  MapPin,
  MapTrifold,
  NotePencil,
  PencilSimple,
  Phone,
  Storefront,
  Trash,
  Warning,
  WhatsappLogo,
} from "phosphor-react-native";

import { apiDelete, apiGet, apiPut, Client, Giro, VisitEvent } from "@/src/api";
import { useAuth } from "@/src/auth";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { EventActions } from "@/src/components/event-actions";
import { shortDate, timeShort } from "@/src/format";
import { lastActionLabel } from "@/src/utils/last-action";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const EVENT_META: Record<string, { label: string; icon: any }> = {
  visit: { label: "Visita", icon: CheckCircle },
  order: { label: "Ordine", icon: Storefront },
  collection: { label: "Incasso", icon: CurrencyEur },
  reschedule: { label: "Visita rimandata", icon: ArrowBendUpLeft },
  note: { label: "Nota", icon: NotePencil },
  suspension: { label: "Sospeso aggiunto", icon: Warning },
  recurrence_order: { label: "Ordine ricorrenza", icon: Storefront },
};

function waNumber(raw: string): string {
  let d = (raw || "").replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("39") && (d.startsWith("3") || d.length <= 10)) d = "39" + d;
  return d;
}

function isMobile(raw: string): boolean {
  const d = (raw || "").replace(/[^0-9]/g, "").replace(/^0039/, "").replace(/^39/, "");
  return d.startsWith("3");
}

export default function ClientDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const clientQuery = useQuery({ queryKey: ["client", id], queryFn: () => apiGet<Client>(`/clients/${id}`) });
  const historyQuery = useQuery({ queryKey: ["history", id], queryFn: () => apiGet<VisitEvent[]>(`/clients/${id}/history`) });
  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });

  const [note, setNote] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (clientQuery.data) setNote(clientQuery.data.permanent_note ?? "");
  }, [clientQuery.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = useMutation({
    mutationFn: () => apiPut<Client>(`/clients/${id}`, { permanent_note: note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", id] });
      toast("Nota permanente salvata", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const assign = useMutation({
    mutationFn: (giro: Giro) => {
      const c = clientQuery.data!;
      let pos = 999;
      const key = (c.zona || c.citta || "").trim().toLowerCase();
      const idx = giro.localities.findIndex((l) => l.trim().toLowerCase() === key);
      if (idx >= 0) pos = idx;
      return apiPut<Client>(`/clients/${id}`, { giro_id: giro.id, position: pos });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client", id] });
      qc.invalidateQueries({ queryKey: ["da-verificare"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      setShowAssign(false);
      toast("Cliente assegnato al giro", "success");
    },
    onError: (e: any) => toast(e?.detail || "Errore", "error"),
  });

  const del = useMutation({
    mutationFn: () => apiDelete(`/clients/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients", "all"] });
      qc.invalidateQueries({ queryKey: ["da-verificare"] });
      setShowDelete(false);
      toast("Cliente eliminato", "success");
      router.back();
    },
    onError: (e: any) => {
      setShowDelete(false);
      toast(e?.detail || "Errore", "error");
    },
  });

  if (clientQuery.isLoading || !clientQuery.data) return <Loading />;
  const client = clientQuery.data;
  const giroName = giriQuery.data?.find((g) => g.id === client.giro_id)?.name;

  const hist = historyQuery.data ?? [];
  const lastOf = (t: string) => hist.find((e) => e.type === t)?.created_at ?? null;
  const ultimaAzione = lastActionLabel({
    last_visit_at: lastOf("visit"),
    last_order_at: lastOf("order"),
    last_collection_at: lastOf("collection"),
  });

  const cell = (client.extra?.telefono_cellulare || "").trim() ||
    (client.telefono && isMobile(client.telefono) ? client.telefono.trim() : "");
  const fisso = (client.extra?.telefono_ufficio || "").trim() ||
    (client.telefono && !isMobile(client.telefono) && client.telefono.trim() !== cell ? client.telefono.trim() : "");

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="client-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>{client.ragione_sociale}</AppText>
        <Pressable testID="edit-client-btn" onPress={() => router.push(`/client/edit/${client.id}`)} hitSlop={8} style={styles.editBtn}>
          <PencilSimple size={18} color={colors.onBrand} weight="bold" />
        </Pressable>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={20}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      >
        {/* Ultima azione */}
        <View style={styles.lastActionCard} testID="last-action-card">
          <AppText weight="semibold" style={styles.lastActionLabel}>ULTIMA AZIONE</AppText>
          <AppText weight="bold" style={styles.lastActionValue}>{ultimaAzione}</AppText>
        </View>
        {/* Contatti rapidi */}
        {(cell || fisso) ? (
          <View style={styles.card}>
            <AppText weight="semibold" style={styles.cardTitle}>Contatti rapidi</AppText>
            {fisso ? (
              <View style={styles.contactRow}>
                <View style={styles.contactInfo}>
                  <Phone size={18} color={colors.brand} weight="bold" />
                  <View>
                    <AppText style={styles.fieldLabel}>Fisso</AppText>
                    <AppText weight="medium" style={styles.fieldValue}>{fisso}</AppText>
                  </View>
                </View>
                <Pressable testID="call-fisso" onPress={() => Linking.openURL(`tel:${fisso}`)} style={styles.callBtn}>
                  <Phone size={18} color={colors.onBrand} weight="fill" />
                  <AppText weight="semibold" style={styles.callBtnText}>Chiama</AppText>
                </Pressable>
              </View>
            ) : null}
            {cell ? (
              <View style={styles.contactRow}>
                <View style={styles.contactInfo}>
                  <DeviceMobile size={18} color={colors.brand} weight="bold" />
                  <View>
                    <AppText style={styles.fieldLabel}>Cellulare</AppText>
                    <AppText weight="medium" style={styles.fieldValue}>{cell}</AppText>
                  </View>
                </View>
                <View style={styles.contactBtns}>
                  <Pressable testID="call-cell" onPress={() => Linking.openURL(`tel:${cell}`)} style={styles.callBtn}>
                    <Phone size={18} color={colors.onBrand} weight="fill" />
                    <AppText weight="semibold" style={styles.callBtnText}>Chiama</AppText>
                  </Pressable>
                  <Pressable testID="whatsapp-cell" onPress={() => Linking.openURL(`https://wa.me/${waNumber(cell)}`)} style={styles.waBtn}>
                    <WhatsappLogo size={18} color="#FFFFFF" weight="fill" />
                    <AppText weight="semibold" style={styles.callBtnText}>WhatsApp</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Anagrafica */}
        <View style={styles.card}>
          <Field icon={<MapPin size={18} color={colors.brand} weight="bold" />} label="Città" value={client.citta} />
          <Field icon={<MapTrifold size={18} color={colors.brand} weight="bold" />} label="Zona / Giro" value={client.zona || "—"} />
          {client.provincia ? <Field label="Provincia" value={client.provincia} /> : null}
          {client.indirizzo ? <Field label="Indirizzo" value={`${client.indirizzo}${client.cap ? `, ${client.cap}` : ""}`} /> : null}
          {client.email ? (
            <Pressable testID="email-client" onPress={() => Linking.openURL(`mailto:${client.email}`)}>
              <Field icon={<Envelope size={18} color={colors.brand} weight="bold" />} label="Email" value={client.email} link />
            </Pressable>
          ) : null}
          <Field label="Consulente" value={client.agent === "umberto" ? "Umberto Rodomisto" : "Andrea Azzarito"} />
        </View>

        {/* Giro assignment */}
        <View style={styles.card}>
          <AppText weight="semibold" style={styles.cardTitle}>Giro assegnato</AppText>
          {client.giro_id ? (
            <AppText style={styles.giroValue}>{giroName ?? "—"}</AppText>
          ) : (
            <AppText style={styles.warn}>Nessun giro — da verificare</AppText>
          )}
          <Button
            title={client.giro_id ? "Cambia giro" : "Assegna a un giro"}
            variant="secondary"
            testID="assign-giro-toggle"
            onPress={() => setShowAssign((s) => !s)}
            style={{ marginTop: spacing.sm }}
          />
          {showAssign ? (
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {(giriQuery.data ?? []).map((g) => (
                <Pressable
                  key={g.id}
                  testID={`assign-giro-${g.id}`}
                  onPress={() => assign.mutate(g)}
                  style={({ pressed }) => [styles.assignRow, pressed && { opacity: 0.8 }]}
                >
                  <MapTrifold size={18} color={colors.brand} weight="bold" />
                  <AppText weight="medium" style={styles.assignText}>{g.name}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {/* Permanent note */}
        <View style={styles.card}>
          <AppText weight="semibold" style={styles.cardTitle}>Nota permanente cliente</AppText>
          <TextInput
            testID="permanent-note-input"
            value={note}
            onChangeText={setNote}
            placeholder="Nota che resta sempre nella scheda…"
            placeholderTextColor={colors.muted}
            multiline
            style={styles.noteInput}
          />
          <Button title="Salva nota" variant="ghost" testID="save-permanent-note" loading={saveNote.isPending} onPress={() => saveNote.mutate()} />
        </View>

        {/* Azioni anagrafica */}
        <View style={{ gap: spacing.sm }}>
          <Button
            title="Modifica anagrafica"
            testID="edit-client-detail-btn"
            icon={<PencilSimple size={18} color={colors.onBrand} weight="bold" />}
            onPress={() => router.push(`/client/edit/${client.id}`)}
          />
          {isAdmin ? (
            <Pressable testID="delete-client-btn" onPress={() => setShowDelete(true)} style={styles.deleteBtn}>
              <Trash size={18} color={colors.error} weight="bold" />
              <AppText weight="semibold" style={styles.deleteText}>Elimina cliente</AppText>
            </Pressable>
          ) : null}
        </View>

        {/* Storico */}
        <View>
          <AppText weight="bold" style={styles.historyTitle}>Storico</AppText>
          {historyQuery.isLoading ? (
            <Loading />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <AppText style={styles.emptyHistory}>Nessuno storico disponibile per questo cliente.</AppText>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {(historyQuery.data ?? []).map((ev) => {
                const meta = EVENT_META[ev.type] ?? { label: ev.type, icon: NotePencil };
                const Icon = meta.icon;
                let detail = "";
                if (ev.type === "order" && ev.company_name) {
                  detail = ev.payment_mode_label ? `${ev.company_name} · ${ev.payment_mode_label}` : ev.company_name;
                  if (ev.due_at) detail += ` · scad. ${shortDate(ev.due_at)}`;
                }
                if (ev.type === "collection" && ev.company_name) detail = `Incasso ${ev.company_name}`;
                if (ev.type === "suspension" && ev.company_name) detail = ev.company_name;
                if (ev.type === "recurrence_order" && ev.recurrence_company) detail = `${ev.recurrence_company} · ${ev.recurrence_period ?? ""}`;
                if (ev.type === "note" && ev.note_text) detail = ev.note_text;
                if (ev.type === "reschedule" && ev.reschedule_until) detail = `Rivedere il ${shortDate(ev.reschedule_until)}`;
                return (
                  <View key={ev.id} style={styles.eventRow} testID={`event-${ev.id}`}>
                    <View style={styles.eventIcon}>
                      <Icon size={18} color={colors.brand} weight="fill" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText weight="semibold" style={styles.eventLabel}>{meta.label}</AppText>
                      {detail ? <AppText style={styles.eventDetail}>{detail}</AppText> : null}
                      <AppText style={styles.eventDate}>{shortDate(ev.created_at)} · {timeShort(ev.created_at)}</AppText>
                      {ev.type !== "recurrence_order" ? <EventActions event={ev} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>

      <Modal visible={showDelete} transparent animationType="fade" onRequestClose={() => setShowDelete(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} testID="delete-confirm-modal">
            <View style={styles.modalIcon}>
              <Trash size={26} color={colors.error} weight="fill" />
            </View>
            <AppText weight="bold" style={styles.modalTitle}>Eliminare il cliente?</AppText>
            <AppText style={styles.modalText}>
              {client.ragione_sociale} verrà rimosso dall&apos;app e dai giri. Questa azione richiede conferma.
            </AppText>
            <View style={styles.modalBtns}>
              <Button title="Annulla" variant="ghost" testID="delete-cancel" onPress={() => setShowDelete(false)} style={{ flex: 1 }} />
              <Pressable testID="delete-confirm" onPress={() => del.mutate()} style={styles.modalDeleteBtn}>
                <AppText weight="semibold" style={styles.modalDeleteText}>{del.isPending ? "..." : "Elimina"}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Field({ icon, label, value, link }: { icon?: React.ReactNode; label: string; value: string; link?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      {icon ? <View style={styles.fieldIcon}>{icon}</View> : <View style={styles.fieldIconEmpty} />}
      <View style={{ flex: 1 }}>
        <AppText style={styles.fieldLabel}>{label}</AppText>
        <AppText weight="medium" style={[styles.fieldValue, link && { color: colors.brand }]}>{value}</AppText>
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
  editBtn: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.md },
  lastActionCard: { backgroundColor: c.brandSecondary, borderRadius: radius.md, padding: spacing.lg, gap: 2 },
  lastActionLabel: { fontSize: 12, color: c.onBrandSecondary, letterSpacing: 0.5, opacity: 0.85 },
  lastActionValue: { fontSize: 16, color: c.onBrandSecondary },
  cardTitle: { fontSize: 15, color: c.onSurface },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  fieldIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  fieldIconEmpty: { width: 34, height: 34 },
  fieldLabel: { fontSize: 12, color: c.muted },
  fieldValue: { fontSize: 15, color: c.onSurface, marginTop: 1 },
  giroValue: { fontSize: 16, color: c.onSurface },
  contactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, flexWrap: "wrap" },
  contactInfo: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  contactBtns: { flexDirection: "row", gap: spacing.sm },
  callBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: c.brand,
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, justifyContent: "center",
  },
  waBtn: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, backgroundColor: "#25D366",
    borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, justifyContent: "center",
  },
  callBtnText: { fontSize: 14, color: "#FFFFFF" },
  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: c.error, borderRadius: radius.md, minHeight: 52,
  },
  deleteText: { fontSize: 16, color: c.error },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  modalCard: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md, width: "100%", maxWidth: 400, alignItems: "center" },
  modalIcon: { width: 56, height: 56, borderRadius: radius.pill, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 18, color: c.onSurface, textAlign: "center" },
  modalText: { fontSize: 14, color: c.muted, textAlign: "center" },
  modalBtns: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, width: "100%" },
  modalDeleteBtn: { flex: 1, backgroundColor: c.error, borderRadius: radius.md, minHeight: 56, alignItems: "center", justifyContent: "center" },
  modalDeleteText: { fontSize: 16, color: c.onError },
  warn: { fontSize: 15, color: c.warning, fontFamily: "PlusJakarta-Medium" },
  assignRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: c.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: c.border,
  },
  assignText: { fontSize: 15, color: c.onSurface },
  noteInput: {
    minHeight: 90, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md,
    fontFamily: "PlusJakarta-Regular", fontSize: 15, color: c.onSurface, textAlignVertical: "top", backgroundColor: c.surfaceSecondary,
  },
  historyTitle: { fontSize: 18, color: c.onSurface, marginBottom: spacing.md },
  emptyHistory: { fontSize: 14, color: c.muted, fontStyle: "italic" },
  eventRow: {
    flexDirection: "row", gap: spacing.md, backgroundColor: c.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.md,
  },
  eventIcon: { width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  eventLabel: { fontSize: 15, color: c.onSurface },
  eventDetail: { fontSize: 14, color: c.onSurfaceSecondary, marginTop: 1 },
  eventDate: { fontSize: 12, color: c.muted, marginTop: 2 },
}));
