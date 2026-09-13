import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ArrowBendUpLeft,
  CheckCircle,
  CurrencyEur,
  NotePencil,
  Storefront,
  X,
} from "phosphor-react-native";

import { apiPost, Client, Company } from "@/src/api";
import { AppText, Button } from "@/src/components/ui";
import { fonts, radius, spacing, useTheme } from "@/src/theme";

export type QuickActionsRef = {
  present: (client: Client) => void;
  dismiss: () => void;
};

type Mode = "main" | "order" | "reschedule" | "note";

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
    onSuccess: (message: string) => void;
    onError: (message: string) => void;
  }
>(function QuickActionsSheet({ companies, onSuccess, onError }, ref) {
  const modalRef = useRef<BottomSheetModal>(null);
  const { colors } = useTheme();
  const [client, setClient] = useState<Client | null>(null);
  const [mode, setMode] = useState<Mode>("main");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useImperativeHandle(ref, () => ({
    present: (c: Client) => {
      setClient(c);
      setMode("main");
      setNote("");
      modalRef.current?.present();
    },
    dismiss: () => modalRef.current?.dismiss(),
  }));

  const snapPoints = useMemo(() => ["55%", "88%"], []);

  async function submit(payload: any, successMsg: string) {
    if (!client || busy) return;
    setBusy(true);
    try {
      await apiPost("/events", { client_id: client.id, ...payload });
      modalRef.current?.dismiss();
      onSuccess(successMsg);
    } catch (e: any) {
      onError(e?.detail || "Operazione non riuscita");
    } finally {
      setBusy(false);
    }
  }

  const styles = makeSheetStyles(colors);

  function Header({ title }: { title: string }) {
    return (
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText weight="bold" style={styles.title} numberOfLines={1}>
            {title}
          </AppText>
          {client ? (
            <AppText style={styles.subtitle} numberOfLines={1}>
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
              ? "Ordine effettuato"
              : mode === "reschedule"
              ? "Visita rimandata"
              : "Nota della visita"
          }
        />

        {mode === "main" ? (
          <View style={styles.grid}>
            <ActionTile
              testID="action-visitato"
              icon={<CheckCircle size={26} color={colors.onBrand} weight="fill" />}
              label="Visitato"
              color={colors.brand}
              bg={colors.brandSecondary}
              onPress={() => submit({ type: "visit" }, "Visita registrata")}
            />
            <ActionTile
              testID="action-ordine"
              icon={<Storefront size={26} color={colors.onBrand} weight="fill" />}
              label="Ordine effettuato"
              color={colors.brandPrimary}
              bg={colors.brandSecondary}
              onPress={() => setMode("order")}
            />
            <ActionTile
              testID="action-incassato"
              icon={<CurrencyEur size={26} color={colors.onSuccess} weight="fill" />}
              label="Incassato"
              color={colors.success}
              bg={colors.brandSecondary}
              onPress={() => submit({ type: "collection" }, "Incasso registrato")}
            />
            <ActionTile
              testID="action-rimandata"
              icon={<ArrowBendUpLeft size={26} color={colors.onWarning} weight="fill" />}
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

        {mode === "order" ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.xl, gap: spacing.sm }}>
            <AppText style={styles.hint}>Seleziona l&apos;azienda dell&apos;ordine</AppText>
            {companies.map((co) => (
              <Pressable
                key={co.id}
                testID={`order-company-${co.id}`}
                disabled={busy}
                onPress={() => submit({ type: "order", company_id: co.id }, `Ordine ${co.name} registrato`)}
                style={({ pressed }) => [styles.rowItem, pressed && { opacity: 0.7 }]}
              >
                <Storefront size={20} color={colors.brand} weight="bold" />
                <AppText weight="semibold" style={styles.rowItemText}>{co.name}</AppText>
              </Pressable>
            ))}
          </ScrollView>
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
    container: { flex: 1, paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
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
    chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
    bigChip: {
      width: "47.5%",
      backgroundColor: c.brandSecondary,
      borderRadius: radius.md,
      paddingVertical: spacing.lg,
      alignItems: "center",
    },
    bigChipText: { fontSize: 15, color: c.onBrandSecondary },
    noteInput: {
      minHeight: 120,
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
