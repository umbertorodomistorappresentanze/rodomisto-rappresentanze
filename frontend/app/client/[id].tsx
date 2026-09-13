import { useEffect, useState } from "react";
import { Linking, Pressable, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ArrowBendUpLeft,
  CaretLeft,
  CheckCircle,
  CurrencyEur,
  Envelope,
  MapPin,
  MapTrifold,
  NotePencil,
  Phone,
  Storefront,
} from "phosphor-react-native";

import { apiGet, apiPut, Client, Giro, VisitEvent } from "@/src/api";
import { AppText, Button, Loading } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { shortDate, timeShort } from "@/src/format";
import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

const EVENT_META: Record<string, { label: string; icon: any }> = {
  visit: { label: "Visita", icon: CheckCircle },
  order: { label: "Ordine", icon: Storefront },
  collection: { label: "Incasso", icon: CurrencyEur },
  reschedule: { label: "Visita rimandata", icon: ArrowBendUpLeft },
  note: { label: "Nota", icon: NotePencil },
};

export default function ClientDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const clientQuery = useQuery({ queryKey: ["client", id], queryFn: () => apiGet<Client>(`/clients/${id}`) });
  const historyQuery = useQuery({ queryKey: ["history", id], queryFn: () => apiGet<VisitEvent[]>(`/clients/${id}/history`) });
  const giriQuery = useQuery({ queryKey: ["giri"], queryFn: () => apiGet<Giro[]>("/giri") });

  const [note, setNote] = useState("");
  const [showAssign, setShowAssign] = useState(false);

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

  if (clientQuery.isLoading || !clientQuery.data) return <Loading />;
  const client = clientQuery.data;
  const giroName = giriQuery.data?.find((g) => g.id === client.giro_id)?.name;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="client-back" onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <CaretLeft size={22} color={colors.onSurface} weight="bold" />
        </Pressable>
        <AppText weight="bold" style={styles.headerTitle} numberOfLines={1}>{client.ragione_sociale}</AppText>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={20}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
      >
        {/* Anagrafica */}
        <View style={styles.card}>
          <Field icon={<MapPin size={18} color={colors.brand} weight="bold" />} label="Città" value={client.citta} />
          <Field icon={<MapTrifold size={18} color={colors.brand} weight="bold" />} label="Zona / Giro" value={client.zona || "—"} />
          {client.provincia ? <Field label="Provincia" value={client.provincia} /> : null}
          {client.indirizzo ? <Field label="Indirizzo" value={`${client.indirizzo}${client.cap ? `, ${client.cap}` : ""}`} /> : null}
          {client.telefono ? (
            <Pressable testID="call-client" onPress={() => Linking.openURL(`tel:${client.telefono}`)}>
              <Field icon={<Phone size={18} color={colors.brand} weight="bold" />} label="Telefono" value={client.telefono} link />
            </Pressable>
          ) : null}
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
                const meta = EVENT_META[ev.type];
                const Icon = meta.icon;
                let detail = "";
                if (ev.type === "order" && ev.company_name) detail = ev.company_name;
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
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
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
  card: { backgroundColor: c.surface, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.md },
  cardTitle: { fontSize: 15, color: c.onSurface },
  field: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  fieldIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: c.brandSecondary, alignItems: "center", justifyContent: "center" },
  fieldIconEmpty: { width: 34, height: 34 },
  fieldLabel: { fontSize: 12, color: c.muted },
  fieldValue: { fontSize: 15, color: c.onSurface, marginTop: 1 },
  giroValue: { fontSize: 16, color: c.onSurface },
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
