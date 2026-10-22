import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowBendUpLeft,
  CaretDown,
  CaretLeft,
  CaretUp,
  CurrencyEur,
  MagnifyingGlass,
  NotePencil,
  Storefront,
  Trash,
  Warning,
  WarningCircle,
  X,
} from "phosphor-react-native";

import { apiDelete, apiGet, apiPost, Client, Company, PaymentMode, PendingSuspension } from "@/src/api";
import { AppText, Button } from "@/src/components/ui";
import { ActivityDateField, toISODate } from "@/src/components/activity-date-field";
import { dmyDate } from "@/src/format";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export type QuickActionsRef = {
  present: (client: Client) => void;
  dismiss: () => void;
};

type Mode = "main" | "order" | "reschedule" | "note" | "collection" | "suspension" | "delete";

const RESCHEDULE_OPTIONS = [
  { label: "Tra 3 giorni", days: 3 },
  { label: "Tra 7 giorni", days: 7 },
  { label: "Tra 15 giorni", days: 15 },
  { label: "Tra 30 giorni", days: 30 },
];

export const QuickActionsSheet = forwardRef<
  QuickActionsRef,
  {
    companies: Company[];
    paymentModes: PaymentMode[];
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
  }
>(function QuickActionsSheet({ companies, paymentModes, onSuccess, onError }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const { colors } = useTheme();
  const [client, setClient] = useState<Client | null>(null);
  const [mode, setMode] = useState<Mode>("main");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [orderCompany, setOrderCompany] = useState<Company | null>(null);
  const [orderPaymentMode, setOrderPaymentMode] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [activityDate, setActivityDate] = useState<Date>(new Date());
  const [companyQuery, setCompanyQuery] = useState("");
  const insets = useSafeAreaInsets();

  const pendingQuery = useQuery({
    queryKey: ["pending-suspensions", client?.id],
    queryFn: () => apiGet<PendingSuspension[]>(`/clients/${client!.id}/pending-suspensions`),
    enabled: !!client?.id,
  });
  const pending = pendingQuery.data ?? [];

  useImperativeHandle(ref, () => ({
    present: (c: Client) => {
      setClient(c);
      setMode("main");
      setNote("");
      setOrderCompany(null);
      setOrderPaymentMode(null);
      setPayOpen(false);
      setActivityDate(new Date());
      setCompanyQuery("");
      modalRef.current?.present();
    },
    dismiss: () => modalRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["90%"], []);

  async function submit(payload: any, successMsg: string) {
    if (!client || busy) return;
    setBusy(true);
    try {
      await apiPost("/events", {
        client_id: client.id,
        activity_date: toISODate(activityDate),
        site_id: client.site_id ?? null,
        site_nominativo: client.site_nominativo || null,
        site_indirizzo: client.indirizzo || null,
        ...payload,
      });
      modalRef.current?.dismiss();
      onSuccess(successMsg);
    } catch (e: any) {
      onError(e?.detail || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  async function deleteClient() {
    if (!client || busy) return;
    setBusy(true);
    try {
      await apiDelete(`/clients/${client.id}`);
      modalRef.current?.dismiss();
      onSuccess("Cliente eliminato");
    } catch (e: any) {
      onError(e?.detail || "Eliminazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  const styles = makeSheetStyles(colors);

  const normQ = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const filteredCompanies = companyQuery.trim()
    ? companies.filter((co) => normQ(co.name).includes(normQ(companyQuery)))
    : companies;

  function renderCompanySearch() {
    return (
      <View style={styles.searchRow}>
        <MagnifyingGlass size={18} color={colors.muted} weight="bold" />
        <TextInput
          testID="company-search"
          value={companyQuery}
          onChangeText={setCompanyQuery}
          placeholder="Cerca azienda..."
          placeholderTextColor={colors.muted}
          autoCorrect={false}
          style={styles.searchInput}
        />
        {companyQuery ? (
          <Pressable testID="company-search-clear" onPress={() => setCompanyQuery("")} hitSlop={8}>
            <X size={16} color={colors.muted} weight="bold" />
          </Pressable>
        ) : null}
      </View>
    );
  }

  function renderNoCompanies() {
    return filteredCompanies.length === 0 ? (
      <AppText style={styles.hint}>Nessuna azienda trovata per &quot;{companyQuery}&quot;</AppText>
    ) : null;
  }

  function Header({ title }: { title: string }) {
    return (
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          {client ? (
            <AppText style={styles.subtitle} numberOfLines={1}>
              {client.site_nominativo ? `${client.site_nominativo} · ` : ""}
              {client.citta}{client.zona && client.zona !== client.citta ? ` · Zona ${client.zona}` : ""}
            </AppText>
          ) : null}
        </View>
        <Pressable
          testID="sheet-close"
          onPress={() => modalRef.current?.dismiss()}
          hitSlop={10}
          style={styles.closeBtn}
        >
          <X size={20} color={colors.onSurfaceSecondary} weight="bold" />
        </Pressable>
      </View>
    );
  }

  function ActionTile({
    icon,
    label,
    color,
    bg,
    onPress,
    testID,
  }: {
    icon: React.ReactNode;
    label: string;
    color: string;
    bg: string;
    onPress: () => void;
    testID: string;
  }) {
    return (
      <Pressable
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [styles.tile, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.tileIcon, { backgroundColor: color }]}>{icon}</View>
        <AppText weight="semibold" style={styles.tileLabel}>{label}</AppText>
      </Pressable>
    );
  }

  return (
    <BottomSheetModal
      ref={modalRef}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.borderStrong }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
      )}
    >
      <BottomSheetView style={styles.container}>
        <Header
          title={
            mode === "main"
              ? client?.ragione_sociale ?? ""
              : mode === "order"
              ? (orderCompany ? "Modalità di pagamento" : "Ordine · scegli azienda")
              : mode === "collection"
              ? "Incassato · scegli azienda"
              : mode === "suspension"
              ? "Sospeso · scegli azienda"
              : mode === "reschedule"
              ? "Visita rimandata"
              : mode === "delete"
              ? "Elimina cliente"
              : "Nota della visita"
          }
        />

        {mode === "main" && pending.length > 0 ? (
          <View style={styles.banner}>
            <WarningCircle size={20} color={colors.warning} weight="fill" />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText weight="bold" style={styles.bannerTitle}>Forniture in sospeso</AppText>
              {pending.map((p, i) => (
                <AppText key={`${p.company_name}-${i}`} style={styles.bannerText}>
                  • {p.company_name}
                  {p.due_at
                    ? (p.kind === "overdue" ? ` — scaduta il ${dmyDate(p.due_at)}` : ` — scade il ${dmyDate(p.due_at)}`)
                    : " — sospeso attivo"}
                </AppText>
              ))}
            </View>
          </View>
        ) : null}

        {mode === "main" ? (
          <View style={styles.grid}>
            <ActionTile
              testID="action-ordine"
              icon={<Storefront size={26} color={colors.onBrand} weight="fill" />}
              label="Ordine effettuato"
              color={colors.brandPrimary}
              bg={colors.brandSecondary}
              onPress={() => { setOrderCompany(null); setCompanyQuery(""); setMode("order"); }}
            />
            <ActionTile
              testID="action-incassato"
              icon={<CurrencyEur size={26} color={colors.onBrand} weight="fill" />}
              label="Incassato"
              color={colors.success}
              bg={colors.brandSecondary}
              onPress={() => { setCompanyQuery(""); setMode("collection"); }}
            />
            <ActionTile
              testID="action-sospeso"
              icon={<Warning size={26} color={colors.onBrand} weight="fill" />}
              label="+ Sospeso"
              color={colors.error}
              bg={colors.surfaceTertiary}
              onPress={() => { setCompanyQuery(""); setMode("suspension"); }}
            />
            <ActionTile
              testID="action-rimandata"
              icon={<ArrowBendUpLeft size={26} color={colors.onBrand} weight="fill" />}
              label="Visita rimandata"
              color={colors.warning}
              bg={colors.surfaceTertiary}
              onPress={() => setMode("reschedule")}
            />
            <ActionTile
              testID="action-nota"
              icon={<NotePencil size={26} color={colors.onSurfaceInverse} weight="fill" />}
              label="Nota"
              color={colors.surfaceInverse}
              bg={colors.surfaceTertiary}
              onPress={() => setMode("note")}
            />
          </View>
        ) : null}

        {mode === "main" ? (
          <Pressable
            testID="action-elimina"
            onPress={() => setMode("delete")}
            style={({ pressed }) => [styles.deleteLink, pressed && { opacity: 0.7 }]}
          >
            <Trash size={18} color={colors.error} weight="bold" />
            <AppText weight="semibold" style={styles.deleteLinkText}>Elimina cliente</AppText>
          </Pressable>
        ) : null}

        {mode === "delete" ? (
          <View style={{ gap: spacing.md }}>
            <View style={styles.delIconWrap}>
              <Trash size={30} color={colors.error} weight="fill" />
            </View>
            <AppText style={styles.delText}>
              Sei sicuro di voler eliminare definitivamente{" "}
              <AppText weight="bold" style={styles.delText}>{client?.ragione_sociale}</AppText>
              {" "}dall&apos;anagrafica e da tutti i giri?
            </AppText>
            <Pressable
              testID="delete-client-confirm"
              disabled={busy}
              onPress={deleteClient}
              style={({ pressed }) => [styles.delConfirmBtn, pressed && { opacity: 0.85 }]}
            >
              <AppText weight="bold" style={styles.delConfirmText}>
                {busy ? "Eliminazione…" : "Elimina definitivamente"}
              </AppText>
            </Pressable>
            <Button title="Annulla" variant="ghost" testID="delete-client-cancel" onPress={() => setMode("main")} />
          </View>
        ) : null}

        {(mode === "order" && !orderCompany) || mode === "collection" || mode === "suspension" ? renderCompanySearch() : null}

        {mode === "order" ? (
          <View style={{ flex: 1, minHeight: 0 }}>
            <BottomSheetScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.lg, gap: spacing.sm }} showsVerticalScrollIndicator>
              {!orderCompany ? (
                <>
                  <AppText style={styles.hint}>Seleziona l&apos;azienda dell&apos;ordine</AppText>
                  {renderNoCompanies()}
                  {filteredCompanies.map((co) => (
                    <Pressable
                      key={co.id}
                      testID={`order-company-${co.id}`}
                      onPress={() => { setOrderCompany(co); setOrderPaymentMode(null); }}
                      style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.7 }]}
                    >
                      <Storefront size={20} color={colors.brand} weight="bold" />
                      <AppText weight="semibold" style={styles.rowItemText}>{co.name}</AppText>
                    </Pressable>
                  ))}
                </>
              ) : (
                <>
                  <Pressable testID="order-back" onPress={() => { setOrderCompany(null); setOrderPaymentMode(null); setPayOpen(false); }} style={styles.backLink}>
                    <CaretLeft size={16} color={colors.brand} weight="bold" />
                    <AppText weight="semibold" style={styles.backLinkText}>Azienda: {orderCompany.name}</AppText>
                  </Pressable>
                  <ActivityDateField value={activityDate} onChange={setActivityDate} />
                  <AppText style={styles.hint}>Modalità di pagamento</AppText>
                  <Pressable
                    testID="order-pay-select"
                    onPress={() => setPayOpen((o) => !o)}
                    style={styles.select}
                  >
                    <AppText weight="semibold" style={[styles.selectText, !orderPaymentMode && { color: colors.muted }]}>
                      {orderPaymentMode
                        ? (paymentModes.find((p) => p.key === orderPaymentMode)?.label ?? "Seleziona modalità…")
                        : "Seleziona modalità…"}
                    </AppText>
                    {payOpen
                      ? <CaretUp size={18} color={colors.onSurfaceSecondary} weight="bold" />
                      : <CaretDown size={18} color={colors.onSurfaceSecondary} weight="bold" />}
                  </Pressable>
                  {payOpen ? (
                    <View style={styles.dropdown}>
                      {paymentModes.map((pm) => {
                        const on = orderPaymentMode === pm.key;
                        return (
                          <Pressable
                            key={pm.key}
                            testID={`order-pay-${pm.key}`}
                            onPress={() => { setOrderPaymentMode(pm.key); setPayOpen(false); }}
                            style={[styles.option, on && styles.optionOn]}
                          >
                            <AppText weight={on ? "bold" : "medium"} style={[styles.optionText, on && { color: colors.brand }]}>
                              {pm.label}
                            </AppText>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}
                </>
              )}
            </BottomSheetScrollView>
            {orderCompany ? (
              <View style={[styles.footerBar, { paddingBottom: insets.bottom + spacing.md }]}>
                <Button
                  testID="order-confirm"
                  title="Conferma e Registra"
                  loading={busy}
                  disabled={!orderPaymentMode}
                  onPress={() => {
                    if (!orderPaymentMode) return;
                    submit(
                      { type: "order", company_id: orderCompany.id, payment_mode: orderPaymentMode },
                      `Ordine ${orderCompany.name} registrato`
                    );
                  }}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {mode === "collection" ? (
          <BottomSheetScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl * 2, gap: spacing.sm }} showsVerticalScrollIndicator>
            <ActivityDateField value={activityDate} onChange={setActivityDate} />
            <AppText style={styles.hint}>Azienda di cui registrare l&apos;incasso (chiude il sospeso)</AppText>
            {renderNoCompanies()}
            {filteredCompanies.map((co) => (
              <Pressable
                key={co.id}
                testID={`collection-company-${co.id}`}
                disabled={busy}
                onPress={() => submit({ type: "collection", company_id: co.id }, `Incasso ${co.name} registrato`)}
                style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.7 }]}
              >
                <CurrencyEur size={20} color={colors.success} weight="bold" />
                <AppText weight="semibold" style={styles.rowItemText}>{co.name}</AppText>
              </Pressable>
            ))}
          </BottomSheetScrollView>
        ) : null}

        {mode === "suspension" ? (
          <BottomSheetScrollView style={{ flex: 1, minHeight: 0 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xl * 2, gap: spacing.sm }} showsVerticalScrollIndicator>
            <ActivityDateField value={activityDate} onChange={setActivityDate} />
            <AppText style={styles.hint}>Azienda del sospeso da segnare come attivo</AppText>
            {renderNoCompanies()}
            {filteredCompanies.map((co) => (
              <Pressable
                key={co.id}
                testID={`suspension-company-${co.id}`}
                disabled={busy}
                onPress={() => submit({ type: "suspension", company_id: co.id }, `Sospeso ${co.name} aggiunto`)}
                style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.7 }]}
              >
                <Warning size={20} color={colors.error} weight="bold" />
                <AppText weight="semibold" style={styles.rowItemText}>{co.name}</AppText>
              </Pressable>
            ))}
          </BottomSheetScrollView>
        ) : null}

        {mode === "reschedule" ? (
          <View style={{ gap: spacing.md }}>
            <AppText style={styles.hint}>Quando rivedere il cliente?</AppText>
            <View style={styles.chipsWrap}>
              {RESCHEDULE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.days}
                  testID={`reschedule-${opt.days}`}
                  disabled={busy}
                  onPress={() => submit({ type: "reschedule", reschedule_days: opt.days }, "Visita rimandata")}
                  style={({ pressed }) => [styles.bigChip, pressed && { opacity: 0.8 }]}
                >
                  <AppText weight="semibold" style={styles.bigChipText}>{opt.label}</AppText>
                </Pressable>
              ))}
            </View>
            <Button
              title="Data personalizzata"
              variant="secondary"
              testID="reschedule-custom"
              onPress={() => {
                if (Platform.OS === "web") {
                  onError("Data personalizzata disponibile sull'app mobile");
                  return;
                }
                setShowPicker(true);
              }}
            />
            <Button
              title="Solo rimanda (senza data)"
              variant="ghost"
              testID="reschedule-none"
              onPress={() => submit({ type: "reschedule" }, "Visita rimandata")}
            />
            {showPicker ? (
              <DateTimePicker
                mode="date"
                value={new Date()}
                minimumDate={new Date()}
                onChange={(_e, date) => {
                  setShowPicker(false);
                  if (date) {
                    submit({ type: "reschedule", reschedule_date: date.toISOString() }, "Visita rimandata");
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}

        {mode === "note" ? (
          <View style={{ gap: spacing.md }}>
            <ActivityDateField value={activityDate} onChange={setActivityDate} />
            <TextInput
              testID="note-input"
              value={note}
              onChangeText={setNote}
              placeholder="Scrivi una nota per questa visita…"
              placeholderTextColor={colors.muted}
              multiline
              style={styles.noteInput}
            />
            <Button
              title="Salva nota"
              testID="note-save"
              disabled={!note.trim()}
              loading={busy}
              onPress={() => submit({ type: "note", note_text: note.trim() }, "Nota salvata")}
            />
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

function makeSheetStyles(c: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: { flex: 1, minHeight: 0, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    searchRow: {
      flexDirection: "row", alignItems: "center", gap: spacing.sm,
      backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border,
      borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 46, marginBottom: spacing.sm,
    },
    searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: c.onSurface, paddingVertical: 0 },
    header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingBottom: spacing.lg },
    title: { fontSize: 20, color: c.onSurface },
    subtitle: { fontSize: 13, color: c.muted, marginTop: 2 },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceTertiary,
      alignItems: "center",
      justifyContent: "center",
    },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    select: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      minHeight: 50,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.surfaceSecondary,
      borderWidth: 1,
      borderColor: c.border,
    },
    selectText: { fontSize: 15, color: c.onSurface, flex: 1 },
    dropdown: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      overflow: "hidden",
    },
    option: {
      minHeight: 46,
      justifyContent: "center",
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: c.divider,
    },
    optionOn: { backgroundColor: c.surfaceSecondary },
    optionText: { fontSize: 15, color: c.onSurface },
    footerBar: {
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.surface,
    },
    banner: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: c.surfaceSecondary,
      borderWidth: 1,
      borderColor: c.warning,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    bannerTitle: { fontSize: 13, color: c.onSurface },
    bannerText: { fontSize: 13, color: c.onSurfaceSecondary },
    tile: {
      width: "47.5%",
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 110,
      justifyContent: "center",
    },
    tileIcon: { width: 52, height: 52, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    tileLabel: { fontSize: 14, color: c.onSurface, textAlign: "center" },
    hint: { fontSize: 13, color: c.muted, marginBottom: spacing.xs },
    rowItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: c.surfaceSecondary,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      borderWidth: 1,
      borderColor: c.border,
    },
    rowItemText: { fontSize: 16, color: c.onSurface },
    backLink: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingVertical: spacing.xs, marginBottom: spacing.xs },
    backLinkText: { fontSize: 14, color: c.brand },
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    bigChip: {
      width: "47.5%",
      backgroundColor: c.brandSecondary,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    bigChipText: { fontSize: 15, color: c.onBrandSecondary },
    deleteLink: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      marginTop: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.error,
      backgroundColor: c.surfaceTertiary,
    },
    deleteLinkText: { fontSize: 15, color: c.error },
    delIconWrap: {
      width: 60, height: 60, borderRadius: radius.pill,
      backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center",
      alignSelf: "center", marginTop: spacing.sm,
    },
    delText: { fontSize: 15, color: c.onSurface, textAlign: "center", lineHeight: 22 },
    delConfirmBtn: {
      minHeight: 50, borderRadius: radius.md, backgroundColor: c.error,
      alignItems: "center", justifyContent: "center", marginTop: spacing.xs,
    },
    delConfirmText: { fontSize: 16, color: c.onBrand },
    noteInput: {      minHeight: 120,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      fontFamily: fonts.regular,
      fontSize: 16,
      color: c.onSurface,
      textAlignVertical: "top",
      backgroundColor: c.surfaceSecondary,
    },
  });
}
